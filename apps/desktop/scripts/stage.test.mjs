import { describe, expect, it } from 'vitest'
import { lockedVersions, packageVersion } from './stage.mjs'

const lock = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      typescript:
        specifier: ^5.6.3
        version: 5.9.3

  apps/api:
    dependencies:
      '@fastify/static':
        specifier: ^10.1.4
        version: 10.1.4
      playwright:
        specifier: ^1.49.0
        version: 1.62.1
      pino:
        specifier: ^9.5.0
        version: 9.14.0(supports-color@8.1.1)

  apps/dashboard:
    dependencies:
      next:
        specifier: ^16
        version: 16.0.0

packages:

  playwright-core@1.62.1:
    resolution: {integrity: sha512-x}

  '@img/sharp@0.33.0':
    resolution: {integrity: sha512-y}

  ms@2.1.2:
    resolution: {integrity: sha512-a}

  ms@2.1.3:
    resolution: {integrity: sha512-b}
`

describe('stage lockfile reading', () => {
  it('reads exact versions of apps/api deps, stripping peer suffixes, and stops at the next importer', () => {
    expect(lockedVersions(lock)).toEqual({ '@fastify/static': '10.1.4', playwright: '1.62.1', pino: '9.14.0' })
  })

  it('finds a transitive package only when one version is locked', () => {
    expect(packageVersion(lock, 'playwright-core')).toBe('1.62.1')
    expect(packageVersion(lock, '@img/sharp')).toBe('0.33.0')
    expect(packageVersion(lock, 'ms')).toBeNull()
    expect(packageVersion(lock, 'absent')).toBeNull()
  })
})
