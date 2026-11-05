# dsh-check-for-update

一个 client-only 的 DeepSeek Harness 插件：检查 `@deepseek-ai/dsh` 是否有新版本。

## 行为

- 页面载入后读取当前 DSH 版本（来自 client module manifest 的 `release.version`），
  请求 [`https://registry.npmjs.org/@deepseek-ai%2fdsh`](https://registry.npmjs.org/@deepseek-ai%2fdsh)，
  只比较 `dist-tags.latest`（忽略 `alpha` 等其它 tag）。
- 每天最多自动检查一次（按本地日历日，记录在
  `localStorage["dsh-check-for-update:last-check-day"]`）。
- 当 `latest !== 当前版本` 时，在右下角显示一个**不会自动消失**的提示，包含：
  - 当前版本
  - 最新版本
  - 更新命令：`npm install -g @deepseek-ai/dsh@<latest>`
  - 复制按钮
  - 关闭按钮（唯一的消失方式）
- 设置页面新增「检查更新」页：点击「立即检查」立刻请求，无视每天一次的限制；
  页面内同时显示当前版本、最新版本、检查结果和更新命令。

## 安装

### 方式一：从 GitHub 直接安装（推荐）

仓库里已提交 `lib/` 构建产物，因此可以直接从 GitHub 安装：

```powershell
# 升级/重装前先 remove：pnpm 会按 commit 缓存 git 源，
# 直接 add 可能仍然装到旧 commit 的构建产物。
dsh plugin --profile web remove dsh-check-for-update
dsh plugin --profile web add "github:ZYFDroid/dsh-check-for-update"
```

也可以显式指定分支：

```powershell
dsh plugin --profile web add "github:ZYFDroid/dsh-check-for-update#main"
```

> GitHub 直装固定在你安装时的 commit。仓库有新提交后，先 `remove` 再 `add`
> 才会拿到新的构建；`lib/` 已随源码提交，不需要在本地构建。

### 方式二：本地 tarball（离线 / 自测）

```powershell
# 在插件目录构建并打包
node_modules\.bin\tsdown
node tools/pack.mjs

# 安装到 web profile（路径换成实际 tgz）。
# 先 remove：pnpm 会按路径缓存 tarball，重新打包后直接 add 可能仍是旧内容。
dsh plugin --profile web remove dsh-check-for-update
dsh plugin --profile web add "C:\path\to\dsh-check-for-update\dist\dsh-check-for-update.tgz"
```

重启 DSH 或刷新 Web 页面后生效。

## 开发

```powershell
node_modules\.bin\tsc -p tsconfig.json
node_modules\.bin\tsc -p tsconfig.client.json
node_modules\.bin\vitest run
node_modules\.bin\tsdown
node tools/run-bundle-smoke.mjs
```

`vitest` 在 Windows 沙箱下需要 host 访问（Vite 启动时会用管道子进程探测盘符）。

## 兼容性

- `engines.dsh`: `>=0.2.1-rc.2`（`release.version` 自 0.2.1-alpha.4 起提供）
- 已按 **dsh 0.2.2-rc.1** 复核：client module manifest 仍带 `release.version`，
  `settings.section` 的注册参数与 `locale.register`/`bind` 契约未变，无需改源码
- 只使用 client 侧的 `slots`、`locale`、`modules` 服务；host 入口为空，不新增 host
  服务、设置、工具或 session event。
- 直接使用浏览器 `fetch` 访问 npm registry；失败只写日志/设置页错误，不弹提示。

## License

MIT
