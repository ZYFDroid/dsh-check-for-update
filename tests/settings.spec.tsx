// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateSettingsSection } from '../src/client/UpdateSettingsSection.tsx'
import { UpdateController } from '../src/client/controller.ts'
import { en, type LocaleKey, type Translate } from '../src/client/locales.ts'
import type { UpdateNotice } from '../src/client/notice.ts'
import type { RegistryTags } from '../src/client/update-core.ts'

const t: Translate = (key, params) => {
  let text = en[key as LocaleKey] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value))
  }
  return text
}

/**
 * Build a real controller with inert sinks.
 * @param fetchTags - registry stub.
 * @param currentVersion - running version.
 * @returns the controller.
 */
function controller(
  fetchTags: () => Promise<RegistryTags>,
  currentVersion: string | null = '0.2.1-rc.2',
): UpdateController {
  const notice: UpdateNotice = { show: vi.fn(), dispose: vi.fn() }
  return new UpdateController({
    currentVersion,
    fetchTags,
    notice,
    gate: { canCheck: () => true, markChecked: vi.fn() },
  })
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  })
})

afterEach(cleanup)

describe('UpdateSettingsSection', () => {
  it('checks immediately, ignoring the daily gate, and shows the command', async () => {
    const checker = controller(async () => ({ latest: '0.2.1-rc.5', next: null }))
    render(<UpdateSettingsSection controller={checker} t={t} />)

    expect(screen.getByText('Not checked yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    await waitFor(() => expect(screen.getByText('Update available')).toBeTruthy())
    expect(screen.getByText('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')).toBeTruthy()
  })

  it('shows a newer next tag and installs it', async () => {
    const checker = controller(
      async () => ({ latest: '0.2.2-rc.1', next: '0.2.2-rc.2' }),
      '0.2.2-rc.1',
    )
    render(<UpdateSettingsSection controller={checker} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    await waitFor(() => expect(screen.getByText('Update available')).toBeTruthy())
    expect(screen.getByText('Next version')).toBeTruthy()
    expect(screen.getByText('0.2.2-rc.2')).toBeTruthy()
    expect(screen.getByText(en.nextNote)).toBeTruthy()
    expect(screen.getByText('npm install -g @deepseek-ai/dsh@0.2.2-rc.2')).toBeTruthy()
  })

  it('shows an existing successful result on mount', async () => {
    const checker = controller(async () => ({ latest: '0.2.1-rc.5', next: null }))
    await checker.check()
    render(<UpdateSettingsSection controller={checker} t={t} />)
    expect(screen.getByText('Update available')).toBeTruthy()
    expect(screen.getByText('0.2.1-rc.5')).toBeTruthy()
  })

  it('reports an up-to-date result', async () => {
    const checker = controller(async () => ({ latest: '0.2.1-rc.5', next: null }), '0.2.1-rc.5')
    render(<UpdateSettingsSection controller={checker} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(screen.getByText('You are up to date')).toBeTruthy())
    expect(screen.queryByText('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')).toBeNull()
  })

  it('renders a failed check inline', async () => {
    const checker = controller(async () => { throw new Error('offline') })
    render(<UpdateSettingsSection controller={checker} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(screen.getByText('Check failed: offline')).toBeTruthy())
  })

  it('copies the update command', async () => {
    const checker = controller(async () => ({ latest: '0.2.1-rc.5', next: null }))
    await checker.check()
    render(<UpdateSettingsSection controller={checker} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy update command' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npm install -g @deepseek-ai/dsh@0.2.1-rc.5')
      expect(screen.getByText('Copied')).toBeTruthy()
    })
  })

  it('explains when the running version cannot be read', () => {
    const checker = controller(async () => ({ latest: '0.2.1-rc.5', next: null }), null)
    render(<UpdateSettingsSection controller={checker} t={t} />)
    expect(screen.getByText('Could not read the running DSH version from this page.')).toBeTruthy()
  })
})
