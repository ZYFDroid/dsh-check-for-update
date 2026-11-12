/**
 * Copy owned by dsh-check-for-update. Keys are identical in both languages;
 * the locale service supplies `{name}` substitution.
 */

/** Chinese dictionary. */
export const zh = {
  nav: '检查更新',
  title: '检查更新',
  description: '检查 DeepSeek Harness 是否有新版本。页面加载后每天最多自动检查一次；下方按钮可随时立即检查。',
  autoCheckNote: '自动检查每天最多执行一次。',
  manualCheckHint: '点击“立即检查”可无视每日限制。',
  current: '当前版本',
  latest: '最新版本',
  next: '候选版本（next）',
  nextNote: 'next 是尚未进入 latest 的候选版本，通常会更早发布。',
  unknown: '未知',
  notChecked: '尚未检查',
  checking: '正在检查…',
  upToDate: '已是最新版本',
  updateAvailable: '发现新版本',
  checkFailed: '检查失败：{message}',
  checkNow: '立即检查',
  commandLabel: '更新命令',
  copy: '复制',
  copied: '已复制',
  copyFailed: '复制失败',
  copyAria: '复制更新命令',
  restartHint: '更新后请重启 DeepSeek Harness。',
  currentVersionUnknown: '无法从当前页面读取正在运行的 DSH 版本。',
  close: '关闭',
  noticeAria: 'DSH 更新通知',
  noticeTitle: 'DSH 更新可用',
  noticeBody: '发现 DeepSeek Harness 新版本。',
} as const

/** Translation key domain. */
export type LocaleKey = keyof typeof zh

/** English dictionary: the same key set as {@link zh}. */
export const en: Record<LocaleKey, string> = {
  nav: 'Check for updates',
  title: 'Check for updates',
  description: 'Check whether a newer DeepSeek Harness version is available. The page checks automatically at most once a day; the button below checks again immediately.',
  autoCheckNote: 'Automatic checks run at most once a day.',
  manualCheckHint: 'The button checks immediately and ignores the daily limit.',
  current: 'Current version',
  latest: 'Latest version',
  next: 'Next version',
  nextNote: 'The next tag is a candidate release that has not reached latest yet.',
  unknown: 'Unknown',
  notChecked: 'Not checked yet',
  checking: 'Checking…',
  upToDate: 'You are up to date',
  updateAvailable: 'Update available',
  checkFailed: 'Check failed: {message}',
  checkNow: 'Check now',
  commandLabel: 'Update command',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  copyAria: 'Copy update command',
  restartHint: 'Restart DeepSeek Harness after updating.',
  currentVersionUnknown: 'Could not read the running DSH version from this page.',
  close: 'Close',
  noticeAria: 'DSH update notification',
  noticeTitle: 'DSH update available',
  noticeBody: 'A newer DeepSeek Harness version is available.',
}

/** Translator shaped like the locale service's bound function. */
export type Translate = (key: string, params?: Record<string, string | number>) => string
