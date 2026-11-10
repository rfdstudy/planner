import { describe, expect, it } from 'vitest'
import { browserPlatform } from '../src/platform/browser'
import { electronPlatform } from '../src/platform/electron'
import { resolvePlatform } from '../src/platform'

describe('resolvePlatform', () => {
  it('renvoie l’implémentation Electron dans Electron', () => {
    expect(resolvePlatform(true)).toBe(electronPlatform)
  })

  it('renvoie l’implémentation navigateur ailleurs', () => {
    expect(resolvePlatform(false)).toBe(browserPlatform)
  })
})
