import { contextBridge, ipcRenderer } from 'electron'
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
  SaveTextFileRequest,
  SaveTextFileResult
} from '../src/platform/types'

// Seuls points d'entrée natifs exposés au renderer. Aucun accès direct au
// système de fichiers n'est donné à l'interface.
contextBridge.exposeInMainWorld('planner', {
  isElectron: true,
  saveTextFile: (request: SaveTextFileRequest): Promise<SaveTextFileResult> =>
    ipcRenderer.invoke(SAVE_TEXT_FILE_CHANNEL, request),
  savePhoneSnapshot: (request: SaveTextFileRequest): Promise<SaveTextFileResult> =>
    ipcRenderer.invoke(SAVE_PHONE_SNAPSHOT_CHANNEL, request),
  openTextFile: (request: OpenTextFileRequest): Promise<OpenTextFileResult | null> =>
    ipcRenderer.invoke(OPEN_TEXT_FILE_CHANNEL, request),
  saveAutoBackup: (request: AutoBackupRequest): Promise<AutoBackupResult> =>
    ipcRenderer.invoke(AUTO_BACKUP_CHANNEL, request)
})
