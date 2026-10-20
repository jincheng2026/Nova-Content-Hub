# 0.3.32 A 组冻结与 Apple Silicon 交付

用户批准 A1—A7、合并 main、锁定 tag 和 arm64 Mac 安装包；保留 qoder/review 既有变更，并明确暂缓 Developer ID 签名与公证。本目录记录主线程独立验收，实施与原生探针原始证据见[实现记录](../2026-10-20-a-group-0332/README.md)。权威交付标准为根目录 [AGENTS.md](../../../../AGENTS.md)。

## 源码与功能

- A1：顶部渠道多选同时作用于日历和当天；当天搜索/状态独立。
- A2：当天总数、匹配数、空态、查看全部与分页保持一致。
- A3：日期/外部定位遵守详情和未保存草稿保护。
- A4：列表与日历共享日期投影。
- A5：提交成功与刷新失败分开，保存期间的新编辑仍受保护。
- A6：冲突保留草稿，明确准备另存且仍需保存，不覆盖外部更改。
- A7：模板备注纳入切页/退出保护，提交失败保留输入。

实现提交 `ef22386c9b889403cf3174e016d5add12cacb5e0`；项目 AGENTS.md 提交 `d780f13`。版本、锁文件和 prototype build-config 一并升至 0.3.32，无依赖升级。未扩展 B 组性能重构或 C 组视觉改版。

## 独立验证

`npm run verify` 退出 0：1077 项、1075 通过、0 失败、2 条条件集成默认跳过。两条随后分别显式运行，各 1/1 通过。生产运行依赖 `npm audit --omit=dev --json` 为 0 漏洞。详见 [verification.json](verification.json)、[完整日志](logs/verify.log)及 gated 日志。

三支真实 React/Semi/Electron 界面探针由主线程独立复跑通过，覆盖实际 App 导航、关闭和保存事件；IPC 为合成桥，不访问真实用户库。证据位于 `independent-ui/`。原生主进程、utilityProcess、preload、真实库导入/恢复、sharp、配对、CSP 和重开由 `npm run probe:desktop` 另行覆盖。

## 发行记录

冻结源码、tag、最终 DMG、SHA256、原生安装和实机界面结果在最终交付后写入本节及机器收据。打包使用原生 arm64 runner、清洁提交和 sealed native payload；`verify-package.mjs` 比对提交/锁文件、全部原生负载、最终 app/DMG 字节、配套插件和可写示例副本。`install.mjs` 使用实际机器绑定并保全内容库；`final-integrity.mjs` 在实际退出/重开后复核。

该渠道为本地免登录预览发行，ad hoc 签名，不宣称已完成 Developer ID、公证或所有平台生产门禁。Intel Mac、Windows、当前版本两宿主新生图、真实卸载均须分别验收，不能从 arm64 结果推断。
