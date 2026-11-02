// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { en, type LocaleKey, type Translate } from '../src/client/locales.ts'
import { DshUpdateNotice } from '../src/client/notice.ts'
import type { CheckResult } from '../src/client/update-core.ts'

const t: Translate = (key, params) => {
  let text = en[key as LocaleKey] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value))
  }
  return text
}

const result: CheckResult = {
  currentVersion: '0.2.1-rc.2',
  latestVersion: '0.2.1-rc.5',
  updateAvailable: true,
  checkedAt: 1_700_000_000_000,
}

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  })
})

describe('DshUpdateNotice', () => {
  it('renders both versions, the command, and stays until closed', async () => {
    const notice = new DshUpdateNotice(t)
    notice.show(result)
    const root = document.querySelector<HTMLDivElement>('.dsh-cfu-notice')
    expect(root).not.toBeNull()
    expect(root?.textContent).toContain('0.2.1-rc.2')
    expect(root?.textContent).toContain('0.2.1-rc.5')
    expect(root?.textContent).toContain('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')

    await new Promise(resolve => globalThis.setTimeout(resolve, 30))
    expect(document.querySelector('.dsh-cfu-notice')).toBe(root)

    root?.querySelector<HTMLButtonElement>('.dsh-cfu-close')?.click()
    expect(document.querySelector('.dsh-cfu-notice')).toBeNull()
    notice.dispose()
  })

  it('injects its stylesheet once', () => {
    const first = new DshUpdateNotice(t)
    const second = new DshUpdateNotice(t)
    first.show(result)
    second.show(result)
    expect(document.querySelectorAll('style[data-dsh-plugin="dsh-check-for-update"]')).toHaveLength(1)
    first.dispose()
    second.dispose()
  })

  it('refreshes an open notice with a newer result', () => {
    const notice = new DshUpdateNotice(t)
    notice.show(result)
    notice.show({ ...result, currentVersion: '0.2.1-rc.1', latestVersion: '0.2.2-rc.1' })
    const root = document.querySelector('.dsh-cfu-notice')
    expect(root?.textContent).toContain('0.2.1-rc.1')
    expect(root?.textContent).toContain('0.2.2-rc.1')
    expect(root?.textContent).not.toContain('0.2.1-rc.5')
    notice.dispose()
  })

  it('copies the exact command and reports success', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const notice = new DshUpdateNotice(t)
    notice.show(result)
    const copy = document.querySelector<HTMLButtonElement>('.dsh-cfu-button')
    copy?.click()
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')
      expect(copy?.textContent).toBe('Copied')
    })
    notice.dispose()
  })

  it('removes the DOM on dispose', () => {
    const notice = new DshUpdateNotice(t)
    notice.show(result)
    notice.dispose()
    expect(document.querySelector('.dsh-cfu-notice')).toBeNull()
  })
})
