/**
 * Orchestrates the registry check: one in-flight request shared by the
 * automatic and manual paths, the once-a-day gate, and notice publication.
 */
import type { UpdateNotice } from './notice.ts'
import {
  updateAvailable,
  type CheckResult,
  type DailyGate,
} from './update-core.ts'

/** Construction inputs for {@link UpdateController}. */
export interface UpdateControllerOptions {
  /** Running DSH version, or null when the page publishes none. */
  readonly currentVersion: string | null
  /** Fetch the registry's latest dist-tag. */
  readonly fetchLatest: () => Promise<string>
  /** Persistent notice sink. */
  readonly notice: UpdateNotice
  /** Once-a-day gate consulted only by {@link UpdateController.autoCheck}. */
  readonly gate: DailyGate
  /** Clock reading; defaults to the system clock. */
  readonly now?: () => Date
  /** Diagnostic sink for a failed automatic check. */
  readonly log?: (message: string, error: unknown) => void
}

/** Shared checker behind both the automatic path and the Settings page. */
export class UpdateController {
  /** Running version captured when the plugin applied. */
  readonly currentVersion: string | null

  private readonly options: UpdateControllerOptions
  private readonly now: () => Date
  private inFlight: Promise<CheckResult> | null = null
  private last: CheckResult | null = null
  private disposed = false

  /**
   * @param options - checker dependencies.
   */
  constructor(options: UpdateControllerOptions) {
    this.options = options
    this.currentVersion = options.currentVersion
    this.now = options.now ?? (() => new Date())
  }

  /** Most recent successful result, or null before the first check. */
  get lastResult(): CheckResult | null {
    return this.last
  }

  /**
   * Run a check immediately, sharing an already-running request. A successful
   * check records today's date in the daily gate, so a manual check also
   * satisfies the automatic path for the rest of the day.
   * @returns the completed result.
   * @throws when the registry fetch or document parsing fails.
   */
  check(): Promise<CheckResult> {
    return this.start(true)
  }

  /**
   * Run the page-load check when the current version is known and today's
   * automatic slot is unused. The attempt consumes the day before the request
   * starts, so a reload loop cannot repeatedly hit the registry; failures stay
   * diagnostic and never surface a notice.
   * @returns after the check settles.
   */
  async autoCheck(): Promise<void> {
    if (this.disposed || this.currentVersion === null) return
    if (!this.options.gate.canCheck()) return
    this.options.gate.markChecked()
    try {
      await this.start(false)
    } catch (error) {
      this.options.log?.('dsh-check-for-update: automatic check failed', error)
    }
  }

  /** Stop publishing notices; an in-flight request may still settle. */
  dispose(): void {
    this.disposed = true
  }

  /**
   * Start one shared request.
   * @param record - whether a successful check records the day (manual path).
   * @returns the completed result.
   */
  private start(record: boolean): Promise<CheckResult> {
    if (this.inFlight !== null) return this.inFlight
    const run = this.performCheck(record)
    this.inFlight = run
    run.then(
      () => { if (this.inFlight === run) this.inFlight = null },
      () => { if (this.inFlight === run) this.inFlight = null },
    )
    return run
  }

  /**
   * Fetch, compare, publish, and (for the manual path) record one check.
   * @param record - whether a successful check records the day.
   * @returns the completed result.
   */
  private async performCheck(record: boolean): Promise<CheckResult> {
    const latestVersion = await this.options.fetchLatest()
    const currentVersion = this.currentVersion
    const result: CheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable: updateAvailable(currentVersion, latestVersion),
      checkedAt: this.now().getTime(),
    }
    if (this.disposed) return result
    this.last = result
    if (record) this.options.gate.markChecked()
    if (result.updateAvailable) this.options.notice.show(result)
    return result
  }
}
