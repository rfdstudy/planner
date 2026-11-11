export type PlatformKind = 'electron' | 'browser'

/** Filtre proposé dans la boîte d'enregistrement du système. */
export interface SaveTextFileFilter {
  name: string
  extensions: string[]
}

export interface SaveTextFileRequest {
  fileName: string
  content: string
  mimeType: string
  filters?: SaveTextFileFilter[]
}

export interface SaveTextFileResult {
  saved: boolean
  filePath?: string
}

export interface OpenTextFileRequest {
  filters?: SaveTextFileFilter[]
}

export interface OpenTextFileResult {
  content: string
  fileName: string
  filePath?: string
}

export interface AutoBackupRequest {
  /** Contenu JSON complet de la sauvegarde. */
  content: string
}

export interface AutoBackupResult {
  saved: boolean
  filePath?: string
}

/**
 * Point d'entrée unique vers les capacités de la plateforme.
 * Les méthodes sont ajoutées au fil des jalons.
 */
export interface Platform {
  readonly kind: PlatformKind
  /** Ouvre un enregistrement de fichier natif ou télécharge le contenu. */
  saveTextFile: (request: SaveTextFileRequest) => Promise<SaveTextFileResult>
  /** Ouvre un fichier texte natif, ou un sélecteur de fichier dans le navigateur. */
  openTextFile: (request: OpenTextFileRequest) => Promise<OpenTextFileResult | null>
  /** Écrit une copie automatique dans le dossier de données (Electron). */
  saveAutoBackup: (request: AutoBackupRequest) => Promise<AutoBackupResult>
}
