# 模板来源分组回归（2026-10-27）

## 根因与修复

主进程 `templateCatalogFields` 按记录自身的 `builtin` 返回目录身份；内置来源的工作副本合法为 `custom` 并携带 `derivedFrom`。这表示可编辑记录，不表示新的模板来源。

模板页原实现虽按祖先分组，却以 `members.some(!builtin)` 判断「我的」。Seven、AI大白话、秋芝各有工作副本时，3 个内置组同时进入「我的」；另有 1 个自定义根，错误显示 4 组我的模板。封面选择器重复了此判定，且仅从可选资产追溯，丢失已回收或历史来源。

共享纯函数 `groupTemplates` 使用内容库元数据追溯根的真实 `builtin`，资产仅决定可选成员。内置与我的来源互斥；工作版本不改来源；自定义根及其所有工作副本保留在同一组。已回收/历史根仍可提供来源事实，但不重现为可选记录。缺失根或异常循环保留成员在「全部」，明确标为「来源待核实」，不猜测所属来源。全程不迁移或改写用户内容库。

## 红绿证据与验证

- `red.log`：未修复时运行真实 TemplatesPage（React/Semi/Electron）断言失败，实际 `3 组内置风格4 组我的模板`，期望 `1 组我的模板`。
- `renderer.log`：修复后同一隔离 fixture 通过；全量 4 组、内置 3 组、我的 1 组；切换 Seven 工作副本后仍显示内置；封面选择器「我的」仅显示真正自定义组。
- `node --test test/template-groups.test.mjs test/template-catalog.test.mjs`：11/11 通过；包含多级副本、自定义多版本、已回收及历史根、缺失根、循环、元数据优先。
- `node --test test/template-groups.test.mjs test/template-catalog.test.mjs test/covers.test.mjs`：53/53 通过，约119秒；见 `tests.log`。
- `npm run typecheck:renderer`：通过。
- Vite 只构建临时隔离 probe，未覆盖共享构建；构建仅有现有 chunk 体积提示。

## 设计规则与界限

- **Controls-03**：统计来自来源根；3+1=4，无重复计数。缺失来源单列待核实统计。
- **Template-03/04 / Controls-02**：沿用真实叠图、详情和可搜索工作版本入口。切换工作版本不改变所属组，也不隐藏多版本自定义根。
- **Layout-02 / Cover-01**：`mine-1280.png`、`mine-960.png` 与 `picker-mine-1280.png`、`picker-mine-960.png` 保留原模板页及生成弹层结构；隔离渲染宽度分别 1280、960，高度 860（窗口含系统边框，实际内容高度约 828）。检查无横向页面溢出。
- **Acceptance-01/02**：上述截图与行为断言仅覆盖本次来源计数、过滤、版本选择。图片为测试 SVG，不读取私人图像。未重新验收原生触摸板、空库、所有无关页面。
- **Acceptance-03**：在本机 macOS Electron 的独立临时用户目录运行实际 renderer；不代表已安装交付版、Windows 或其他架构、签名/打包验收。

复现命令：在 `workbench/` 执行 `node scripts/template-origin-ui-probe.mjs`，生成独立临时构建与 PNG 并打印路径。fixture 不访问真实内容库，也不触发生成或外部助手。
