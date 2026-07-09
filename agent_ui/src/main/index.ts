import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn, ChildProcess } from 'child_process'
import { dialog } from 'electron'
import { readFileSync, writeFileSync, createWriteStream, WriteStream } from 'fs'

let mainWindow: BrowserWindow | null = null
let adkServer: ChildProcess | null = null
let logStream: WriteStream | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// The directory that holds .venv/, snuc_agent/ and config.ini.
// - dev: the repo root (parent of agent_ui/)
// - packaged: the folder containing the executable/bundle. app.getAppPath()
//   is NOT usable there — it points inside the read-only app.asar archive.
//   - Windows portable: runs from a temp copy, so prefer the original
//     location electron-builder exposes via PORTABLE_EXECUTABLE_DIR.
//   - macOS: process.execPath is .../agent_ui.app/Contents/MacOS/agent_ui,
//     three levels below the .app itself — .venv/ and snuc_agent/ are expected
//     next to the .app bundle, not inside Contents/MacOS.
function getBaseDir(): string {
  if (is.dev) return join(app.getAppPath(), '..')
  if (process.env['PORTABLE_EXECUTABLE_DIR']) return process.env['PORTABLE_EXECUTABLE_DIR']
  if (process.platform === 'darwin') return join(dirname(process.execPath), '..', '..', '..')
  return dirname(process.execPath)
}

function getAdkPath(): string {
  return process.platform === 'win32'
    ? join(getBaseDir(), '.venv', 'Scripts', 'adk.exe')
    : join(getBaseDir(), '.venv', 'bin', 'adk')
}

// Lazily opened once per app launch (truncating any previous run's log),
// then reused as-is across adk:restart calls so a restart's output appends
// to the same file instead of starting a new one.
function getLogStream(): WriteStream {
  if (!logStream) {
    logStream = createWriteStream(join(getBaseDir(), 'adk-logs.txt'), { flags: 'w' })
    logStream.on('error', (err) => {
      console.error('Failed to write adk-logs.txt:', err)
    })
  }
  return logStream
}

function startAdkServer(adkPath: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    // No shell is involved, so the argument must not carry literal quotes.
    // cwd anchors the relative agents dir, the agent's config.ini read and
    // ADK's session storage — a double-clicked app inherits an arbitrary cwd.
    const cmd = spawn(adkPath, ['api_server', 'snuc_agent', '--allow_origins=*'], {
      cwd: getBaseDir()
    })

    cmd.once('spawn', () => resolve(cmd))
    cmd.once('error', reject)
  })
}

async function checkHealth(retryAttempt: number): Promise<boolean> {
  for (let i = 0; i <= retryAttempt; i++) {
    try {
      console.log('Health Check Attempt:', i)

      const res = await fetch('http://127.0.0.1:8000/health')
      const data = await res.json()

      if (data.status === 'ok') {
        return true
      }
    } catch {
      // Ignore and retry
    }

    // Wait 500ms before the next attempt (except after the last one)
    if (i < retryAttempt) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  throw new Error('Health check failed')
}

async function spawnAdk(): Promise<void> {
  adkServer = await startAdkServer(getAdkPath())

  adkServer?.stdout?.on('data', (data) => {
    console.log(`[backend] ${data}`)
    getLogStream().write(data)
  })

  adkServer?.stderr?.on('data', (data) => {
    console.error(`[backend] ${data}`)
    getLogStream().write(data)
  })
}

// Used by adk:restart, which needs to block until the freshly-restarted
// server is actually serving requests. Boot uses spawnAdk() alone instead —
// see the app.whenReady() handler below.
async function launchAdk(): Promise<void> {
  await spawnAdk()
  await checkHealth(50)
}

async function stopAdk(): Promise<void> {
  if (adkServer && !adkServer.killed && adkServer.exitCode === null) {
    const exited = new Promise<void>((resolve) => adkServer?.once('exit', () => resolve()))
    adkServer.kill()
    await exited
  }
  adkServer = null
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.snuc.agent')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      defaultPath: join(app.getPath('downloads'), item.getFilename())
    })
    item.once('done', (_doneEvent, state) => {
      mainWindow?.webContents.send('download:done', { state, file: item.getFilename() })
    })
  })

  ipcMain.handle('download:start', (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return
    mainWindow?.webContents.downloadURL(url)
  })

  ipcMain.handle('config:read', async () => {
    return readFileSync(join(getBaseDir(), 'config.ini'), 'utf8')
  })

  ipcMain.handle('config:write', async (_event, text: unknown) => {
    if (typeof text !== 'string') throw new Error('Invalid config payload')
    writeFileSync(join(getBaseDir(), 'config.ini'), text, 'utf8')
  })

  // Restarts the ADK server so config.ini changes (model provider/key)
  // take effect — the agent reads its config at import time.
  ipcMain.handle('adk:restart', async () => {
    await stopAdk()
    await launchAdk()
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  try {
    // Health-checking is the renderer's job now (see useAdkBoot): the window
    // shows immediately and polls /health itself, instead of the app
    // appearing to hang for up to ~25s before a window ever exists.
    await spawnAdk()
    createWindow()
  } catch (err) {
    const error = err as NodeJS.ErrnoException
    let message: string

    if (error.code === 'ENOENT') {
      message =
        'Virtual Environment missing or damaged. Please run install.py and try again'
    } else {
      message =
        'Failed to start the ADK Server. Please check the logs in adk-logs.txt and try again.'
    }

    await dialog.showMessageBox({
      type: 'error',
      title: 'Failed to start ADK Server',
      message,
      buttons: ['OK']
    })

    app.quit()
  }
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await stopAdk()
  logStream?.end()
  logStream = null
})
