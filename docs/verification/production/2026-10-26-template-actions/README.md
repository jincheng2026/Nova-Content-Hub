# 模板生成入口与拆解状态验收

日期：2026-10-26（Asia/Shanghai）。基于 0.3.46 源码修改，未冻结新发布版本。

用户要求：图片上的“用此风格生成”常驻；已有拆解、模板未变化时不提供重复拆解，内容变化后才允许重新拆解。

## 结果与事实边界

- 保留图片上原位置的蓝色生成按钮，删除 hover 才可见的限制；不在底部重复放生成按钮。
- `studyComplete` 是读取现有包资料与任务证据得到的事实，不是持久化的新验收状态。当前版本的来源拆解、规则证据、已回传结果及人工验收分别保留其原含义。
- 未改变的副本或仅版本号变化可沿用原资料；样张、规则或其他包内容改变且仍沿用旧资料时，需要重新拆解。裸 `accepted`/`aiTested` 标志不证明拆解完成。
- 已拆解卡片不再显示底部 AI 拆解操作。详情保留“查看拆解与任务记录”，面板不提供重复拆解或无处提交的补充要求；已有未提交草稿仍可放弃。
- 未完成、失败、取消、进行中及待人工确认的任务保留对应恢复与确认入口。历史验收不阻断新版本拆解。任务状态变化后刷新卡片资料。
- 历史任务证据损坏或明确不可读时，不把它算成完成，也不让它阻断其他可读模板。

## 设计规则核验

| 规则 ID | 核验结果与证据 |
|---|---|
| Controls-01 | 沿用 Semi 主按钮、原业务回调及禁用状态；未悬停时 opacity=1、pointer-events=auto，点击仍进入原生成回调。 |
| Template-01 / Image-01 | 实际 React/Semi/Electron 的 1280、1600、1080、900、700 窗口下，五/五/四/三/两列无横向溢出；原图 `contain`，叠图与缩略图未改。见 screenshots/templates-1280.png、templates-1600.png。 |
| Template-02 / Interaction-02 | 静止、键盘焦点、系统减少动画下生成按钮可见；整组预览与生成独立，所有样张仍可访问。 |
| Template-03 / Template-04 | 已拆解卡片主入口消失，任务与来源资料保留；从详情进入记录区后焦点可到达，收起后回详情按钮。来源资料仍不冒充人工验收。见 screenshots/templates-analyzed-idle.png。 |
| Acceptance-01 | 相关测试 22/22，通过 native+renderer 类型检查与 auth-disabled 桌面构建，`git diff --check` 通过。 |
| Acceptance-02 | 两组隔离页面检查通过。导入流程检查含 960×680、人工确认、CAS 更新、恢复、换助手、取消和重试；见 screenshots/returned-awaiting-confirmation.png。仅覆盖本次模板修改相关页面，未重做所有其他页面视觉验收。 |
| Acceptance-03 | 本次为源码及隔离 Electron 页面验证；未打安装包、未升级已安装应用。没有将模拟 IPC 或素材提升为真实助手或生产验收。 |

截图按 probe 设置的窗口尺寸记录；PNG 像素尺寸随当前 Mac 显示缩放产生。素材与 IPC 为合成夹具，未读取或修改用户内容库。

## 可复查命令与日志

| 命令 | 结果 |
|---|---|
| `node --test workbench/test/template-catalog.test.mjs workbench/test/templates.test.mjs` | 22 pass，0 fail；logs/templates.log |
| `node workbench/scripts/template-density-ui-probe.mjs` | PASS；logs/density.log |
| `node workbench/scripts/template-onboarding-ui-probe.mjs` | PASS；logs/onboarding.log |
| `npm run typecheck:desktop` | exit 0；logs/typecheck.log |
| `npm run build:desktop -- --auth disabled` | exit 0，darwin/arm64，productionReady=false；logs/build.log |

页面检查的详情浮层需要等待初始焦点进入后再点击；仅等待 portal 节点出现会在屏幕外预挂载阶段触发点击，造成打开回调与关闭回调竞争。最终脚本已等待可交互状态，完整通过。

构建保留 Vite 的大 chunk 提示，本次未调整拆包。未进行完整回归、真实助手生成、已安装应用、Intel Mac 或 Windows 验收；打包与系统展示验收继续以根 AGENTS.md 为准。
