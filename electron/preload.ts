import { contextBridge, ipcRenderer } from 'electron'
import type { SaveTextFileRequest, SaveTextFileResult } from '../src/platform/types'

export const SAVE_TEXT_FILE_CHANNEL = 'planner:save-text-file'

// Seul point d'entrée natif exposé au renderer : l'enregistrement d'un fichier
// texte. Aucun accès direct au système de fichiers n'est donné à l'interface.
contextBridge.exposeInMainWorld('planner', {
  isElectron: true,
  saveTextFile: (request: SaveTextFileRequest): Promise<SaveTextFileResult> =>
    ipcRenderer.invoke(SAVE_TEXT_FILE_CHANNEL, request)
})
