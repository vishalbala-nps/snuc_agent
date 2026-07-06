import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn, ChildProcess } from 'child_process'
import { dialog } from "electron";

let mainWindow: BrowserWindow | null = null
let adkServer: ChildProcess | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
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

function startAdkServer(adkPath: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const cmd = spawn(adkPath, [
      "api_server",
      "snuc_agent",
      '--allow_origins="*"'
    ]);

    cmd.once("spawn", () => resolve(cmd));
    cmd.once("error", reject);
  });
}

async function checkHealth(retryAttempt: number): Promise<boolean> {
  for (let i = 0; i <= retryAttempt; i++) {
    try {
      console.log("Health Check Attempt:", i);

      const res = await fetch("http://127.0.0.1:8000/health");
      const data = await res.json();

      if (data.status === "ok") {
        return true;
      }
    } catch {
      // Ignore and retry
    }

    // Wait 1 second before the next attempt (except after the last one)
    if (i < retryAttempt) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Health check failed");
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

const adkPath =
  process.platform === "win32"
    ? join(app.getAppPath(), "env", "Scripts", "adk.exe")
    : join(app.getAppPath(), "env", "bin", "adk");

  try {
    adkServer = await startAdkServer(adkPath);

    adkServer?.stdout?.on("data", (data) => {
      console.log(`[backend] ${data}`);
    });

    adkServer?.stderr?.on("data", (data) => {
      console.error(`[backend] ${data}`);
    });

    await checkHealth(50);
    createWindow();
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    let message: string;

    if (error.code === "ENOENT") {
      message =
        "Unable to find the Virtual Environment. Please configure the Virtual Environment and try again.";
    } else {
      message =
        "Failed to start the ADK Server. Please check the logs in adk-logs.txt and try again.";
    }

    await dialog.showMessageBox({
      type: "error",
      title: "Failed to start ADK Server",
      message,
      buttons: ["OK"],
    });

    app.quit();
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

app.on("before-quit", () => {
  if (adkServer && !adkServer.killed) {
    adkServer.kill();
  }
});