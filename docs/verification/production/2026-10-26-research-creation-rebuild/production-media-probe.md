# 真实媒体播放与报告沙箱验收

2026-10-26，`darwin-arm64`，真实 Google Chrome。脚本直接导入源码 `ProductionPages`、`executeProduction`，建立真实临时内容库，通过真实 loopback HTTP 服务读取创作页、媒体与报告；没有 mock 本机服务或 worker。仅使用脚本生成的 8 秒 PCM 静音 WAV 与合成内联图表报告，没有读取私人录音或同事报告。临时库在结束时清理，源页面与生产代码未修改。

## 结果

`node --check workbench/scripts/production-media-probe.mjs` 和运行 probe 均以 0 退出。最终脱敏回执见 [production-media-probe.json](./production-media-probe.json)。

- 当前参考资产的 `Range: bytes=0-43` 返回 206、正确 Content-Range 与逐字节相同的 WAV 头；suffix Range 返回 206，越界返回 416。已登记但未引用于本篇的另一媒体资产返回 403。
- 创作页由真实 Pages 注入 `window.novaCreation` 与 CSP `media-src 'self'`。浏览器实际 `<video>` 解码成功：duration=8 秒、readyState=4、无媒体错误。点击“从 2.5 秒看原片”后 currentTime 实际推进到 2.736417 秒，paused=false、readyState=4，随后由探针暂停留图；不是仅检查 play 调用发生。稿件正文保持原样，原时间码文字完整。
- 报告 wrapper 的 iframe 使用 `sandbox="allow-scripts"`，报告响应同时具有 `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'`。报告内联 JS 真实把图表 B 从 0 改为 72%，并更新完成标记。
- 报告 frame `window.origin === 'null'`；访问 `parent.document` 抛出 `SecurityError`。Chrome 中 require／process／nova／electron 均 undefined。
- 报告主动尝试外部 fetch 与外部脚本加载，均产生已核验的 CSP violation（connect-src、script-src-elem）。额外安装的浏览器外部请求路由守卫实际收到 0 次请求，证明两个请求被 CSP 阻断于网络发送之前；若 CSP 回归，守卫会阻断出网并使验收失败。期望的 CSP console error 已单独记录，未捕获页面异常为 0。

此处 Node／IPC 检查发生在 Chrome 的报告 frame。Electron 的实际宿主桥接隔离与整包启动验收由主线程随后运行的 Electron probe 覆盖，本记录不替代该验收。

## 运行方式

仓库根目录：

```sh
node --check workbench/scripts/production-media-probe.mjs
node workbench/scripts/production-media-probe.mjs
```

脚本使用当前已有 Playwright 模块 `/tmp/llm-api-service-browser-check/node_modules/playwright/index.mjs` 和 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，不自动安装依赖或下载浏览器。可通过 `NOVA_PLAYWRIGHT_MODULE` 指定现成模块文件路径、`NOVA_CHROME_PATH` 指定现成 Chrome 路径、`UI_EVIDENCE_DIR` 指定证据目录；需要支持导入 `.mts` 的 Node。没有读取用户服务设置或密钥。

## 设计规则留痕

| 规则 ID | 本轮验收 |
|---|---|
| Foundation-01、Foundation-03、Surface-01 | 人工查看媒体窄窗与报告宽窗截图：现有创作页冷灰背景、实白卡片、文字层级与间距保留；合成报告按既有颜色与文字层级生成。 |
| Layout-01、Controls-01 | 1440×1000、900×800 运行截图；900 宽创作页无横向溢出，原片 controls、时间码定位按钮、完整正文区域可访问。 |
| Reading-02 | 原识别稿、校正版、参考拆解与时间码仍完整保留；原片与定位并存，没有用播放器覆盖原文。报告完整图表及状态标记可读。 |
| Interaction-03 | 本轮仅新增 probe 和证据，不修改业务源或引入任意路径接口。当前内容引用鉴权、真实媒体 Range 与报告隔离均经原服务链路验证。 |

截图：[媒体 1440](./media-real-chrome-1440x1000.png)、[媒体 900](./media-real-chrome-900x800.png)、[内联报告 1440](./report-inline-sandbox-1440x1000.png)、[内联报告 900](./report-inline-sandbox-900x800.png)。本轮未 build、commit 或交付安装包；其他平台和实际系统安装展示不在此记录覆盖范围内。
