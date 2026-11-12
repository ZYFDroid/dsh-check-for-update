// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, type ClientContext } from '../src/client/index.tsx'
import { UpdateSettingsSection } from '../src/client/UpdateSettingsSection.tsx'
import { en, type LocaleKey, type Translate } from '../src/client/locales.ts'

const t: Translate = (key, params) => {
  let text = en[key as LocaleKey] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value))
  }
  return text
}

interface Registration {
  options: {
    name: string
    id?: string
    locale?: string
    label?: () => string
    inject?: () => object
  }
  component: unknown
}

/**
 * Build a client-context double that runs effects and captures registrations.
 * @param version - version reported by the module manifest.
 * @returns the context, captured registrations, and effect disposers.
 */
function context(version: string | null): {
  ctx: ClientContext
  registrations: Registration[]
  disposers: Array<() => void>
} {
  const registrations: Registration[] = []
  const disposers: Array<() => void> = []
  const logger = { warn: vi.fn() }
  const ctx: ClientContext = {
    effect(effect) {
      const dispose = effect()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    slots: {
      inject(_name, factory) {
        const dispose = factory()
        disposers.push(dispose)
      },
      register(options, component) {
        registrations.push({ options: options as Registration['options'], component })
        return () => {}
      },
    },
    locale: {
      register: () => () => {},
      bind: () => t,
    },
    modules: { manifest: version === null ? {} : { release: { version } } },
    logger,
  }
  return { ctx, registrations, disposers }
}

/**
 * Registry response stub.
 * @param latest - dist-tags.latest value.
 * @param next - dist-tags.next value when supplied.
 * @returns a fetch stub.
 */
function registry(latest: string, next?: string): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ 'dist-tags': next === undefined ? { latest } : { latest, next } }),
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('client apply', () => {
  it('checks on load, publishes the notice, and registers the Settings page', async () => {
    const fetchMock = registry('0.2.1-rc.5')
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, registrations, disposers } = context('0.2.1-rc.2')

    apply(ctx)
    expect(document.querySelector('style[data-dsh-plugin="dsh-check-for-update"]')).not.toBeNull()
    await vi.waitFor(() => {
      expect(document.querySelector('.dsh-cfu-notice')).not.toBeNull()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(document.querySelector('.dsh-cfu-notice')?.textContent)
      .toContain('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')
    expect(document.querySelector('.dsh-cfu-notice')?.textContent).toContain('0.2.1-rc.2')
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.options).toMatchObject({
      name: 'settings.section',
      id: 'check-for-update',
      locale: 'dsh-check-for-update',
    })
    expect(registrations[0]?.options.label?.()).toBe('Check for updates')
    expect(registrations[0]?.component).toBe(UpdateSettingsSection)
    expect(registrations[0]?.options.inject?.()).toHaveProperty('controller')

    for (const dispose of disposers.reverse()) dispose()
    expect(document.querySelector('.dsh-cfu-notice')).toBeNull()
  })

  it('notifies for a newer next tag even when latest matches the running version', async () => {
    const fetchMock = registry('0.2.2-rc.1', '0.2.2-rc.2')
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, disposers } = context('0.2.2-rc.1')

    apply(ctx)
    await vi.waitFor(() => {
      expect(document.querySelector('.dsh-cfu-notice')).not.toBeNull()
    })

    const text = document.querySelector('.dsh-cfu-notice')?.textContent
    expect(text).toContain('0.2.2-rc.2')
    expect(text).toContain('npm install -g @deepseek-ai/dsh@0.2.2-rc.2')
    for (const dispose of disposers.reverse()) dispose()
  })

  it('skips the automatic fetch after a successful check today', async () => {
    const first = registry('0.2.1-rc.5')
    vi.stubGlobal('fetch', first)
    const a = context('0.2.1-rc.2')
    apply(a.ctx)
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce())
    for (const dispose of a.disposers.reverse()) dispose()

    const second = registry('0.2.1-rc.5')
    vi.stubGlobal('fetch', second)
    const b = context('0.2.1-rc.2')
    apply(b.ctx)
    await new Promise(resolve => globalThis.setTimeout(resolve, 30))
    expect(second).not.toHaveBeenCalled()
    expect(document.querySelector('.dsh-cfu-notice')).toBeNull()
    for (const dispose of b.disposers.reverse()) dispose()
  })

  it('still registers Settings when the running version is unknown', () => {
    const { ctx, registrations } = context(null)
    apply(ctx)
    expect(registrations).toHaveLength(1)
  })
})
