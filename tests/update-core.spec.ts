import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  createDailyGate,
  errorMessage,
  fetchRegistryTags,
  LAST_CHECK_KEY,
  localDay,
  readReleaseVersion,
  REGISTRY_URL,
  registryTagsOf,
  targetVersionOf,
  updateAvailable,
  updateCommand,
  type StorageLike,
} from '../src/client/update-core.ts'

describe('registry document parsing', () => {
  it('reads latest and a newer next tag', () => {
    expect(registryTagsOf({
      'dist-tags': { latest: '0.2.2-rc.1', next: '0.2.2-rc.2' },
    })).toEqual({ latest: '0.2.2-rc.1', next: '0.2.2-rc.2' })
  })

  it('drops a next tag that already equals latest', () => {
    expect(registryTagsOf({
      'dist-tags': { latest: '0.2.1-rc.5', next: '0.2.1-rc.5' },
    })).toEqual({ latest: '0.2.1-rc.5', next: null })
  })

  it('drops a next tag older than latest', () => {
    expect(registryTagsOf({
      'dist-tags': { latest: '0.2.2-rc.2', next: '0.2.2-rc.1' },
    })).toEqual({ latest: '0.2.2-rc.2', next: null })
  })

  it.each([
    ['missing next', { latest: '0.2.1-rc.5' }],
    ['blank next', { latest: '0.2.1-rc.5', next: '   ' }],
    ['non-string next', { latest: '0.2.1-rc.5', next: 5 }],
  ])('treats %s as absent', (_label, tags) => {
    expect(registryTagsOf({ 'dist-tags': tags })).toEqual({ latest: '0.2.1-rc.5', next: null })
  })

  it.each([
    ['not an object', 'nope'],
    ['no dist-tags', {}],
    ['dist-tags is not an object', { 'dist-tags': [] }],
    ['no latest', { 'dist-tags': { alpha: '0.2.2-alpha.2' } }],
    ['blank latest', { 'dist-tags': { latest: '   ' } }],
  ])('rejects %s', (_label, payload) => {
    expect(() => registryTagsOf(payload)).toThrow()
  })

  it('prefers a newer next tag as the install target', () => {
    expect(targetVersionOf({ latest: '0.2.2-rc.1', next: '0.2.2-rc.2' })).toBe('0.2.2-rc.2')
    expect(targetVersionOf({ latest: '0.2.2-rc.1', next: null })).toBe('0.2.2-rc.1')
  })
})

describe('fetchRegistryTags', () => {
  it('requests the canonical URL with a no-store JSON read', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(REGISTRY_URL)
      expect(init?.headers).toEqual({ accept: 'application/json' })
      expect(init?.cache).toBe('no-store')
      return {
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '0.2.2-rc.1', next: '0.2.2-rc.2' } }),
      }
    })
    await expect(fetchRegistryTags(fetchImpl)).resolves.toEqual({
      latest: '0.2.2-rc.1',
      next: '0.2.2-rc.2',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('reports a non-2xx response', async () => {
    await expect(fetchRegistryTags(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))).rejects.toThrow('HTTP 503')
  })

  it('reports an unusable document', async () => {
    await expect(fetchRegistryTags(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': {} }),
    }))).rejects.toThrow('latest dist-tag')
  })
})

describe('version ordering', () => {
  it.each([
    ['0.2.1-rc.2', '0.2.1-rc.5'],
    ['0.2.1-rc.9', '0.2.1-rc.10'],
    ['0.2.1-alpha.2', '0.2.1-rc.1'],
    ['0.2.1-rc.5', '0.2.1'],
    ['0.2.1', '0.2.2-rc.1'],
    ['0.2.1-rc.5', '0.2.2-alpha.1'],
  ])('orders %s before %s', (older, newer) => {
    expect(compareVersions(older, newer)).toBe(-1)
    expect(compareVersions(newer, older)).toBe(1)
  })

  it('treats equal versions and differing build metadata as equal', () => {
    expect(compareVersions('0.2.1-rc.5', '0.2.1-rc.5')).toBe(0)
    expect(compareVersions('0.2.1-rc.5+abc', '0.2.1-rc.5')).toBe(0)
  })

  it('orders a prerelease with more identifiers after its prefix', () => {
    expect(compareVersions('0.2.1-rc.5', '0.2.1-rc.5.1')).toBe(-1)
  })
})

describe('release and update comparison', () => {
  it('reads a non-empty release version', () => {
    expect(readReleaseVersion({ release: { version: '0.2.1-rc.2' } })).toBe('0.2.1-rc.2')
  })

  it.each([
    ['missing release', {}],
    ['non-object release', { release: '0.2.1-rc.2' }],
    ['missing version', { release: {} }],
    ['non-string version', { release: { version: 2 } }],
    ['blank version', { release: { version: '  ' } }],
    ['null', null],
  ])('returns null for %s', (_label, value) => {
    expect(readReleaseVersion(value)).toBeNull()
  })

  it('treats only a known, older version as an update', () => {
    expect(updateAvailable('0.2.1-rc.2', '0.2.1-rc.5')).toBe(true)
    expect(updateAvailable('0.2.1-rc.5', '0.2.1-rc.5')).toBe(false)
    expect(updateAvailable('0.2.2-rc.2', '0.2.2-rc.1')).toBe(false)
    expect(updateAvailable(null, '0.2.1-rc.5')).toBe(false)
  })

  it('formats the exact upgrade command', () => {
    expect(updateCommand('0.2.2-rc.2')).toBe('npm install -g @deepseek-ai/dsh@0.2.2-rc.2')
  })
})

describe('daily gate', () => {
  /** In-memory storage double. */
  function storage(): StorageLike & { values: Map<string, string> } {
    const values = new Map<string, string>()
    return {
      values,
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
  }

  it('allows one check per local calendar day', () => {
    const store = storage()
    const today = (): Date => new Date(2026, 10, 2, 23, 59)
    const gate = createDailyGate(store, today)
    expect(gate.canCheck()).toBe(true)
    gate.markChecked()
    expect(store.values.get(LAST_CHECK_KEY)).toBe('2026-11-02')
    expect(gate.canCheck()).toBe(false)

    const tomorrow = createDailyGate(store, () => new Date(2026, 10, 3, 0, 1))
    expect(tomorrow.canCheck()).toBe(true)
  })

  it('uses a zero-padded local date', () => {
    expect(localDay(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })

  it('stays usable when storage fails', () => {
    const gate = createDailyGate({
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(gate.canCheck()).toBe(true)
    expect(() => gate.markChecked()).not.toThrow()
  })

  it('checks every load when storage is absent', () => {
    const gate = createDailyGate(null)
    expect(gate.canCheck()).toBe(true)
    expect(() => gate.markChecked()).not.toThrow()
  })
})

describe('errorMessage', () => {
  it('uses Error messages and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('text')).toBe('text')
    expect(errorMessage(42)).toBe('42')
  })
})
