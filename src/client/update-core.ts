/**
 * Pure update-check primitives: registry parsing, version ordering, command
 * formatting, release extraction, and the once-a-day gate. Kept DOM-free so the
 * rules are testable without a browser.
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

/** Minimal fetch face accepted by {@link fetchRegistryTags}. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<HttpResponseLike>

/** Minimal storage face accepted by the daily gate. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Registry dist-tags this plugin consumes. */
export interface RegistryTags {
  /** `dist-tags.latest`: the version npm installs by default. */
  readonly latest: string
  /**
   * `dist-tags.next` when it is strictly newer than {@link latest}. The next
   * tag is promoted to latest later, so it is the earliest signal of an
   * upcoming release. Older, equal, or malformed next tags are ignored.
   */
  readonly next: string | null
}

/** One completed registry check. */
export interface CheckResult {
  /** Running DSH version, or null when this page publishes none. */
  readonly currentVersion: string | null
  /** `dist-tags.latest` from the registry. */
  readonly latestVersion: string
  /** Newer `dist-tags.next` version, or null when there is none. */
  readonly nextVersion: string | null
  /** Version the update command installs: next when it is ahead, else latest. */
  readonly targetVersion: string
  /** True exactly when currentVersion is known and older than targetVersion. */
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

/** Parsed `major.minor.patch[-prerelease]` version. */
interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
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
 * Parse a semver-shaped DSH version. Build metadata is accepted and ignored.
 * @param value - version text.
 * @returns the parsed version, or null when the text is not semver-shaped.
 */
function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u
    .exec(value.trim())
  if (match === null) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const prerelease = match[4] === undefined ? [] : match[4].split('.')
  return { major, minor, patch, prerelease }
}

/**
 * Compare prerelease identifier lists with semver precedence.
 * @param left - left identifiers (empty for a release).
 * @param right - right identifiers.
 * @returns negative, zero, or positive when left sorts before/equal/after right.
 */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0
    return left.length === 0 ? 1 : -1
  }
  const shared = Math.min(left.length, right.length)
  for (let index = 0; index < shared; index += 1) {
    const a = left[index] ?? ''
    const b = right[index] ?? ''
    const aNumeric = /^\d+$/u.test(a)
    const bNumeric = /^\d+$/u.test(b)
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b)
      if (difference !== 0) return difference < 0 ? -1 : 1
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1
    } else if (a !== b) {
      return a < b ? -1 : 1
    }
  }
  if (left.length === right.length) return 0
  return left.length < right.length ? -1 : 1
}

/**
 * Compare two DSH versions with semver precedence. Unparseable inputs fall
 * back to string comparison so a malformed manifest cannot crash a page load.
 * @param left - left version.
 * @param right - right version.
 * @returns negative when left is older, zero when equal, positive when newer.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) {
    if (left === right) return 0
    return left < right ? -1 : 1
  }
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Extract the registry tags this plugin checks. `next` is kept only when it is
 * strictly newer than `latest`, because an older next tag must not be offered
 * as an upgrade and a promoted next tag is already latest.
 * @param payload - parsed registry JSON.
 * @returns the latest version and the meaningful next version.
 * @throws {Error} when the document does not carry a usable latest tag.
 */
export function registryTagsOf(payload: unknown): RegistryTags {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('registry response is not an object')
  }
  const tags: unknown = Reflect.get(payload, 'dist-tags')
  if (typeof tags !== 'object' || tags === null) {
    throw new Error('registry response has no dist-tags object')
  }
  const rawLatest: unknown = Reflect.get(tags, 'latest')
  if (typeof rawLatest !== 'string' || rawLatest.trim() === '') {
    throw new Error('registry response has no latest dist-tag')
  }
  const latest = rawLatest.trim()
  const rawNext: unknown = Reflect.get(tags, 'next')
  const next = typeof rawNext === 'string' && rawNext.trim() !== '' ? rawNext.trim() : null
  return {
    latest,
    next: next !== null && compareVersions(next, latest) > 0 ? next : null,
  }
}

/**
 * Fetch the registry document and return its latest and next tags.
 * @param fetchImpl - fetch implementation (tests inject a stub).
 * @param url - registry document URL.
 * @returns the parsed tags.
 * @throws {Error} on a non-2xx response or an unusable document.
 */
export async function fetchRegistryTags(
  fetchImpl: FetchLike = globalThis.fetch,
  url: string = REGISTRY_URL,
): Promise<RegistryTags> {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`registry responded with HTTP ${response.status}`)
  return registryTagsOf(await response.json())
}

/**
 * Whether the running version is older than the version worth installing.
 * Installing a version the running page is already ahead of would be a
 * downgrade, so ordering matters here rather than plain inequality.
 * @param current - running version, or null when unknown.
 * @param target - latest or next version.
 * @returns true only when both are known and current is older.
 */
export function updateAvailable(current: string | null, target: string): boolean {
  return current !== null && compareVersions(current, target) < 0
}

/**
 * The version the update command should install for one check.
 * @param tags - registry tags.
 * @returns the next tag when usable, else latest.
 */
export function targetVersionOf(tags: RegistryTags): string {
  return tags.next ?? tags.latest
}

/**
 * The exact command a user copies to upgrade the global install.
 * @param version - version to install.
 * @returns `npm install -g @deepseek-ai/dsh@<version>`.
 */
export function updateCommand(version: string): string {
  return `npm install -g @deepseek-ai/dsh@${version}`
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
