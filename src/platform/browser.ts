import type {
  OpenTextFileRequest,
  OpenTextFileResult,
  Platform,
  SaveTextFileFilter,
  SaveTextFileRequest,
  SaveTextFileResult
} from './types'

function downloadFile(request: SaveTextFileRequest): SaveTextFileResult {
  const blob = new Blob([request.content], { type: request.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = request.fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { saved: true }
}

function acceptAttribute(filters: readonly SaveTextFileFilter[] | undefined): string {
  if (filters === undefined) return ''

  return filters
    .flatMap((filter) => filter.extensions.map((extension) => `.${extension}`))
    .join(',')
}

function pickTextFile(request: OpenTextFileRequest): Promise<OpenTextFileResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false

    const handleWindowFocus = (): void => {
      // Certains navigateurs ne signalent pas l'annulation du sélecteur :
      // au retour du focus, une sélection vide vaut annulation.
      window.setTimeout(() => {
        if (!settled && (input.files?.length ?? 0) === 0) finish(null)
      }, 300)
    }

    const finish = (result: OpenTextFileResult | null): void => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', handleWindowFocus)
      input.remove()
      resolve(result)
    }

    input.type = 'file'
    input.accept = acceptAttribute(request.filters)
    input.style.display = 'none'

    input.addEventListener('change', () => {
      const file = input.files?.[0]

      if (file === undefined) {
        finish(null)
        return
      }

      file
        .text()
        .then((content) => finish({ content, fileName: file.name }))
        .catch((error: unknown) => {
          if (!settled) {
            settled = true
            input.remove()
            reject(error)
          }
        })
    })

    // Chromium signale l'annulation du sélecteur ; les autres navigateurs
    // laissent simplement la promesse en attente jusqu'à la prochaine fois.
    input.addEventListener('cancel', () => finish(null))
    window.addEventListener('focus', handleWindowFocus, { once: true })

    document.body.append(input)
    input.click()
  })
}

export const browserPlatform: Platform = {
  kind: 'browser',
  saveTextFile: async (request) => downloadFile(request),
  savePhoneSnapshot: async (request) => downloadFile(request),
  openTextFile: (request) => pickTextFile(request),
  // Le navigateur n'a pas de dossier de données : la copie automatique est
  // réservée à l'application Electron.
  saveAutoBackup: async () => ({ saved: false })
}
