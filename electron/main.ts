import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type {
  SaveTextFileFilter,
  SaveTextFileRequest,
  SaveTextFileResult
} from '../src/platform/types'

const APP_ID = 'com.planner.app'
const SAVE_TEXT_FILE_CHANNEL = 'planner:save-text-file'

let mainWindow: BrowserWindow | null = null

function readFilters(value: unknown): SaveTextFileFilter[] | undefined {
  if (!Array.isArray(value)) return undefined

  const filters = value.filter(
    (filter): filter is SaveTextFileFilter =>
      typeof filter === 'object' &&
      filter !== null &&
      typeof (filter as SaveTextFileFilter).name === 'string' &&
      Array.isArray((filter as SaveTextFileFilter).extensions) &&
      (filter as SaveTextFileFilter).extensions.every((extension) => typeof extension === 'string')
  )

  return filters.length === 0 ? undefined : filters
}

function isSaveTextFileRequest(value: unknown): value is SaveTextFileRequest {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<SaveTextFileRequest>
  return typeof candidate.fileName === 'string' && typeof candidate.content === 'string'
}

async function handleSaveTextFile(
  event: IpcMainInvokeEvent,
  value: unknown
): Promise<SaveTextFileResult> {
  if (!isSaveTextFileRequest(value)) {
    throw new Error('Demande d’enregistrement invalide.')
  }

  const owner = BrowserWindow.fromWebContents(event.sender)
  const options = {
    title: 'Exporter la sauvegarde',
    defaultPath: join(app.getPath('documents'), value.fileName),
    filters: readFilters(value.filters)
  }
  const result =
    owner === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(owner, options)

  if (result.canceled || result.filePath === undefined) {
    return { saved: false }
  }

  await writeFile(result.filePath, value.content, 'utf8')
  return { saved: true, filePath: result.filePath }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Planner',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Toute ouverture de fenêtre est refusée ; les liens HTTP(S) partent dans
  // le navigateur du système.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)

    ipcMain.handle(SAVE_TEXT_FILE_CHANNEL, handleSaveTextFile)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
