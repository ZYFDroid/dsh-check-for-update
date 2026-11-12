/**
 * Persistent bottom-right update notice. It never retires on a timer: only
 * the close button (or plugin teardown) removes it.
 */
import { writeClipboard } from './clipboard.ts'
import type { Translate } from './locales.ts'
import { ensureStyles } from './styles.ts'
import { updateCommand, type CheckResult } from './update-core.ts'

/** Contract the controller uses to publish a completed check. */
export interface UpdateNotice {
  /** Show or refresh the notice for one check result. */
  show(result: CheckResult): void
  /** Remove the notice and release its DOM. */
  dispose(): void
}

/**
 * Create one element with a class and optional text.
 * @param tag - element tag.
 * @param className - class list.
 * @param text - text content when supplied.
 * @returns the created element.
 */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== '') node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Imperative notice rendered into `document.body`. */
export class DshUpdateNotice implements UpdateNotice {
  private root: HTMLDivElement | null = null
  private result: CheckResult | null = null

  /**
   * @param t - locale-bound translator.
   */
  constructor(private readonly t: Translate) {}

  /** @inheritdoc */
  show(result: CheckResult): void {
    if (typeof document === 'undefined') return
    this.result = result
    ensureStyles()
    if (this.root === null) {
      const root = element('div', 'dsh-cfu-notice')
      root.setAttribute('role', 'alert')
      root.setAttribute('aria-label', this.t('noticeAria'))
      document.body.appendChild(root)
      this.root = root
    }
    this.render()
  }

  /** @inheritdoc */
  dispose(): void {
    this.root?.remove()
    this.root = null
    this.result = null
  }

  /** Rebuild the notice body from the current result. */
  private render(): void {
    const root = this.root
    const result = this.result
    if (root === null || result === null) return

    root.replaceChildren()

    const head = element('div', 'dsh-cfu-head')
    const badge = element('span', 'dsh-cfu-badge', this.t('updateAvailable'))
    const title = element('span', 'dsh-cfu-title', this.t('noticeTitle'))
    const close = element('button', 'dsh-cfu-close', '\u00d7')
    close.type = 'button'
    close.setAttribute('aria-label', this.t('close'))
    close.addEventListener('click', () => { this.dispose() })
    head.append(badge, title, close)

    const body = element('p', 'dsh-cfu-body', this.t('noticeBody'))

    const versions = element('div', 'dsh-cfu-versions')
    versions.append(
      this.versionRow(this.t('current'), result.currentVersion ?? this.t('unknown')),
      this.versionRow(this.t('latest'), result.latestVersion),
    )
    if (result.nextVersion !== null) {
      versions.append(this.versionRow(this.t('next'), result.nextVersion))
    }

    const command = updateCommand(result.targetVersion)
    const label = element('div', 'dsh-cfu-label', this.t('commandLabel'))
    const commandRow = element('div', 'dsh-cfu-command')
    const code = element('code', '', command)
    const copy = element('button', 'dsh-cfu-button', this.t('copy'))
    copy.type = 'button'
    copy.setAttribute('aria-label', this.t('copyAria'))
    copy.addEventListener('click', () => { void this.copy(command, copy) })
    commandRow.append(code, copy)

    const hint = element('p', 'dsh-cfu-hint', this.t('restartHint'))

    root.append(head, body, versions, label, commandRow, hint)
  }

  /**
   * Build one labelled version row.
   * @param label - row label.
   * @param value - version text.
   * @returns the row.
   */
  private versionRow(label: string, value: string): HTMLDivElement {
    const row = element('div', 'dsh-cfu-version')
    row.append(element('span', '', label), element('code', '', value))
    return row
  }

  /**
   * Copy the command and reflect the outcome on the button.
   * @param command - update command.
   * @param button - copy button still mounted in this notice.
   */
  private async copy(command: string, button: HTMLButtonElement): Promise<void> {
    const copied = await writeClipboard(command)
    if (this.root === null || !this.root.contains(button)) return
    button.textContent = copied ? this.t('copied') : this.t('copyFailed')
    globalThis.setTimeout(() => {
      if (this.root?.contains(button) === true) button.textContent = this.t('copy')
    }, 1600)
  }
}
