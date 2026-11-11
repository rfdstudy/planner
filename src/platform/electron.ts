import type { Platform } from './types'

export const electronPlatform: Platform = {
  kind: 'electron',
  saveTextFile: async (request) => {
    const saveTextFile = window.planner?.saveTextFile

    if (saveTextFile === undefined) {
      throw new Error('L’enregistrement de fichier n’est pas disponible.')
    }

    return saveTextFile(request)
  }
}
