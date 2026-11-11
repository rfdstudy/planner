import type {
  AutoBackupRequest,
  AutoBackupResult,
  OpenTextFileRequest,
  OpenTextFileResult,
  SaveTextFileRequest,
  SaveTextFileResult
} from './types'

export {}

declare global {
  interface Window {
    planner?: {
      readonly isElectron: boolean
      saveTextFile?: (request: SaveTextFileRequest) => Promise<SaveTextFileResult>
      openTextFile?: (request: OpenTextFileRequest) => Promise<OpenTextFileResult | null>
      saveAutoBackup?: (request: AutoBackupRequest) => Promise<AutoBackupResult>
    }
  }
}
