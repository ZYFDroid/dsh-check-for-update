/** Styles shared by the persistent notice and the Settings section. */

const STYLE_TAG = 'dsh-check-for-update'

const CSS = String.raw`
.dsh-cfu-notice {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 40px));
  padding: 16px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  border-radius: var(--dsw-radius-xl, 20px);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #16181d);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  font-size: 13px;
  line-height: 20px;
  animation: dsh-cfu-in 160ms ease-out both;
}

@keyframes dsh-cfu-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-cfu-notice { animation: none; }
}

@media (max-width: 520px) {
  .dsh-cfu-notice {
    right: 12px;
    left: 12px;
    bottom: 12px;
    width: auto;
  }
}

.dsh-cfu-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-cfu-badge {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary, #4176e6);
  color: #ffffff;
  font-size: 11px;
  line-height: 16px;
}

.dsh-cfu-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}

.dsh-cfu-close {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 18px;
  line-height: 26px;
  cursor: pointer;
}

.dsh-cfu-close:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
}

.dsh-cfu-close:focus-visible,
.dsh-cfu-button:focus-visible,
.dsh-cfu-primary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 1px;
}

.dsh-cfu-body {
  margin: 8px 0 0;
  color: var(--dsw-alias-label-secondary, #565b63);
}

.dsh-cfu-versions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}

.dsh-cfu-version {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.dsh-cfu-version span {
  color: var(--dsw-alias-label-tertiary, #7b818a);
}

.dsh-cfu-version code,
.dsh-cfu-command code,
.dsh-cfu-row-value {
  font-family: var(--ds-font-family-code, 'SF Mono', Consolas, monospace);
  font-size: 12px;
}

.dsh-cfu-label {
  margin: 12px 0 6px;
  color: var(--dsw-alias-label-tertiary, #7b818a);
  font-size: 12px;
}

.dsh-cfu-command {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.03));
}

.dsh-cfu-command code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: thin;
}

.dsh-cfu-button {
  flex: none;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}

.dsh-cfu-button:hover {
  background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1));
}

.dsh-cfu-hint {
  margin: 10px 0 0;
  color: var(--dsw-alias-label-tertiary, #7b818a);
  font-size: 12px;
  line-height: 18px;
}

.dsh-cfu-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
  color: var(--dsw-alias-label-primary, #16181d);
}

.dsh-cfu-section-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}

.dsh-cfu-section-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-tertiary, #7b818a);
}

.dsh-cfu-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14)));
  border-radius: var(--dsw-radius-xl, 20px);
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, #ffffff));
}

.dsh-cfu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dsh-cfu-row-label {
  color: var(--dsw-alias-label-tertiary, #7b818a);
  font-size: 13px;
}

.dsh-cfu-row-value {
  color: var(--dsw-alias-label-primary, #16181d);
}

.dsh-cfu-status {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
}

.dsh-cfu-status-ok { color: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-cfu-status-update { color: var(--dsw-alias-state-warn-primary, #f59e0b); }
.dsh-cfu-status-error { color: var(--dsw-alias-state-error-primary, #ef4444); }

.dsh-cfu-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-cfu-primary {
  padding: 5px 14px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-button-primary-fill, #16181d);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  font: inherit;
  font-size: 13px;
  line-height: 22px;
  font-weight: 500;
  cursor: pointer;
}

.dsh-cfu-primary:hover {
  background: var(--dsw-alias-button-primary-hover, #33363b);
}

.dsh-cfu-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.dsh-cfu-note {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #7b818a);
  font-size: 12px;
  line-height: 18px;
}
`

/**
 * Inject the shared stylesheet once per document.
 * @returns nothing.
 */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-plugin="${STYLE_TAG}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset.dshPlugin = STYLE_TAG
  style.textContent = CSS
  document.head.appendChild(style)
}
