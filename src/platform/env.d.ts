import type { SaveTextFileRequest, SaveTextFileResult } from './types'

export {}

declare global {
  interface Window {
    planner?: {
      readonly isElectron: boolean
      saveTextFile?: (request: SaveTextFileRequest) => Promise<SaveTextFileResult>
    }
  }
}
