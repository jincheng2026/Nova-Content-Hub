# legacy.context 封面生成界面验收 · 2026-10-28

使用当前生产 `CoverPanel` 组件，在独立 Chromium 中真实渲染；没有修改生产源码，没有操作真实应用或真实用户数据。测试上下文为 `topic`、`manuscript`、`title-only`，每种均在1280×860和960×680验证。

`cover-context-probe.mjs` 使用合成内容、1张合成SVG模板、空人物照片、空候选/任务，并提供完整真实读取入口：`readAutomatically` 返回 assets/currentCover；mock `window.contentHub` 响应 `readCoverDesigns`、`readCoverPackaging` 与 `readProductionCreation`。所有fixture token一致。没有伪造真实图像或生成结果。

运行：`node docs/verification/production/2026-10-28-cover-portable-fix/cover-context-probe.mjs`。

| 规则 | 核验结果 |
|---|---|
| Cover-01 / Reading-02 | topic 明示“可直接按已保存标题制作封面。选题内容仅作参考。”；可展开已保存选题参考，不冒充完成稿。两尺寸已截图 |
| Cover-01 / Reading-02 | manuscript 展示“已保存正文 · 17字”，可展开正文；正文未被替换为选题说明。两尺寸已截图 |
| Cover-01 / Reading-02 | title-only 明示“本篇尚未写正文，可直接按已保存标题制作封面。”；没有空正文警告。两尺寸已截图 |
| Cover-01 / Controls-01 | 6例均等待真实组件状态加载后断言 `#generate-cover.disabled=false`；按钮边界在viewport内。6例点击均进入实际组件 `generate()` 并调用mock `generateCover` |
| Surface-03 | 6例白底圆角连续；960下底部生成按钮可见，两栏内部保留滚动；本次只检视fixture所需内容 |
| Acceptance-01/02 | Vite打包成功（有隔离组件bundle超过500KB提示，不是运行失败），6例断言通过；真实截图及IPC调用记录见下 |
| Acceptance-03 | 这是浏览器组件渲染与合成IPC边界验证，不是实际任务落盘、助手启动、真实生图、图片回传、Electron最终包或Windows验收 |

截图：

- [topic 1280](cover-context-topic-1280.png) / [topic 960](cover-context-topic-960.png)
- [manuscript 1280](cover-context-manuscript-1280.png) / [manuscript 960](cover-context-manuscript-960.png)
- [title-only 1280](cover-context-title-only-1280.png) / [title-only 960](cover-context-title-only-960.png)

[完整结果及mock调用](cover-context-results.json)。没有断言“真实生成成功”；mock generateCover 仅返回原始空候选视图，`launchRequested:false`。
