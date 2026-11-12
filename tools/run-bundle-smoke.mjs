/**
 * Bundle smoke checks for dsh-check-for-update.
 *
 * Loads the REAL production client bundle (`lib/client.js`) through the same
 * facade the dsh web shell uses — `window.__ModuleLoader__.load({ id, factory })`
 * — inside jsdom, then applies it to a client-context double. This verifies the
 * shipped artifact, not the sources:
 *
 * 1. Identity: the bundle registers under the manifest name and asks only for
 *    platform modules (React and its JSX runtime).
 * 2. Page-load behavior: the running version is read from the module manifest,
 *    the registry is fetched, and a persistent notice with the exact command
 *    appears, including a newer `next` tag when the registry publishes one.
 * 3. Daily gate: a second apply on the same day performs no fetch.
 * 4. Settings: a `settings.section` registration is contributed.
 *
 * Usage: node tools/run-bundle-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

let checks = 0
const failures = []

/**
 * Record one assertion.
 * @param {string} label - what was asserted.
 * @param {unknown} actual - observed value.
 * @param {unknown} expected - expected value.
 */
function is(label, actual, expected) {
  checks += 1
  if (actual !== expected) failures.push(`${label}\n    expected: ${String(expected)}\n    actual:   ${String(actual)}`)
}

/**
 * Record one truthiness assertion.
 * @param {string} label - what was asserted.
 * @param {unknown} actual - observed value.
 */
function ok(label, actual) {
  checks += 1
  if (!actual) failures.push(`${label}\n    expected a truthy value\n    actual:   ${String(actual)}`)
}

/** Let the page-load timer and its fetch settle. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 80) })

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PLUGIN_ID = manifest.name
const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')

/**
 * Build a jsdom page with the loader facade installed.
 * @param {number} fetchCount - mutable fetch counter shared with the stub.
 * @returns {object} the page and registered factory map.
 */
function page(fetchCount) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:3090/' })
  const { window } = dom
  const registered = new Map()
  window.__ModuleLoader__ = { load({ id, factory }) { registered.set(id, factory) } }
  window.fetch = async () => {
    fetchCount.value += 1
    return {
      ok: true,
      status: 200,
      json: async () => ({
        'dist-tags': {
          latest: '0.2.1-rc.5',
          next: '0.2.2-rc.2',
          alpha: '0.2.2-alpha.2',
        },
      }),
    }
  }
  const run = new Function(
    'window', 'document', 'globalThis', 'navigator', 'localStorage',
    bundle,
  )
  run(window, window.document, window, window.navigator, window.localStorage)
  return { window, registered }
}

/**
 * A client-context double for one apply.
 * @param {object} window - jsdom window.
 * @param {Array<object>} registrations - sink for slot registrations.
 * @param {Array<() => void>} disposers - sink for effect disposers.
 * @returns {object} the context.
 */
function context(window, registrations, disposers) {
  return {
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
        registrations.push({ options, component })
        return () => {}
      },
    },
    locale: {
      register: () => () => {},
      bind: () => key => key,
    },
    modules: { manifest: { release: { version: '0.2.1-rc.2' } } },
    logger: { warn() {} },
  }
}

const fetchCount = { value: 0 }
const first = page(fetchCount)
ok(`the bundle registers itself as ${PLUGIN_ID}`, first.registered.has(PLUGIN_ID))
const factory = first.registered.get(PLUGIN_ID)
is('the registration carries a factory', typeof factory, 'function')
const requested = []
const plugin = factory((specifier) => {
  requested.push(specifier)
  if (specifier === 'react') return require('react')
  if (specifier === 'react/jsx-runtime') return require('react/jsx-runtime')
  throw new Error(`unexpected platform module: ${specifier}`)
})
is('the client half exports apply', typeof plugin.apply, 'function')
is('the client half declares its services', JSON.stringify(plugin.inject), JSON.stringify(['slots', 'locale', 'modules']))
is('the bundle requests only React platform modules', requested.sort().join(', '), 'react, react/jsx-runtime')

const registrations = []
const disposers = []
plugin.apply(context(first.window, registrations, disposers))
ok('the stylesheet is installed even when no notice is open', first.window.document.querySelector('style[data-dsh-plugin="dsh-check-for-update"]') !== null)
await settle()

const notice = first.window.document.querySelector('.dsh-cfu-notice')
ok('the page-load check opens the notice', notice !== null)
ok('the notice names the running version', notice?.textContent.includes('0.2.1-rc.2'))
ok('the notice names the latest version', notice?.textContent.includes('0.2.1-rc.5'))
ok('the notice names the newer next version', notice?.textContent.includes('0.2.2-rc.2'))
is('the notice lists current, latest, and next', notice?.querySelectorAll('.dsh-cfu-version').length, 3)
ok('the notice carries the exact update command', notice?.textContent.includes('npm install -g @deepseek-ai/dsh@0.2.2-rc.2'))
is('one registry request ran', fetchCount.value, 1)
is('one settings section was contributed', registrations.length, 1)
is('the settings section id is stable', registrations[0]?.options.id, 'check-for-update')
is('the settings section declares its locale namespace', registrations[0]?.options.locale, PLUGIN_ID)

notice?.querySelector('.dsh-cfu-close')?.click()
is('the close button removes the notice', first.window.document.querySelector('.dsh-cfu-notice'), null)
for (const dispose of disposers.reverse()) dispose()

const secondRegistrations = []
const secondDisposers = []
plugin.apply(context(first.window, secondRegistrations, secondDisposers))
await settle()
is('a same-day page load skips the registry fetch', fetchCount.value, 1)
is('a same-day page load opens no notice', first.window.document.querySelector('.dsh-cfu-notice'), null)
for (const dispose of secondDisposers.reverse()) dispose()

for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(`${checks} checks, ${failures.length} failed`)
if (failures.length > 0) process.exitCode = 1
