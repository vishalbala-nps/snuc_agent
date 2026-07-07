import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface DownloadDoneInfo {
  state: 'completed' | 'cancelled' | 'interrupted'
  file: string
}

// Custom APIs for renderer
const api = {
  downloadUrl: (url: string): Promise<void> => ipcRenderer.invoke('download:start', url),
  onDownloadDone: (callback: (info: DownloadDoneInfo) => void): (() => void) => {
    const handler = (_event: unknown, info: DownloadDoneInfo): void => callback(info)
    ipcRenderer.on('download:done', handler)
    return () => ipcRenderer.removeListener('download:done', handler)
  },
  readConfig: (): Promise<string> => ipcRenderer.invoke('config:read'),
  writeConfig: (text: string): Promise<void> => ipcRenderer.invoke('config:write', text),
  restartAdk: (): Promise<void> => ipcRenderer.invoke('adk:restart')
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
