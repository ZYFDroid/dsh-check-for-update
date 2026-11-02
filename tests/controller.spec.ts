import { describe, expect, it, vi } from 'vitest'
import { UpdateController } from '../src/client/controller.ts'
import type { UpdateNotice } from '../src/client/notice.ts'
import type { CheckResult, DailyGate } from '../src/client/update-core.ts'

/**
 * Build the controller with spies for its two sinks.
 * @param options - per-test overrides.
 * @returns the controller and its spies.
 */
function bench(options: {
  currentVersion?: string | null
  fetchLatest?: () => Promise<string>
  canCheck?: boolean
} = {}) {
  const notice: UpdateNotice = { show: vi.fn(), dispose: vi.fn() }
  const gate: DailyGate = { canCheck: vi.fn(() => options.canCheck ?? true), markChecked: vi.fn() }
  const log = vi.fn()
  const controller = new UpdateController({
    currentVersion: options.currentVersion === undefined ? '0.2.1-rc.2' : options.currentVersion,
    fetchLatest: options.fetchLatest ?? (async () => '0.2.1-rc.5'),
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
      updateAvailable: true,
      checkedAt: 1_700_000_000_000,
    })
    expect(notice.show).toHaveBeenCalledWith(result)
    expect(gate.markChecked).toHaveBeenCalledOnce()
    expect(controller.lastResult).toEqual(result)
  })

  it('does not publish when latest equals the running version', async () => {
    const { controller, notice } = bench({
      currentVersion: '0.2.1-rc.5',
      fetchLatest: async () => '0.2.1-rc.5',
    })
    const result = await controller.check()
    expect(result.updateAvailable).toBe(false)
    expect(notice.show).not.toHaveBeenCalled()
  })

  it('does not treat an unknown current version as an update', async () => {
    const { controller, notice, gate } = bench({ currentVersion: null })
    const result = await controller.check()
    expect(result).toMatchObject({ currentVersion: null, latestVersion: '0.2.1-rc.5', updateAvailable: false })
    expect(notice.show).not.toHaveBeenCalled()
    expect(gate.markChecked).toHaveBeenCalledOnce()
  })

  it('shares one in-flight request', async () => {
    let resolve!: (version: string) => void
    const pending = new Promise<string>((done) => { resolve = done })
    const fetchLatest = vi.fn(() => pending)
    const { controller } = bench({ fetchLatest })

    const first = controller.check()
    const second = controller.check()
    expect(fetchLatest).toHaveBeenCalledOnce()
    resolve('0.2.1-rc.5')
    await expect(first).resolves.toMatchObject({ updateAvailable: true })
    await expect(second).resolves.toBe(await first)
    expect(fetchLatest).toHaveBeenCalledOnce()
  })

  it('skips the automatic path when the day is already used', async () => {
    const fetchLatest = vi.fn(async () => '0.2.1-rc.5')
    const { controller } = bench({ fetchLatest, canCheck: false })
    await controller.autoCheck()
    expect(fetchLatest).not.toHaveBeenCalled()
  })

  it('skips the automatic path when the running version is unknown', async () => {
    const fetchLatest = vi.fn(async () => '0.2.1-rc.5')
    const { controller } = bench({ fetchLatest, currentVersion: null })
    await controller.autoCheck()
    expect(fetchLatest).not.toHaveBeenCalled()
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
      fetchLatest: async () => { throw failure },
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
    let resolve!: (version: string) => void
    const pending = new Promise<string>((done) => { resolve = done })
    const { controller, notice, gate } = bench({ fetchLatest: () => pending })
    const check = controller.check()
    controller.dispose()
    resolve('0.2.1-rc.5')
    await expect(check).resolves.toMatchObject({ updateAvailable: true })
    expect(notice.show).not.toHaveBeenCalled()
    expect(gate.markChecked).not.toHaveBeenCalled()
  })
})
