/**
 * dsh-check-for-update — client half.
 *
 * On page load (at most once per local calendar day) this reads the running
 * DSH release from the client module manifest, fetches the npm registry's
 * `latest` and `next` dist-tags, and — when the running version is older than
 * either — opens a persistent bottom-right notice containing the versions, the
 * exact upgrade command, and a copy button. The Settings section runs the same
 * check immediately, with no daily limit, and keeps the result inline.
 *
 * The plugin is client-only: it adds no host service, setting, tool, or
 * session event, and the host entry contributes nothing.
 */
import { UpdateSettingsSection } from './UpdateSettingsSection.tsx'
import { UpdateController } from './controller.ts'
import { en, zh, type Translate } from './locales.ts'
import { DshUpdateNotice } from './notice.ts'
import { ensureStyles } from './styles.ts'
import {
  browserStorage,
  createDailyGate,
  fetchRegistryTags,
  readReleaseVersion,
} from './update-core.ts'

/** Locale namespace owned by this plugin. */
const NS = 'dsh-check-for-update'

/** Slot registration options this plugin uses (structural, loader-provided). */
interface SlotRegistrationOptions {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly label?: () => string
  readonly locale?: string
  readonly inject?: () => object
}

/** Client slot registry slice touched by this plugin. */
interface SlotsService {
  inject(name: string, factory: () => () => void): void
  register(options: SlotRegistrationOptions, component: unknown): () => void
}

/** Client locale registry slice touched by this plugin. */
interface LocaleService {
  register(namespace: string, dictionaries: {
    readonly zh: Record<string, string>
    readonly en: Record<string, string>
  }): () => void
  bind(namespace: string): Translate
}

/** Client module system slice carrying the host release identity. */
interface ModulesService {
  readonly manifest: unknown
}

/** Diagnostics face used for a failed automatic check. */
interface LoggerService {
  warn(...args: unknown[]): void
}

/** The client root context slice this fiber touches. */
export interface ClientContext {
  effect(effect: () => void | (() => void), label?: string): void
  readonly slots: SlotsService
  readonly locale: LocaleService
  readonly modules: ModulesService
  readonly logger?: LoggerService
}

/** Services required by the Settings registration and release lookup. */
export const inject = ['slots', 'locale', 'modules']

/**
 * Read the running version from the module manifest, falling back to the boot
 * graph that the Web shell exposes globally.
 * @param modules - client module system.
 * @returns the version string or null.
 */
function currentVersionOf(modules: ModulesService): string | null {
  return readReleaseVersion(modules.manifest)
    ?? readReleaseVersion(Reflect.get(globalThis, '__DSH_BOOT__'))
}

/**
 * Install the checker, its persistent notice, and the Settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-check-for-update: dictionaries')

  const t = ctx.locale.bind(NS)
  const currentVersion = currentVersionOf(ctx.modules)
  const notice = new DshUpdateNotice(t)
  const controller = new UpdateController({
    currentVersion,
    fetchTags: () => fetchRegistryTags(),
    notice,
    gate: createDailyGate(browserStorage()),
    log: (message, error) => { ctx.logger?.warn(message, error) },
  })

  ctx.effect(() => {
    const start = (): void => { void controller.autoCheck() }
    let timer: ReturnType<typeof setTimeout> | undefined
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true })
      } else {
        timer = globalThis.setTimeout(start, 0)
      }
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      if (typeof document !== 'undefined') document.removeEventListener('DOMContentLoaded', start)
      controller.dispose()
      notice.dispose()
    }
  }, 'dsh-check-for-update: page-load check')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'check-for-update',
    order: 90,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ controller }),
  }, UpdateSettingsSection))
}
