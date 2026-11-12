import { describe, expect, it, vi } from 'vitest'
import { UpdateController } from '../src/client/controller.ts'
import type { UpdateNotice } from '../src/client/notice.ts'
import type { CheckResult, DailyGate, RegistryTags } from '../src/client/update-core.ts'

/**
 * Build the controller with spies for its two sinks.
 * @param options - per-test overrides.
 * @returns the controller and its spies.
 */
function bench(options: {
  currentVersion?: string | null
  fetchTags?: () => Promise<RegistryTags>
  canCheck?: boolean
} = {}) {
  const notice: UpdateNotice = { show: vi.fn(), dispose: vi.fn() }
  const gate: DailyGate = { canCheck: vi.fn(() => options.canCheck ?? true), markChecked: vi.fn() }
  const log = vi.fn()
  const controller = new UpdateController({
    currentVersion: options.currentVersion === undefined ? '0.2.1-rc.2' : options.currentVersion,
    fetchTags: options.fetchTags ?? (async () => ({ latest: '0.2.1-rc.5', next: null })),
    notice,
    gate,
    now: () => new Date(1_700_000_000_000),
    log,
  })
  return { controller, notice, gate, log }
}

describe('UpdateController', () => {
  it('publishes a notice when a known version is behind latest', async () => {
    const { controller, notice, gate } = bench()
    const result = await controller.check()
    expect(result).toEqual<CheckResult>({
      currentVersion: '0.2.1-rc.2',
      latestVersion: '0.2.1-rc.5',
      nextVersion: null,
      targetVersion: '0.2.1-rc.5',
      updateAvailable: true,
      checkedAt: 1_700_000_000_000,
    })
    expect(notice.show).toHaveBeenCalledWith(result)
    expect(gate.markChecked).toHaveBeenCalledOnce()
    expect(controller.lastResult).toEqual(result)
  })

  it('publishes an update when latest is current but next is ahead', async () => {
    const { controller, notice } = bench({
      currentVersion: '0.2.2-rc.1',
      fetchTags: async () => ({ latest: '0.2.2-rc.1', next: '0.2.2-rc.2' }),
    })
    const result = await controller.check()
    expect(result).toMatchObject({
      currentVersion: '0.2.2-rc.1',
      latestVersion: '0.2.2-rc.1',
      nextVersion: '0.2.2-rc.2',
      targetVersion: '0.2.2-rc.2',
      updateAvailable: true,
    })
    expect(notice.show).toHaveBeenCalledWith(result)
  })

  it('does not publish when latest equals the running version', async () => {
    const { controller, notice } = bench({
      currentVersion: '0.2.1-rc.5',
      fetchTags: async () => ({ latest: '0.2.1-rc.5', next: null }),
    })
    const result = await controller.check()
    expect(result.updateAvailable).toBe(false)
    expect(notice.show).not.toHaveBeenCalled()
  })

  it('does not offer a downgrade when the running version is ahead', async () => {
    const { controller, notice } = bench({
      currentVersion: '0.2.2-rc.2',
      fetchTags: async () => ({ latest: '0.2.2-rc.1', next: '0.2.2-rc.2' }),
    })
    const result = await controller.check()
    expect(result).toMatchObject({ targetVersion: '0.2.2-rc.2', updateAvailable: false })
    expect(notice.show).not.toHaveBeenCalled()
  })

  it('does not treat an unknown current version as an update', async () => {
    const { controller, notice, gate } = bench({ currentVersion: null })
    const result = await controller.check()
    expect(result).toMatchObject({
      currentVersion: null,
      latestVersion: '0.2.1-rc.5',
      targetVersion: '0.2.1-rc.5',
      updateAvailable: false,
    })
    expect(notice.show).not.toHaveBeenCalled()
    expect(gate.markChecked).toHaveBeenCalledOnce()
  })

  it('shares one in-flight request', async () => {
    let resolve!: (tags: RegistryTags) => void
    const pending = new Promise<RegistryTags>((done) => { resolve = done })
    const fetchTags = vi.fn(() => pending)
    const { controller } = bench({ fetchTags })

    const first = controller.check()
    const second = controller.check()
    expect(fetchTags).toHaveBeenCalledOnce()
    resolve({ latest: '0.2.1-rc.5', next: null })
    await expect(first).resolves.toMatchObject({ updateAvailable: true })
    await expect(second).resolves.toBe(await first)
    expect(fetchTags).toHaveBeenCalledOnce()
  })

  it('skips the automatic path when the day is already used', async () => {
    const fetchTags = vi.fn(async () => ({ latest: '0.2.1-rc.5', next: null }))
    const { controller } = bench({ fetchTags, canCheck: false })
    await controller.autoCheck()
    expect(fetchTags).not.toHaveBeenCalled()
  })

  it('skips the automatic path when the running version is unknown', async () => {
    const fetchTags = vi.fn(async () => ({ latest: '0.2.1-rc.5', next: null }))
    const { controller } = bench({ fetchTags, currentVersion: null })
    await controller.autoCheck()
    expect(fetchTags).not.toHaveBeenCalled()
  })

  it('runs the automatic path and records the day', async () => {
    const { controller, gate, notice } = bench()
    await controller.autoCheck()
    expect(gate.canCheck).toHaveBeenCalledOnce()
    expect(gate.markChecked).toHaveBeenCalledOnce()
    expect(notice.show).toHaveBeenCalledOnce()
  })

  it('consumes the day before fetching and logs when the automatic check fails', async () => {
    const failure = new Error('offline')
    const { controller, gate, log } = bench({
      fetchTags: async () => { throw failure },
    })
    await expect(controller.autoCheck()).resolves.toBeUndefined()
    expect(gate.markChecked).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('dsh-check-for-update: automatic check failed', failure)
  })

  it('lets a manual check ignore the daily gate', async () => {
    const { controller, notice } = bench({ canCheck: false })
    await expect(controller.check()).resolves.toMatchObject({ updateAvailable: true })
    expect(notice.show).toHaveBeenCalledOnce()
  })

  it('does not publish after disposal', async () => {
    let resolve!: (tags: RegistryTags) => void
    const pending = new Promise<RegistryTags>((done) => { resolve = done })
    const { controller, notice, gate } = bench({ fetchTags: () => pending })
    const check = controller.check()
    controller.dispose()
    resolve({ latest: '0.2.1-rc.5', next: null })
    await expect(check).resolves.toMatchObject({ updateAvailable: true })
    expect(notice.show).not.toHaveBeenCalled()
    expect(gate.markChecked).not.toHaveBeenCalled()
  })
})
