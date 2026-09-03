<h1 align="center">DSH-USAGE-PANEL</h1>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-4d6bfe" height="20" alt="license-MIT" />&ensp;
  <img src="https://img.shields.io/badge/version-0.2.0-7c5cff" height="20" alt="version" />&ensp;
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-Web-blue" height="20" alt="platform" />&ensp;
  <img src="https://img.shields.io/badge/node-%E2%89%A520-30d158" height="20" alt="node" />&ensp;
  <img src="https://img.shields.io/badge/UI-%E4%B8%AD%E6%96%87-ff9f0a" height="20" alt="ui" />
</p>

> 🪟 DeepSeek Harness（DSH）Web 悬浮用量面板 —— 未央最爱的 macOS 毛玻璃 · 中文界面 · 官方余额 · Token 用量曲线。

Floating macOS-glass **usage panel** for DeepSeek Harness Web: live official
balance + token usage (today / session / 24 h smooth trend / per-model).
`Token` 等有歧义名词未做翻译。

## ✨ 功能

- 💰 **官方余额**：轮询 `GET /user/balance`，只显示官方字段（当前余额、充值余额）。
- 📊 **Token 用量**：今日 / 会话 / 近 24 小时平滑曲线（输入·输出，含缓存命中/未命中明细）/ 按模型占比。
- 🖱️ **交互**：胶囊 ⇄ 面板拖动；点击 / 红绿灯 / `ESC` 收起（带过渡动画）；面板按胶囊位置自动选择展开方向；↻ 一键刷新（旋转 + 「已刷新」反馈）。
- 🚫 无需频繁打开 platform.deepseek.com/usage。

## 📦 安装与卸载

### 安装

```bash
# 方式一：在线安装（推荐）
dsh plugin --profile web add dsh-usage-panel

# 方式二：从源码安装
dsh plugin --profile web add "link:/你的路径/dsh-usage-panel"
```

装完重启 `dsh web` 并硬刷新浏览器（`Ctrl/Cmd + Shift + R`）。若未自动加入
bundle，把 `dsh-usage-panel` 追加到 profile `package.json` 的
`dsh.profile.bundles`。

**API Key（余额必需）** —— 在 `~/.dsh/.credentials.yaml` 配置（插件直读，不注入浏览器）：

```yaml
version: 1
refs:
  DEEPSEEK_API_KEY: sk-你的key
```

也可设置环境变量 `DEEPSEEK_API_KEY` 或 `DSH_USAGE_HUD_API_KEY`。

### 卸载

```bash
# 方式一：CLI 卸载（移除依赖与 bundles 项）
dsh plugin --profile web remove dsh-usage-panel

# 方式二：手动清理
pnpm --dir C:\Users\Administrator\.dsh\profiles\web remove dsh-usage-panel
# 并手动把 package.json 的 dsh.profile.bundles 中的 "dsh-usage-panel" 移除
```

重启 `dsh web` 即完全生效。（可选）删除本地数据目录
`$DSH_HOME/dsh-usage-panel/` 或 `<profile>/.dsh-usage/` 以清理历史用量记录。

## 🖱️ 使用

- 右下角胶囊显示 余额 / 今日 / 会话，可拖动、位置自动记忆。
- 轻点胶囊展开面板：余额卡、近 24 小时曲线、按模型统计、DeepSeek 用量页链接。
- 三个 MAC 圆点或 `ESC` 收起；右上 ↻ 立即刷新。

## ⚙️ 配置项

在 profile 的 `cordis.patch.yml` 中按行 id 覆盖：

```yaml
- id: usage-panel
  config:
    pollIntervalMs: 300000   # 余额轮询间隔（毫秒，最小 60000）
    historyHours: 72         # 历史小时桶保留数
    baseURL: https://api.deepseek.com   # 覆盖接口地址
    apiKeyRef: DEEPSEEK_API_KEY         # 凭据引用名
    dataDir: null            # 覆盖数据目录（默认 $DSH_HOME/dsh-usage-panel）
```

## 🔒 数据与隐私

- 🔑 API Key 仅存在于宿主（Node）进程，浏览器只收到解析后的余额快照。
- 🗄️ 用量历史写入数据目录 `state.json`（原子写入、自动裁剪），更换安装方式自动迁移旧数据。
- 🌐 网络请求：每轮询周期一次官方余额接口；无其它外发流量。

## 📄 许可

MIT License —— 见 [LICENSE](LICENSE)。
