import type { Platform, SaveTextFileRequest, SaveTextFileResult } from './types'

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

export const browserPlatform: Platform = {
  kind: 'browser',
  saveTextFile: async (request) => downloadFile(request)
}
