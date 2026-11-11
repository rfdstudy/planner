import type { Platform } from './types'

export const electronPlatform: Platform = {
  kind: 'electron',
  saveTextFile: async (request) => {
    const saveTextFile = window.planner?.saveTextFile

    if (saveTextFile === undefined) {
      throw new Error('L’enregistrement de fichier n’est pas disponible.')
    }

    return saveTextFile(request)
  },
  openTextFile: async (request) => {
    const openTextFile = window.planner?.openTextFile

    if (openTextFile === undefined) {
      throw new Error('L’ouverture de fichier n’est pas disponible.')
    }

    return openTextFile(request)
  },
  saveAutoBackup: async (request) => {
    const saveAutoBackup = window.planner?.saveAutoBackup

    if (saveAutoBackup === undefined) {
      return { saved: false }
    }

    return saveAutoBackup(request)
  }
}
