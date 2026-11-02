/**
 * Pure update-check primitives: registry parsing, command formatting, release
 * extraction, and the once-a-day gate. Kept DOM-free so the rules are testable
 * without a browser.
 */

/** Canonical npm registry document for the DSH package. */
export const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2fdsh'

/** localStorage key holding the local calendar day of the last successful check. */
export const LAST_CHECK_KEY = 'dsh-check-for-update:last-check-day'

/** Minimal response face the registry fetch consumes (Response satisfies it). */
export interface HttpResponseLike {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

/** Minimal fetch face accepted by {@link fetchLatestVersion}. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<HttpResponseLike>

/** Minimal storage face accepted by the daily gate. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** One completed registry check. */
export interface CheckResult {
  /** Running DSH version, or null when this page publishes none. */
  readonly currentVersion: string | null
  /** `dist-tags.latest` from the registry. */
  readonly latestVersion: string
  /** True exactly when currentVersion is known and differs from latestVersion. */
  readonly updateAvailable: boolean
  /** Epoch milliseconds of the completed check. */
  readonly checkedAt: number
}

/** Once-a-day gate shared by page loads. */
export interface DailyGate {
  /** Whether no successful check has run on the current local calendar day. */
  canCheck(): boolean
  /** Record a successful check for the current local calendar day. */
  markChecked(): void
}

/**
 * Read the host release identity carried by a boot manifest.
 * @param value - the boot manifest or another object carrying a `release` member.
 * @returns the non-empty version string, or null when absent/malformed.
 */
export function readReleaseVersion(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const release: unknown = Reflect.get(value, 'release')
  if (typeof release !== 'object' || release === null) return null
  const version: unknown = Reflect.get(release, 'version')
  return typeof version === 'string' && version.trim() !== '' ? version : null
}

/**
 * Extract `dist-tags.latest` from a registry document.
 * @param payload - parsed registry JSON.
 * @returns the latest version string.
 * @throws {Error} when the document does not carry a usable latest tag.
 */
export function latestVersionOf(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('registry response is not an object')
  }
  const tags: unknown = Reflect.get(payload, 'dist-tags')
  if (typeof tags !== 'object' || tags === null) {
    throw new Error('registry response has no dist-tags object')
  }
  const latest: unknown = Reflect.get(tags, 'latest')
  if (typeof latest !== 'string' || latest.trim() === '') {
    throw new Error('registry response has no latest dist-tag')
  }
  return latest
}

/**
 * Fetch the registry document and return its latest dist-tag.
 * @param fetchImpl - fetch implementation (tests inject a stub).
 * @param url - registry document URL.
 * @returns the latest version string.
 * @throws {Error} on a non-2xx response or an unusable document.
 */
export async function fetchLatestVersion(
  fetchImpl: FetchLike = globalThis.fetch,
  url: string = REGISTRY_URL,
): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`registry responded with HTTP ${response.status}`)
  return latestVersionOf(await response.json())
}

/**
 * Whether the running version differs from the registry's latest tag.
 * Alpha and other prerelease tags stay ignored: the comparison uses `latest`.
 * @param current - running version, or null when unknown.
 * @param latest - registry latest version.
 * @returns true only when both are known and unequal.
 */
export function updateAvailable(current: string | null, latest: string): boolean {
  return current !== null && current !== latest
}

/**
 * The exact command a user copies to upgrade the global install.
 * @param latest - version to install.
 * @returns `npm install -g @deepseek-ai/dsh@<version>`.
 */
export function updateCommand(latest: string): string {
  return `npm install -g @deepseek-ai/dsh@${latest}`
}

/**
 * Local calendar day key (`YYYY-MM-DD`) used by the daily gate.
 * @param now - clock reading.
 * @returns the local date.
 */
export function localDay(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Build a daily gate backed by storage. Storage failures disable persistence
 * (the page then checks every load) but never break the plugin.
 * @param storage - localStorage-like object, or null when unavailable.
 * @param now - clock reading.
 * @returns the gate.
 */
export function createDailyGate(
  storage: StorageLike | null,
  now: () => Date = () => new Date(),
): DailyGate {
  return {
    canCheck(): boolean {
      try {
        return storage?.getItem(LAST_CHECK_KEY) !== localDay(now())
      } catch {
        return true
      }
    },
    markChecked(): void {
      try {
        storage?.setItem(LAST_CHECK_KEY, localDay(now()))
      } catch {
        // A storage failure only loses the next page load's skip.
      }
    },
  }
}

/**
 * Browser localStorage, or null when the page cannot access it.
 * @returns the storage object or null.
 */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Human-readable message for an unknown thrown value.
 * @param error - caught value.
 * @returns the message text.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : String(error)
}
