window.__ModuleLoader__.load({
	id: "dsh-check-for-update",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/clipboard.ts
		/**
		* Clipboard write with a jsdom/older-host fallback. Kept local so the plugin
		* depends on no ui-primitives value export.
		*
		* @param text - the exact text to place on the clipboard.
		* @returns true only when the host accepted the write.
		*/
		async function writeClipboard(text) {
			if (navigator.clipboard?.writeText) try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				return false;
			}
			const exec = typeof document.execCommand === "function" ? document.execCommand.bind(document) : void 0;
			if (exec === void 0) return false;
			const area = document.createElement("textarea");
			area.value = text;
			area.setAttribute("readonly", "");
			area.style.position = "fixed";
			area.style.left = "-9999px";
			document.body.appendChild(area);
			area.select();
			try {
				return exec("copy");
			} catch {
				return false;
			} finally {
				area.remove();
			}
		}
		//#endregion
		//#region src/client/update-core.ts
		/**
		* Pure update-check primitives: registry parsing, version ordering, command
		* formatting, release extraction, and the once-a-day gate. Kept DOM-free so the
		* rules are testable without a browser.
		*/
		/** Canonical npm registry document for the DSH package. */
		const REGISTRY_URL = "https://registry.npmjs.org/@deepseek-ai%2fdsh";
		/** localStorage key holding the local calendar day of the last successful check. */
		const LAST_CHECK_KEY = "dsh-check-for-update:last-check-day";
		/**
		* Read the host release identity carried by a boot manifest.
		* @param value - the boot manifest or another object carrying a `release` member.
		* @returns the non-empty version string, or null when absent/malformed.
		*/
		function readReleaseVersion(value) {
			if (typeof value !== "object" || value === null) return null;
			const release = Reflect.get(value, "release");
			if (typeof release !== "object" || release === null) return null;
			const version = Reflect.get(release, "version");
			return typeof version === "string" && version.trim() !== "" ? version : null;
		}
		/**
		* Parse a semver-shaped DSH version. Build metadata is accepted and ignored.
		* @param value - version text.
		* @returns the parsed version, or null when the text is not semver-shaped.
		*/
		function parseVersion(value) {
			const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value.trim());
			if (match === null) return null;
			return {
				major: Number(match[1]),
				minor: Number(match[2]),
				patch: Number(match[3]),
				prerelease: match[4] === void 0 ? [] : match[4].split(".")
			};
		}
		/**
		* Compare prerelease identifier lists with semver precedence.
		* @param left - left identifiers (empty for a release).
		* @param right - right identifiers.
		* @returns negative, zero, or positive when left sorts before/equal/after right.
		*/
		function comparePrerelease(left, right) {
			if (left.length === 0 || right.length === 0) {
				if (left.length === right.length) return 0;
				return left.length === 0 ? 1 : -1;
			}
			const shared = Math.min(left.length, right.length);
			for (let index = 0; index < shared; index += 1) {
				const a = left[index] ?? "";
				const b = right[index] ?? "";
				const aNumeric = /^\d+$/u.test(a);
				const bNumeric = /^\d+$/u.test(b);
				if (aNumeric && bNumeric) {
					const difference = Number(a) - Number(b);
					if (difference !== 0) return difference < 0 ? -1 : 1;
				} else if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
				else if (a !== b) return a < b ? -1 : 1;
			}
			if (left.length === right.length) return 0;
			return left.length < right.length ? -1 : 1;
		}
		/**
		* Compare two DSH versions with semver precedence. Unparseable inputs fall
		* back to string comparison so a malformed manifest cannot crash a page load.
		* @param left - left version.
		* @param right - right version.
		* @returns negative when left is older, zero when equal, positive when newer.
		*/
		function compareVersions(left, right) {
			const a = parseVersion(left);
			const b = parseVersion(right);
			if (a === null || b === null) {
				if (left === right) return 0;
				return left < right ? -1 : 1;
			}
			if (a.major !== b.major) return a.major < b.major ? -1 : 1;
			if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
			if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
			return comparePrerelease(a.prerelease, b.prerelease);
		}
		/**
		* Extract the registry tags this plugin checks. `next` is kept only when it is
		* strictly newer than `latest`, because an older next tag must not be offered
		* as an upgrade and a promoted next tag is already latest.
		* @param payload - parsed registry JSON.
		* @returns the latest version and the meaningful next version.
		* @throws {Error} when the document does not carry a usable latest tag.
		*/
		function registryTagsOf(payload) {
			if (typeof payload !== "object" || payload === null) throw new Error("registry response is not an object");
			const tags = Reflect.get(payload, "dist-tags");
			if (typeof tags !== "object" || tags === null) throw new Error("registry response has no dist-tags object");
			const rawLatest = Reflect.get(tags, "latest");
			if (typeof rawLatest !== "string" || rawLatest.trim() === "") throw new Error("registry response has no latest dist-tag");
			const latest = rawLatest.trim();
			const rawNext = Reflect.get(tags, "next");
			const next = typeof rawNext === "string" && rawNext.trim() !== "" ? rawNext.trim() : null;
			return {
				latest,
				next: next !== null && compareVersions(next, latest) > 0 ? next : null
			};
		}
		/**
		* Fetch the registry document and return its latest and next tags.
		* @param fetchImpl - fetch implementation (tests inject a stub).
		* @param url - registry document URL.
		* @returns the parsed tags.
		* @throws {Error} on a non-2xx response or an unusable document.
		*/
		async function fetchRegistryTags(fetchImpl = globalThis.fetch, url = REGISTRY_URL) {
			const response = await fetchImpl(url, {
				headers: { accept: "application/json" },
				cache: "no-store"
			});
			if (!response.ok) throw new Error(`registry responded with HTTP ${response.status}`);
			return registryTagsOf(await response.json());
		}
		/**
		* Whether the running version is older than the version worth installing.
		* Installing a version the running page is already ahead of would be a
		* downgrade, so ordering matters here rather than plain inequality.
		* @param current - running version, or null when unknown.
		* @param target - latest or next version.
		* @returns true only when both are known and current is older.
		*/
		function updateAvailable(current, target) {
			return current !== null && compareVersions(current, target) < 0;
		}
		/**
		* The version the update command should install for one check.
		* @param tags - registry tags.
		* @returns the next tag when usable, else latest.
		*/
		function targetVersionOf(tags) {
			return tags.next ?? tags.latest;
		}
		/**
		* The exact command a user copies to upgrade the global install.
		* @param version - version to install.
		* @returns `npm install -g @deepseek-ai/dsh@<version>`.
		*/
		function updateCommand(version) {
			return `npm install -g @deepseek-ai/dsh@${version}`;
		}
		/**
		* Local calendar day key (`YYYY-MM-DD`) used by the daily gate.
		* @param now - clock reading.
		* @returns the local date.
		*/
		function localDay(now) {
			return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		}
		/**
		* Build a daily gate backed by storage. Storage failures disable persistence
		* (the page then checks every load) but never break the plugin.
		* @param storage - localStorage-like object, or null when unavailable.
		* @param now - clock reading.
		* @returns the gate.
		*/
		function createDailyGate(storage, now = () => /* @__PURE__ */ new Date()) {
			return {
				canCheck() {
					try {
						return storage?.getItem(LAST_CHECK_KEY) !== localDay(now());
					} catch {
						return true;
					}
				},
				markChecked() {
					try {
						storage?.setItem(LAST_CHECK_KEY, localDay(now()));
					} catch {}
				}
			};
		}
		/**
		* Browser localStorage, or null when the page cannot access it.
		* @returns the storage object or null.
		*/
		function browserStorage() {
			try {
				return typeof localStorage === "undefined" ? null : localStorage;
			} catch {
				return null;
			}
		}
		/**
		* Human-readable message for an unknown thrown value.
		* @param error - caught value.
		* @returns the message text.
		*/
		function errorMessage(error) {
			if (error instanceof Error) return error.message;
			return typeof error === "string" ? error : String(error);
		}
		//#endregion
		//#region src/client/UpdateSettingsSection.tsx
		/** Settings page: manual update check plus the last result. */
		/**
		* Render the Check for updates settings section.
		* @param props - controller and locale seat.
		* @returns the section body.
		*/
		function UpdateSettingsSection({ controller, t }) {
			const [status, setStatus] = (0, react.useState)(() => controller.lastResult === null ? { kind: "idle" } : {
				kind: "done",
				result: controller.lastResult
			});
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const currentVersion = controller.currentVersion;
			const result = status.kind === "done" ? status.result : null;
			const nextVersion = result?.nextVersion ?? null;
			const command = result?.updateAvailable === true ? updateCommand(result.targetVersion) : null;
			let statusText;
			let statusClass = "dsh-cfu-status";
			if (status.kind === "checking") statusText = t("checking");
			else if (status.kind === "error") {
				statusText = t("checkFailed", { message: status.message });
				statusClass += " dsh-cfu-status-error";
			} else if (status.kind === "done" && status.result.updateAvailable) {
				statusText = t("updateAvailable");
				statusClass += " dsh-cfu-status-update";
			} else if (status.kind === "done") {
				statusText = t("upToDate");
				statusClass += " dsh-cfu-status-ok";
			} else statusText = t("notChecked");
			const check = () => {
				if (status.kind === "checking") return;
				setStatus({ kind: "checking" });
				controller.check().then((checked) => {
					if (alive.current) setStatus({
						kind: "done",
						result: checked
					});
				}, (error) => {
					if (alive.current) setStatus({
						kind: "error",
						message: errorMessage(error)
					});
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-cfu-section",
				"aria-labelledby": "dsh-cfu-settings-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "dsh-cfu-settings-title",
						className: "dsh-cfu-section-title",
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-cfu-section-desc",
						children: t("description")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-cfu-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-cfu-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cfu-row-label",
									children: t("current")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: "dsh-cfu-row-value",
									children: currentVersion ?? t("unknown")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-cfu-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cfu-row-label",
									children: t("latest")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: "dsh-cfu-row-value",
									children: result?.latestVersion ?? "—"
								})]
							}),
							nextVersion !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-cfu-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cfu-row-label",
									children: t("next")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: "dsh-cfu-row-value",
									children: nextVersion
								})]
							}),
							nextVersion !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-cfu-note",
								children: t("nextNote")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: statusClass,
								role: "status",
								children: statusText
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-cfu-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-cfu-primary",
									type: "button",
									disabled: status.kind === "checking",
									onClick: check,
									children: status.kind === "checking" ? t("checking") : t("checkNow")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-cfu-note",
								children: t("autoCheckNote")
							}),
							currentVersion === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-cfu-note",
								children: t("currentVersionUnknown")
							})
						]
					}),
					command !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-cfu-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-cfu-row",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cfu-row-label",
									children: t("commandLabel")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommandRow, {
								command,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-cfu-note",
								children: t("restartHint")
							})
						]
					})
				]
			});
		}
		/**
		* Command text with a copy button and transient success/failure label.
		* @param props - command and locale seat.
		* @returns the command row.
		*/
		function CommandRow({ command, t }) {
			const [copied, setCopied] = (0, react.useState)(null);
			const timer = (0, react.useRef)(null);
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
					if (timer.current !== null) clearTimeout(timer.current);
				};
			}, []);
			const copy = () => {
				writeClipboard(command).then((ok) => {
					if (!alive.current) return;
					setCopied(ok);
					if (timer.current !== null) clearTimeout(timer.current);
					timer.current = setTimeout(() => {
						if (alive.current) setCopied(null);
					}, 1600);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-cfu-command",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: command }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsh-cfu-button",
					type: "button",
					"aria-label": t("copyAria"),
					onClick: copy,
					children: copied === true ? t("copied") : copied === false ? t("copyFailed") : t("copy")
				})]
			});
		}
		//#endregion
		//#region src/client/controller.ts
		/** Shared checker behind both the automatic path and the Settings page. */
		var UpdateController = class {
			/** Running version captured when the plugin applied. */
			currentVersion;
			options;
			now;
			inFlight = null;
			last = null;
			disposed = false;
			/**
			* @param options - checker dependencies.
			*/
			constructor(options) {
				this.options = options;
				this.currentVersion = options.currentVersion;
				this.now = options.now ?? (() => /* @__PURE__ */ new Date());
			}
			/** Most recent successful result, or null before the first check. */
			get lastResult() {
				return this.last;
			}
			/**
			* Run a check immediately, sharing an already-running request. A successful
			* check records today's date in the daily gate, so a manual check also
			* satisfies the automatic path for the rest of the day.
			* @returns the completed result.
			* @throws when the registry fetch or document parsing fails.
			*/
			check() {
				return this.start(true);
			}
			/**
			* Run the page-load check when the current version is known and today's
			* automatic slot is unused. The attempt consumes the day before the request
			* starts, so a reload loop cannot repeatedly hit the registry; failures stay
			* diagnostic and never surface a notice.
			* @returns after the check settles.
			*/
			async autoCheck() {
				if (this.disposed || this.currentVersion === null) return;
				if (!this.options.gate.canCheck()) return;
				this.options.gate.markChecked();
				try {
					await this.start(false);
				} catch (error) {
					this.options.log?.("dsh-check-for-update: automatic check failed", error);
				}
			}
			/** Stop publishing notices; an in-flight request may still settle. */
			dispose() {
				this.disposed = true;
			}
			/**
			* Start one shared request.
			* @param record - whether a successful check records the day (manual path).
			* @returns the completed result.
			*/
			start(record) {
				if (this.inFlight !== null) return this.inFlight;
				const run = this.performCheck(record);
				this.inFlight = run;
				run.then(() => {
					if (this.inFlight === run) this.inFlight = null;
				}, () => {
					if (this.inFlight === run) this.inFlight = null;
				});
				return run;
			}
			/**
			* Fetch, compare, publish, and (for the manual path) record one check.
			* @param record - whether a successful check records the day.
			* @returns the completed result.
			*/
			async performCheck(record) {
				const tags = await this.options.fetchTags();
				const targetVersion = targetVersionOf(tags);
				const currentVersion = this.currentVersion;
				const result = {
					currentVersion,
					latestVersion: tags.latest,
					nextVersion: tags.next,
					targetVersion,
					updateAvailable: updateAvailable(currentVersion, targetVersion),
					checkedAt: this.now().getTime()
				};
				if (this.disposed) return result;
				this.last = result;
				if (record) this.options.gate.markChecked();
				if (result.updateAvailable) this.options.notice.show(result);
				return result;
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy owned by dsh-check-for-update. Keys are identical in both languages;
		* the locale service supplies `{name}` substitution.
		*/
		/** Chinese dictionary. */
		const zh = {
			nav: "检查更新",
			title: "检查更新",
			description: "检查 DeepSeek Harness 是否有新版本。页面加载后每天最多自动检查一次；下方按钮可随时立即检查。",
			autoCheckNote: "自动检查每天最多执行一次。",
			manualCheckHint: "点击“立即检查”可无视每日限制。",
			current: "当前版本",
			latest: "最新版本",
			next: "候选版本（next）",
			nextNote: "next 是尚未进入 latest 的候选版本，通常会更早发布。",
			unknown: "未知",
			notChecked: "尚未检查",
			checking: "正在检查…",
			upToDate: "已是最新版本",
			updateAvailable: "发现新版本",
			checkFailed: "检查失败：{message}",
			checkNow: "立即检查",
			commandLabel: "更新命令",
			copy: "复制",
			copied: "已复制",
			copyFailed: "复制失败",
			copyAria: "复制更新命令",
			restartHint: "更新后请重启 DeepSeek Harness。",
			currentVersionUnknown: "无法从当前页面读取正在运行的 DSH 版本。",
			close: "关闭",
			noticeAria: "DSH 更新通知",
			noticeTitle: "DSH 更新可用",
			noticeBody: "发现 DeepSeek Harness 新版本。"
		};
		/** English dictionary: the same key set as {@link zh}. */
		const en = {
			nav: "Check for updates",
			title: "Check for updates",
			description: "Check whether a newer DeepSeek Harness version is available. The page checks automatically at most once a day; the button below checks again immediately.",
			autoCheckNote: "Automatic checks run at most once a day.",
			manualCheckHint: "The button checks immediately and ignores the daily limit.",
			current: "Current version",
			latest: "Latest version",
			next: "Next version",
			nextNote: "The next tag is a candidate release that has not reached latest yet.",
			unknown: "Unknown",
			notChecked: "Not checked yet",
			checking: "Checking…",
			upToDate: "You are up to date",
			updateAvailable: "Update available",
			checkFailed: "Check failed: {message}",
			checkNow: "Check now",
			commandLabel: "Update command",
			copy: "Copy",
			copied: "Copied",
			copyFailed: "Copy failed",
			copyAria: "Copy update command",
			restartHint: "Restart DeepSeek Harness after updating.",
			currentVersionUnknown: "Could not read the running DSH version from this page.",
			close: "Close",
			noticeAria: "DSH update notification",
			noticeTitle: "DSH update available",
			noticeBody: "A newer DeepSeek Harness version is available."
		};
		//#endregion
		//#region src/client/styles.ts
		/** Styles shared by the persistent notice and the Settings section. */
		const STYLE_TAG = "dsh-check-for-update";
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
`;
		/**
		* Inject the shared stylesheet once per document.
		* @returns nothing.
		*/
		function ensureStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-dsh-plugin="${STYLE_TAG}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.dshPlugin = STYLE_TAG;
			style.textContent = CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/notice.ts
		/**
		* Persistent bottom-right update notice. It never retires on a timer: only
		* the close button (or plugin teardown) removes it.
		*/
		/**
		* Create one element with a class and optional text.
		* @param tag - element tag.
		* @param className - class list.
		* @param text - text content when supplied.
		* @returns the created element.
		*/
		function element(tag, className, text) {
			const node = document.createElement(tag);
			if (className !== "") node.className = className;
			if (text !== void 0) node.textContent = text;
			return node;
		}
		/** Imperative notice rendered into `document.body`. */
		var DshUpdateNotice = class {
			t;
			root = null;
			result = null;
			/**
			* @param t - locale-bound translator.
			*/
			constructor(t) {
				this.t = t;
			}
			/** @inheritdoc */
			show(result) {
				if (typeof document === "undefined") return;
				this.result = result;
				ensureStyles();
				if (this.root === null) {
					const root = element("div", "dsh-cfu-notice");
					root.setAttribute("role", "alert");
					root.setAttribute("aria-label", this.t("noticeAria"));
					document.body.appendChild(root);
					this.root = root;
				}
				this.render();
			}
			/** @inheritdoc */
			dispose() {
				this.root?.remove();
				this.root = null;
				this.result = null;
			}
			/** Rebuild the notice body from the current result. */
			render() {
				const root = this.root;
				const result = this.result;
				if (root === null || result === null) return;
				root.replaceChildren();
				const head = element("div", "dsh-cfu-head");
				const badge = element("span", "dsh-cfu-badge", this.t("updateAvailable"));
				const title = element("span", "dsh-cfu-title", this.t("noticeTitle"));
				const close = element("button", "dsh-cfu-close", "×");
				close.type = "button";
				close.setAttribute("aria-label", this.t("close"));
				close.addEventListener("click", () => {
					this.dispose();
				});
				head.append(badge, title, close);
				const body = element("p", "dsh-cfu-body", this.t("noticeBody"));
				const versions = element("div", "dsh-cfu-versions");
				versions.append(this.versionRow(this.t("current"), result.currentVersion ?? this.t("unknown")), this.versionRow(this.t("latest"), result.latestVersion));
				if (result.nextVersion !== null) versions.append(this.versionRow(this.t("next"), result.nextVersion));
				const command = updateCommand(result.targetVersion);
				const label = element("div", "dsh-cfu-label", this.t("commandLabel"));
				const commandRow = element("div", "dsh-cfu-command");
				const code = element("code", "", command);
				const copy = element("button", "dsh-cfu-button", this.t("copy"));
				copy.type = "button";
				copy.setAttribute("aria-label", this.t("copyAria"));
				copy.addEventListener("click", () => {
					this.copy(command, copy);
				});
				commandRow.append(code, copy);
				const hint = element("p", "dsh-cfu-hint", this.t("restartHint"));
				root.append(head, body, versions, label, commandRow, hint);
			}
			/**
			* Build one labelled version row.
			* @param label - row label.
			* @param value - version text.
			* @returns the row.
			*/
			versionRow(label, value) {
				const row = element("div", "dsh-cfu-version");
				row.append(element("span", "", label), element("code", "", value));
				return row;
			}
			/**
			* Copy the command and reflect the outcome on the button.
			* @param command - update command.
			* @param button - copy button still mounted in this notice.
			*/
			async copy(command, button) {
				const copied = await writeClipboard(command);
				if (this.root === null || !this.root.contains(button)) return;
				button.textContent = copied ? this.t("copied") : this.t("copyFailed");
				globalThis.setTimeout(() => {
					if (this.root?.contains(button) === true) button.textContent = this.t("copy");
				}, 1600);
			}
		};
		//#endregion
		//#region src/client/index.tsx
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
		/** Locale namespace owned by this plugin. */
		const NS = "dsh-check-for-update";
		/** Services required by the Settings registration and release lookup. */
		const inject = [
			"slots",
			"locale",
			"modules"
		];
		/**
		* Read the running version from the module manifest, falling back to the boot
		* graph that the Web shell exposes globally.
		* @param modules - client module system.
		* @returns the version string or null.
		*/
		function currentVersionOf(modules) {
			return readReleaseVersion(modules.manifest) ?? readReleaseVersion(Reflect.get(globalThis, "__DSH_BOOT__"));
		}
		/**
		* Install the checker, its persistent notice, and the Settings page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-check-for-update: dictionaries");
			const t = ctx.locale.bind(NS);
			const currentVersion = currentVersionOf(ctx.modules);
			const notice = new DshUpdateNotice(t);
			const controller = new UpdateController({
				currentVersion,
				fetchTags: () => fetchRegistryTags(),
				notice,
				gate: createDailyGate(browserStorage()),
				log: (message, error) => {
					ctx.logger?.warn(message, error);
				}
			});
			ctx.effect(() => {
				const start = () => {
					controller.autoCheck();
				};
				let timer;
				if (typeof document !== "undefined") {
					if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
					else timer = globalThis.setTimeout(start, 0);
				}
				return () => {
					if (timer !== void 0) clearTimeout(timer);
					if (typeof document !== "undefined") document.removeEventListener("DOMContentLoaded", start);
					controller.dispose();
					notice.dispose();
				};
			}, "dsh-check-for-update: page-load check");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "check-for-update",
				order: 90,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ controller })
			}, UpdateSettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
