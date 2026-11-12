/** Settings page: manual update check plus the last result. */
import { useEffect, useRef, useState } from 'react'
import { writeClipboard } from './clipboard.ts'
import type { UpdateController } from './controller.ts'
import type { Translate } from './locales.ts'
import { errorMessage, updateCommand, type CheckResult } from './update-core.ts'

/** Injected service face the slot renderer spreads into the component. */
export interface UpdateSettingsInjected {
  /** Checker shared with the page-load path. */
  controller: UpdateController
}

/** Composed props: injected controller plus the locale-bound `t` seat. */
export type UpdateSettingsSectionProps = UpdateSettingsInjected & { t: Translate }

/** Local view of one manual check. */
type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; result: CheckResult }
  | { kind: 'error'; message: string }

/**
 * Render the Check for updates settings section.
 * @param props - controller and locale seat.
 * @returns the section body.
 */
export function UpdateSettingsSection({ controller, t }: UpdateSettingsSectionProps) {
  const [status, setStatus] = useState<Status>(() => (
    controller.lastResult === null
      ? { kind: 'idle' }
      : { kind: 'done', result: controller.lastResult }
  ))
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const currentVersion = controller.currentVersion
  const result = status.kind === 'done' ? status.result : null
  const nextVersion = result?.nextVersion ?? null
  const command = result?.updateAvailable === true ? updateCommand(result.targetVersion) : null

  let statusText: string
  let statusClass = 'dsh-cfu-status'
  if (status.kind === 'checking') {
    statusText = t('checking')
  } else if (status.kind === 'error') {
    statusText = t('checkFailed', { message: status.message })
    statusClass += ' dsh-cfu-status-error'
  } else if (status.kind === 'done' && status.result.updateAvailable) {
    statusText = t('updateAvailable')
    statusClass += ' dsh-cfu-status-update'
  } else if (status.kind === 'done') {
    statusText = t('upToDate')
    statusClass += ' dsh-cfu-status-ok'
  } else {
    statusText = t('notChecked')
  }

  const check = (): void => {
    if (status.kind === 'checking') return
    setStatus({ kind: 'checking' })
    void controller.check().then(
      (checked) => { if (alive.current) setStatus({ kind: 'done', result: checked }) },
      (error: unknown) => { if (alive.current) setStatus({ kind: 'error', message: errorMessage(error) }) },
    )
  }

  return (
    <section className="dsh-cfu-section" aria-labelledby="dsh-cfu-settings-title">
      <h2 id="dsh-cfu-settings-title" className="dsh-cfu-section-title">{t('title')}</h2>
      <p className="dsh-cfu-section-desc">{t('description')}</p>

      <div className="dsh-cfu-card">
        <div className="dsh-cfu-row">
          <span className="dsh-cfu-row-label">{t('current')}</span>
          <code className="dsh-cfu-row-value">{currentVersion ?? t('unknown')}</code>
        </div>
        <div className="dsh-cfu-row">
          <span className="dsh-cfu-row-label">{t('latest')}</span>
          <code className="dsh-cfu-row-value">{result?.latestVersion ?? '—'}</code>
        </div>
        {nextVersion !== null && (
          <div className="dsh-cfu-row">
            <span className="dsh-cfu-row-label">{t('next')}</span>
            <code className="dsh-cfu-row-value">{nextVersion}</code>
          </div>
        )}
        {nextVersion !== null && <p className="dsh-cfu-note">{t('nextNote')}</p>}
        <p className={statusClass} role="status">{statusText}</p>
        <div className="dsh-cfu-actions">
          <button
            className="dsh-cfu-primary"
            type="button"
            disabled={status.kind === 'checking'}
            onClick={check}
          >
            {status.kind === 'checking' ? t('checking') : t('checkNow')}
          </button>
        </div>
        <p className="dsh-cfu-note">{t('autoCheckNote')}</p>
        {currentVersion === null && <p className="dsh-cfu-note">{t('currentVersionUnknown')}</p>}
      </div>

      {command !== null && (
        <div className="dsh-cfu-card">
          <div className="dsh-cfu-row">
            <span className="dsh-cfu-row-label">{t('commandLabel')}</span>
          </div>
          <CommandRow command={command} t={t} />
          <p className="dsh-cfu-note">{t('restartHint')}</p>
        </div>
      )}
    </section>
  )
}

/**
 * Command text with a copy button and transient success/failure label.
 * @param props - command and locale seat.
 * @returns the command row.
 */
function CommandRow({ command, t }: { command: string; t: Translate }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const copy = (): void => {
    void writeClipboard(command).then((ok) => {
      if (!alive.current) return
      setCopied(ok)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (alive.current) setCopied(null)
      }, 1600)
    })
  }

  return (
    <div className="dsh-cfu-command">
      <code>{command}</code>
      <button
        className="dsh-cfu-button"
        type="button"
        aria-label={t('copyAria')}
        onClick={copy}
      >
        {copied === true ? t('copied') : copied === false ? t('copyFailed') : t('copy')}
      </button>
    </div>
  )
}
