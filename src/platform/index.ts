import { browserPlatform } from './browser'
import { electronPlatform } from './electron'
import type { Platform } from './types'

export type { Platform, PlatformKind } from './types'

export function resolvePlatform(isElectron: boolean): Platform {
  return isElectron ? electronPlatform : browserPlatform
}

export const platform: Platform = resolvePlatform(
  typeof window !== 'undefined' && window.planner?.isElectron === true
)
