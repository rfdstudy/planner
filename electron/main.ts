import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoBackupFileName, selectAutoBackupsToDelete } from '../src/core/backupRetention'
import {
  AUTO_BACKUP_CHANNEL,
  OPEN_TEXT_FILE_CHANNEL,
  SAVE_PHONE_SNAPSHOT_CHANNEL,
  SAVE_TEXT_FILE_CHANNEL
} from '../src/platform/channels'
import type {
  AutoBackupRequest,
  AutoBackupResult,
  OpenTextFileRequest,
  OpenTextFileResult,
  SaveTextFileFilter,
  SaveTextFileRequest,
  SaveTextFileResult
} from '../src/platform/types'

const APP_ID = 'com.planner.app'
const AUTO_BACKUP_DIRECTORY = 'sauvegardes'
const PHONE_SNAPSHOT_DIRECTORY_FILE = 'phone-snapshot-directory.txt'
const MAX_IMPORT_BYTES = 50 * 1024 * 1024
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

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

function isOpenTextFileRequest(value: unknown): value is OpenTextFileRequest {
  return typeof value === 'object' && value !== null
}

function isAutoBackupRequest(value: unknown): value is AutoBackupRequest {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<AutoBackupRequest>
  return typeof candidate.content === 'string'
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

async function readPhoneSnapshotDirectory(): Promise<string | null> {
  try {
    const directory = (
      await readFile(join(app.getPath('userData'), PHONE_SNAPSHOT_DIRECTORY_FILE), 'utf8')
    ).trim()

    if (directory.length === 0) return null

    const information = await stat(directory)
    return information.isDirectory() ? directory : null
  } catch {
    return null
  }
}

async function rememberPhoneSnapshotDirectory(filePath: string): Promise<void> {
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(
      join(app.getPath('userData'), PHONE_SNAPSHOT_DIRECTORY_FILE),
      dirname(filePath),
      'utf8'
    )
  } catch {
    // Mémoriser le dossier est un confort : un échec ne doit pas annuler
    // l'export déjà écrit sur le disque.
  }
}

async function handleSavePhoneSnapshot(
  event: IpcMainInvokeEvent,
  value: unknown
): Promise<SaveTextFileResult> {
  if (!isSaveTextFileRequest(value)) {
    throw new Error('Demande d’export pour le téléphone invalide.')
  }

  const fileName = basename(value.fileName)

  if (fileName.length === 0 || fileName === '.' || fileName === '..') {
    throw new Error('Le nom du fichier d’instantané est invalide.')
  }

  if (Buffer.byteLength(value.content, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error('L’instantané pour le téléphone est trop volumineux.')
  }

  const owner = BrowserWindow.fromWebContents(event.sender)
  const lastDirectory = await readPhoneSnapshotDirectory()
  const defaultPath =
    lastDirectory === null
      ? join(app.getPath('documents'), fileName)
      : join(lastDirectory, fileName)
  const options = {
    title: 'Exporter pour le téléphone',
    defaultPath,
    filters: readFilters(value.filters) ?? [{ name: 'Instantané Planner', extensions: ['json'] }]
  }
  const result =
    owner === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(owner, options)

  if (result.canceled || result.filePath === undefined) {
    return { saved: false }
  }

  await writeFile(result.filePath, value.content, 'utf8')
  await rememberPhoneSnapshotDirectory(result.filePath)

  return { saved: true, filePath: result.filePath }
}

async function handleOpenTextFile(
  event: IpcMainInvokeEvent,
  value: unknown
): Promise<OpenTextFileResult | null> {
  if (!isOpenTextFileRequest(value)) {
    throw new Error('Demande de lecture invalide.')
  }

  const owner = BrowserWindow.fromWebContents(event.sender)
  const options: OpenDialogOptions = {
    title: 'Importer une sauvegarde',
    properties: ['openFile'],
    filters: readFilters(value.filters)
  }
  const result =
    owner === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(owner, options)

  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const fileStat = await stat(filePath)

  if (fileStat.size > MAX_IMPORT_BYTES) {
    throw new Error('Ce fichier de sauvegarde est trop volumineux.')
  }

  const content = await readFile(filePath, 'utf8')
  return { content, fileName: basename(filePath), filePath }
}

async function handleAutoBackup(
  _event: IpcMainInvokeEvent,
  value: unknown
): Promise<AutoBackupResult> {
  if (!isAutoBackupRequest(value)) {
    throw new Error('Demande de sauvegarde automatique invalide.')
  }

  if (Buffer.byteLength(value.content, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error('La sauvegarde automatique est trop volumineuse.')
  }

  const directory = join(app.getPath('userData'), AUTO_BACKUP_DIRECTORY)
  await mkdir(directory, { recursive: true })

  const filePath = join(directory, autoBackupFileName())
  await writeFile(filePath, value.content, 'utf8')

  const entries = await readdir(directory, { withFileTypes: true })
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const obsolete = selectAutoBackupsToDelete(fileNames)

  await Promise.all(
    obsolete.map((fileName) => unlink(join(directory, fileName)).catch(() => undefined))
  )

  return { saved: true, filePath }
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
    ipcMain.handle(SAVE_PHONE_SNAPSHOT_CHANNEL, handleSavePhoneSnapshot)
    ipcMain.handle(OPEN_TEXT_FILE_CHANNEL, handleOpenTextFile)
    ipcMain.handle(AUTO_BACKUP_CHANNEL, handleAutoBackup)

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
