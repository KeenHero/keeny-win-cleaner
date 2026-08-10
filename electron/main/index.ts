import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { CleanRequest, ScanOptions } from '../../src/types'
import { cleanSystem, scanSystem } from './cleaner'
import { configureHistoryStore } from './history'
import { closeApps } from './locks'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

function isAdministrator(): boolean {
  if (process.platform !== 'win32') return false
  try {
    execFileSync('net.exe', ['session'], { stdio: 'ignore', windowsHide: true, timeout: 4_000 })
    return true
  } catch {
    return false
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#07110f',
    title: 'KeenyWinCleaner',
    show: false,
    webPreferences: {
      preload: path.join(currentDir, 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(currentDir, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  configureHistoryStore(app.getPath('userData'))

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    osRelease: os.release(),
    isAdmin: isAdministrator(),
  }))

  ipcMain.handle('cleaner:scan', async (event, options: ScanOptions) => {
    return scanSystem(options, (progress) => event.sender.send('cleaner:scan-progress', progress))
  })
  ipcMain.handle('cleaner:clean', (_event, request: CleanRequest) => cleanSystem(request))
  ipcMain.handle('cleaner:close-apps', (_event, processIds: number[]) => closeApps(processIds))
  ipcMain.handle('shell:open-path', (_event, candidate: string) => shell.openPath(candidate))
  ipcMain.handle('shell:storage-settings', () => shell.openExternal('ms-settings:storagesense'))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
