import { contextBridge, ipcRenderer } from 'electron'
import type { CleanRequest, ScanOptions } from '../../src/types'

contextBridge.exposeInMainWorld('cleaner', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  scan: (options: ScanOptions) => ipcRenderer.invoke('cleaner:scan', options),
  clean: (request: CleanRequest) => ipcRenderer.invoke('cleaner:clean', request),
  closeApps: (processIds: number[]) => ipcRenderer.invoke('cleaner:close-apps', processIds),
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  openStorageSettings: () => ipcRenderer.invoke('shell:storage-settings'),
  onScanProgress: (listener: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => listener(progress)
    ipcRenderer.on('cleaner:scan-progress', handler)
    return () => ipcRenderer.removeListener('cleaner:scan-progress', handler)
  },
})
