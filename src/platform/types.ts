export type PlatformKind = 'electron' | 'browser'

/**
 * Point d'entrée unique vers les capacités de la plateforme.
 * Les méthodes seront ajoutées au fil des jalons (sauvegarde fichier, etc.).
 */
export interface Platform {
  readonly kind: PlatformKind
}
