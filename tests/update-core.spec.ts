import { describe, expect, it, vi } from 'vitest'
import {
  createDailyGate,
  errorMessage,
  fetchLatestVersion,
  LAST_CHECK_KEY,
  latestVersionOf,
  localDay,
  readReleaseVersion,
  REGISTRY_URL,
  updateAvailable,
  updateCommand,
  type StorageLike,
} from '../src/client/update-core.ts'

describe('registry document parsing', () => {
  it('reads the latest dist-tag', () => {
    expect(latestVersionOf({ 'dist-tags': { latest: '0.2.1-rc.5', alpha: '0.2.2-alpha.2' } }))
      .toBe('0.2.1-rc.5')
  })

  it.each([
    ['not an object', 'nope'],
    ['no dist-tags', {}],
    ['dist-tags is not an object', { 'dist-tags': [] }],
    ['no latest', { 'dist-tags': { alpha: '0.2.2-alpha.2' } }],
    ['blank latest', { 'dist-tags': { latest: '   ' } }],
  ])('rejects %s', (_label, payload) => {
    expect(() => latestVersionOf(payload)).toThrow()
  })
})

describe('fetchLatestVersion', () => {
  it('requests the canonical URL with a no-store JSON read', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(REGISTRY_URL)
      expect(init?.headers).toEqual({ accept: 'application/json' })
      expect(init?.cache).toBe('no-store')
      return {
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '0.2.1-rc.5' } }),
      }
    })
    await expect(fetchLatestVersion(fetchImpl)).resolves.toBe('0.2.1-rc.5')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('reports a non-2xx response', async () => {
    await expect(fetchLatestVersion(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))).rejects.toThrow('HTTP 503')
  })

  it('reports an unusable document', async () => {
    await expect(fetchLatestVersion(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': {} }),
    }))).rejects.toThrow('latest dist-tag')
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

  it('treats only a known, unequal version as an update', () => {
    expect(updateAvailable('0.2.1-rc.2', '0.2.1-rc.5')).toBe(true)
    expect(updateAvailable('0.2.1-rc.5', '0.2.1-rc.5')).toBe(false)
    expect(updateAvailable(null, '0.2.1-rc.5')).toBe(false)
  })

  it('formats the exact upgrade command', () => {
    expect(updateCommand('0.2.1-rc.5')).toBe('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')
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
