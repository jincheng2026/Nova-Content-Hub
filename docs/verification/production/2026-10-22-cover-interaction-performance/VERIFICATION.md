# 主线程收敛记录

2026-10-22。范围为本次封面交互、详情读取性能与助手能力一致性要求；保留上一轮未提交的固定请求、短跳转和本地进度改动。未修改发布版本、安装应用、访问真实用户库、调用真实生图或提交 Git。

## 最终验证

| 验证 | 结果 | 记录 |
|---|---|---|
| native + renderer 类型检查 | PASS | `typecheck.log` |
| 插件 `npm run build:both` | required / disabled PASS | 当前 0.3.39 源码构建；不是发行验收 |
| `npm run build:desktop -- --auth both` | 两模式 PASS | 最后一次在正文页签修复后重建，`desktop-build.log`；darwin-arm64，experimental，productionReady=false |
| bundled CLI + shared progress | 18/18 PASS | `host-contract-regressions.log`：完整 CLI 文件13项、共享投影5项。两种任务 × 两宿主经过两种等待、恢复、claim 与终态；既有提交/重试/换助手、完整固定输入检查继续通过 |
| template controller + shared progress | 18/18 PASS | `template-progress-regressions.log`；与上行共享投影5项重叠，不相加宣称独立用例数 |
| cover controller + raster | 44/44 PASS | `main-regressions.log` |
| core cover jobs + template context | 82/82 PASS | `core-regressions.log` |
| bound continuation 两宿主 × 两种等待 × 两种任务 | 8/8 PASS | `bound-host-regressions.log`；与对应 controller 文件重叠 |
| gallery 纯逻辑 | 8/8 PASS | UI 负责人运行，见 `README.md` |
| layout / gallery / template-selection Electron | 三个 PASS | `README.md`、`ui/layout/measurements.json`、`ui/template-selection/result.json`。使用真实 React/Semi；其中 CAS 路径使用一次性真实 file-library |
| progress Electron UI | PASS | `../2026-10-22-local-handoff-progress/ui-probe.json`：事件更新、轮询兜底、等待恢复、终态优先、dirty 保全、原助手会话及窄窗 |
| 性能源码和真实 utilityProcess | PASS | `PERFORMANCE.md`、`performance.json`、`electron-performance.json`；最后重建的5个 main 文件 SHA256 与已运行性能样本逐一一致 |
| `git diff --check` | PASS | 主线程最终运行 |

曾在桌面构建改写 runtime 的同时启动 bundled CLI 测试，临时副本缺少 `bin/run-node`。已结束该重叠执行，构建完成后单独重跑得到上述 18/18；中间失败不作为业务验收结果。

## 审查与要求

- 主线程查看真实 diff 和 960×680 表单、自定义比例、候选五列截图；独立只读审查检查样张草稿／应用、版本失效、嵌套 Esc、比例协议，以及单锁内模板校验复用和独立固定输入校验，未发现高置信缺陷。
- 删除弹层内正文跳转后，原同篇正文页签必须仍可保留草稿进入 CAS 恢复。最终真实 App 探针验证保留草稿与明确放弃 pending 后载入磁盘；未改底层恢复策略。
- `AGENTS.md` 新增「助手任务能力一致性」：Codex、WorkBuddy 和正式接入的后续助手共用契约，新增助手须分别通过同等测试，启动与会话适配才按宿主区分。
- 参考旅游工作台桌面 0.8.0：源码提交 `2d0e6c1` 的 `workbench/package.json` 确认为 0.8.0；当前工作树版本已更高，`workbench/src/main/tasks.ts` 对该提交无差异。仅借鉴本地任务状态与回原会话的职责划分，未复制活动业务逻辑。
- 设计规则 **Controls-03 / Cover-01** 已同步本次用户要求；逐项 UI、状态去冗余与保留理由见 `README.md`。

## 边界

本次是源码、合成库、源码 Electron 与构建进程验证。未跑整个仓库的全量 verify；没有把旧版已安装应用的验收用于新源码。未验收真实 WorkBuddy/Codex 审批事件捕获、真实会话跳转和生图、最终安装／升级、Intel Mac、Windows 或签名公证。助手无可靠事件时仍需显式进度回报，不能以会话结束推断成功。
