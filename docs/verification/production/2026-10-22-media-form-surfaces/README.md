# 2026-10-22 图片边缘与表单内框：后续源码验证

本轮以源码 `7936121c2171a23489baa386da34f8ec494831ac` 为基线实施后续修复；源码变更独立提交并随开发分支快进同步到本地 main。当前版本字段仍为 0.3.40；没有打包、安装或覆盖已冻结的 0.3.40 安装包，没有访问真实用户内容库。以下为真实 React / Semi / CSS 在本机 macOS arm64、Electron 44.9.0 中的隔离源码验收；IPC、内容和图片全部为合成夹具，userData 在临时目录。

## 复现与根因

先运行原源码，`before/result.json` 有 74 项断言、20 项失败，进程退出 1；随后实施 CSS 修复。`before/` 保留实际复现截图和日志。

| 可证伪原因 | 原源码观测 | 修复后观测 |
|---|---|---|
| Hero 外框固定尺寸加半透明白底/白边，无法跟随图片自然比例 | 1280 窗口中按钮恒为 230×280；3:4 图像 208.5×278、横图 228×128.25、方图 228×228，露出外框 | 按钮与图片边界一致：分别 210×280、230×129.375、230×230；保留 `contain`，默认/hover/active 无白底；键盘焦点单独可见 |
| fieldset reset 只在 `.workspace-management` 祖先内生效，独立管理弹窗漏掉 | 直接打开的新增发布计划有两层 UA `2px` 边框、默认 padding、`min-width:min-content`；独立合集弹窗同类失败 | 在现有共享规则中补 `.management-dialog fieldset`，两层均无边框/内边距且 `min-width:0`；fieldset 标签与 disabled 属性保留 |
| 资料预览 width:100% 与 max-height 共同造成元素框和自然图像比例不同 | 竖图/方图出现图像框比例断言失败，圆角落在留白区域 | 改 auto 宽高、max-width / max-height 限制；横/竖/方图元素框跟随自然比例 |

## 按设计规则验收

| 规则 ID | 本轮结果与证据 |
|---|---|
| Layout-03、Image-01 | Hero 在 1280×860、960×680、540×860 下遍历 3:4、16:9、1:1、1:5、5:1；图像比例、边界和源 URL 全部保持，页面无横向溢出。图中文字顶/底标记可见。见 `after/hero-*-*.png` 和 `after/result.json` |
| Surface-01、Surface-02 | 移除 Hero 无必要的装饰框与白底；保留实际图像投影、独立模糊背景和现有操作按钮。管理表单 fieldset 不加装饰框；必要的“暂时收起”恢复提示和资料文本预览内块改为 12px 圆角。见 `after/hero-hover.png`、`after/form-minimized.png`；资料文本预览为源码样式核对，未单独截图 |
| Surface-03、Controls-01/02 | 1280×860、960×680 新增计划弹窗两层 fieldset reset，无横向溢出；标题和关闭可见，提交可通过内部滚动到达。保留 busy 禁用、Tab 仍在模态内、关闭草稿提示、暂时收起/恢复、原文本/日期/CAS 提交。见 `after/plan-*.png`、`after/draft-protection.png`、`after/hero-focus.png` |
| Image-01 | 资料预览横/竖/方图保留自然比例与完整源 URL，见 `after/material-*.png`。这只修改显示尺寸，不改原图文件、下载、批注坐标或画布 |
| Acceptance-01 | native/renderer 类型检查通过；发布模型/布线测试 7/7；隔离表单保存保护 4 个编辑器、8 个延迟回执通过；本轮 focused probe 通过。详见日志及下表 |
| Acceptance-02 | 已检查本轮直接变化的 Hero、资料预览、发布弹窗、独立合集弹窗及草稿恢复截图；这不是全页面视觉重验。其余同类场景按下表做源码审计 |
| Acceptance-03 | 仅源码 Electron / 合成 IPC 范围；未做浏览器、安装包、真实库、Intel Mac、Windows 或签名/公证验收。交付要求引用根 `AGENTS.md`，本轮不产生新发布结论 |

## 同类场景清单

对 renderer 全部 16 个 `<fieldset>` 声明和全部 `<img>` / `object-fit` 规则做了检索；共享修复覆盖漏掉祖先的管理弹窗，不改业务 TSX。

| 场景 | 处理与边界 |
|---|---|
| `publication-panel.tsx`：发布编辑与时间编辑，2 个 fieldset | 共享 reset；发布/时间双层已在真实组件中验收 |
| `library-panels.tsx`：照片、渠道、合集、成员、个人信息、默认值、分类/比例、内容资料与资料导入，9 个 fieldset | 管理弹窗新增共享覆盖；原有 `.workspace-management` 页面覆盖保留。照片/渠道/合集/成员已验收 busy、拒绝保留草稿和重试；其余为源码覆盖核对 |
| `workspace-pages.tsx`：提示词编辑、模板样张导入，2 个 fieldset | 原有局部 reset 保留，同时受共享管理弹窗覆盖；未改提示词/样张提交 |
| `covers.tsx`：封面资料选择、候选信息编辑，2 个 fieldset | 资料选择原有 `.cover-create-dialog .cover-materials` reset 保留；候选信息使用共享管理弹窗覆盖 |
| `color-field.tsx`：自由选色，1 个 fieldset | 已有局部无边框规则与 12px 顶部间距，保留原色盘布局、disabled 与指针阻止 |
| 总览 Hero | 修复按钮外框与图片不等大，并处理 hover/active 背景；焦点白色轮廓是必要键盘反馈，只有 focus-visible 时出现 |
| 总览队列/最近内容、内容列表/合集、个人头像/照片、模板叠图/小图、模板学习对比、发布历史/计划详情 | 现有图像自身 auto 宽高、max 限制和 contain 已让圆角跟随图片；不统一改其用于列表对齐的外槽 |
| 封面已选预览、候选网格、并排比较 | 使用 `CoverArtwork`：清晰原图自身 auto/contain + 圆角，独立模糊背景负责填槽；不是 Hero 那种白色装饰框，保留已有结构 |
| 内容资料导入和资料图片预览 | 同用 `.material-image-preview`，本轮共享修复尺寸约束 |
| 图集大预览、原图、批注图片与坐标画布 | 依据 Image-01 保留矩形；不做全局 img 圆角或裁切重置 |
| `.schedule-plan-image`、`.publication-cover`、`.members-picker`、`.import-preview` | 当前 renderer TSX 没有调用，保留未使用样式，不为本轮做无关删除或重写 |
| 输入框、表格细分隔、图集选择边界、模板样张分组 | 保留各自语义和现有圆角，未把整行/整块正文改为胶囊 |

## 命令与结果

```sh
npm run typecheck:desktop
node workbench/scripts/media-form-surfaces-ui-probe.mjs docs/verification/production/2026-10-22-media-form-surfaces/after
node workbench/scripts/management-save-guard-probe.mjs
node --test workbench/test/publication-model.test.mjs workbench/test/daily-publication-wiring.test.mjs
git diff --check
```

| 检查 | 结果 |
|---|---|
| 类型检查 | 退出 0，见 `typecheck.log` |
| 本轮 focused probe | 退出 0，见 `after/probe.log`、`after/result.json`。包含源码组件实际 Vite 构建、Electron 几何与行为断言和截图 |
| 管理保存保护 | 退出 0，照片/渠道/合集/成员 4 个编辑器、8 个成功/拒绝回执，见 `management-save-guard.log` |
| 管理保存保护夹具修正 | 首轮合成内容缺当前组件必需的 body/updatedAt，次轮匹配首个 role=status 错过真正的失败提示；只补夹具字段及选择器。失败日志分别保留 `management-save-guard-initial.log`、`management-save-guard-status-selector.log` |
| 发布模型/布线 | 7/7，见 `publication-tests.log` |
| 额外旧 overview-template probe | 总览 rich/empty、宽窄、路由等断言执行后，在模板菜单读取不存在的 `.creator-template-source-warning` 时报错；该提示现在归完整说明弹窗。整体退出 1，不能算通过；见 `overview-template.log`，本轮没有扩改该旧脚本 |
| 空白检查 | `git diff --check` 退出 0 |

未运行全量套件、重打包或安装 UI；未把合成 IPC 提交当作真实发布/真实内容库验收。现有旧总览模板综合脚本仍需按当前模板详情交互维护。

## 主线程独立复核

主线程检查真实 CSS 与夹具 diff，并实际查看 `after/hero-1280-0.png`、`after/plan-1280.png`、`after/hero-540-1.png`：封面边界贴图，发布表单没有重复矩形框，窄窗横图完整可见。独立重新运行 native/renderer 类型检查（退出 0）、管理保存保护（4 个编辑器 / 8 个回执，退出 0）、发布模型/布线（7/7，退出 0）与本轮专用 probe。

首次并行运行两个 Electron UI probe 时，仅 Hero 的键盘 focus-visible 断言失败；另一个窗口同时获取焦点，记录见 `independent-concurrent-focus-failure.json`。未更改产品代码或放宽断言，随后单独串行运行同一命令，81 项全部通过，见 `independent-result.json`。涉及原生焦点/键盘的 UI probe 应串行运行；不能将首次并行结果称为通过。最后 `git diff --check` 通过。

## 同步本地主分支前复核

2026-10-22，原 main 停在 `fb7ae07`（0.3.37），落后开发分支 11 个已提交改动且没有分叉；主分支所在 worktree 干净，仓库无远端。主线程重新运行 native/renderer 类型检查、本轮图片与表单 probe（81/81，见 `main-sync-result.json`）、管理保存保护（4 个编辑器 / 8 个回执）、发布模型/布线（7/7）及 diff-check。只同步源码与记录，不重打包，不移动已冻结的 0.3.40 tag。
