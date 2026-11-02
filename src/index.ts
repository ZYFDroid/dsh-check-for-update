/**
 * Host loader entry for the dsh-check-for-update plugin.
 *
 * The whole plugin lives in the browser half (`src/client/`): it reads the
 * running DSH release from the client module manifest, fetches the npm
 * registry's `latest` dist-tag, and presents the result in the Web UI. No host
 * service, setting, or session log changes, so this entry only satisfies the
 * plugin protocol.
 */

/** Host entry: no host-side contribution; the client half owns the plugin. */
export function apply(): void {}
