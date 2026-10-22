# 封面交互与性能验收 · 2026-10-22

本文件记录本轮 UI 源码与隔离 Electron 交互；性能边界与测量见 [PERFORMANCE.md](PERFORMANCE.md)，最终构建、双助手契约及验证边界见 [VERIFICATION.md](VERIFICATION.md)。没有安装、改版本、调用真实生成、操作用户真实内容库或提交 Git。先前未提交的本地进度实现继续保留。

## UI 改动与逐项范围

| 场景 | 检查与处理 | 保留的独立状态及理由 |
|---|---|---|
| 封面候选卡 | 删除额外「已选定／已收藏」状态行；原按钮分别显示「已选用／选用」「已收藏／收藏」，沿用 `aria-pressed`、禁用保护和卡片高亮。 | 候选编号、生成批次、备注、批注、下载、比较勾选保留，分别代表不同任务。 |
| 并排比较 | 同样使用「已选用／选用」与「已收藏／收藏」按钮；不增加状态行。 | 比较最多四张与完整原图显示保留。 |
| 收藏构图 | 已选状态由原勾选框与汇总数量表达，无多余成功状态行。没有删去来源或失效说明。 | 收藏被撤销、来源删除、图片缺失或改变时阻断生成，要求明确处理。 |
| 模板卡／整组样张 | 左卡仅保留「查看整组并选择」入口，删除右侧样张折叠区及重复放大入口；预览内勾选为独立草稿，点击「使用所选样张」一次应用本次模板与子集。 | 模板名称、内置／我的、整组数量、版本及原人工验收事实保留。预览其他组和版本不会提前覆盖当前选择。 |
| 合集 | 检查合集成员管理与内容入口：勾选成员、已选总数、失效成员提示分别承担操作、统计与阻断作用，没有额外「已选定」成功行可删。未改合集业务。 | 回收站／失效成员与跨页成员选择保留。 |
| 本人照片／默认头像参考 | 检查照片列表、本人声明、默认人物参考与生成默认值；现有摘要没有同时重复一个同义操作按钮，无额外状态行可删。 | 本人身份声明、原图不可用、默认引用失效属于权限／引用有效性，全部保留。 |
| 生成任务 | 没有改动上一轮进度展示及绑定原会话行为。 | 接单、等待确认、失败、已入库等任务状态具有独立含义，全部保留。 |

预览已选模板时恢复当前已应用子集，未选模板默认全选。关闭／Esc 取消预览草稿；分页、搜索和重开不会清除当前已应用选择。全部 50 张可访问。至少一张、模板 ID／版本、已选 hash 失效门禁保留；刷新发现版本／样张改变时不静默替换。

删除「编辑正文与冲突」按钮，保留标题显式保存、保存失败输入、dirty 禁生成与正文预览。封面收起后，切换同篇「正文」保留原草稿，继续使用原 CAS 冲突展示与待确认操作恢复路径；其他页签、导航和返回保护继续执行。

自定义比例在原「封面比例」位置切换输入，同一行应用／取消；Enter 应用、Esc 取消、焦点回原选择器，应用后可直接选回预设。保持原正整数比例协议与 `ratioPixels` 校验，中文冒号转换保留，没有新增小数解析或全局保存功能。编辑未应用时禁止生成，原最小尺寸说明继续显示当前已应用比例。

## 设计规则与证据

| 规则 ID | 结果与证据 |
|---|---|
| Controls-01/02/03、Foundation-02/03/04 | 选用和收藏状态合并到现有按钮，保留文字、`aria-pressed`、高亮；比例 label、焦点、键盘、合法性保留。`ui/gallery/gallery-five-columns.png`、`ui/gallery/compare-wide.png`、`ui/layout/ratio-editor-960.png`。 |
| Cover-01 | 1280×860 与 960×680 的标题、比例、张数、本人照片在首屏，底部生成按钮可达；右侧不再有第二套样张选择。`ui/layout/composer-1280.png`、`ui/layout/composer-960.png`、`ui/layout/measurements.json`。 |
| Template-01/02/03、Reading-02 | 真实叠图、整组50张、部分选择、不同组预览取消、版本草稿／应用与分页保全通过。`ui/layout/sample-fiftieth.png`、`ui/layout/samples.png`、`ui/layout/details.png`。 |
| Surface-03 | 顶层样张预览 Tab 范围、Esc、关闭焦点回入口；Esc 不误关底层制作弹层。比例输入 Esc 只取消本控件编辑。 |
| Image-01 | 样张与收藏构图、候选比较使用完整等比 contain，不裁图。`ui/layout/samples.png`、`ui/layout/favorites.png`、`ui/gallery/compare-wide.png`。 |
| Interaction-03 | 本次选择不写模板默认值／版本／排序，不调用生成；隔离 fixture 禁止写入并断言零写入。CAS 验证使用一次性真实 file-library。 |
| Acceptance-01/02/03 | renderer 类型检查、8项 gallery 单测、针对性 Electron 探针；仅当前 macOS arm64 机器的源码 Electron 运行，不代表安装包、签名、其他平台验收。 |

## 验证命令

运行目录：`workbench`。

```sh
npm run typecheck:renderer
node --test test/cover-gallery.test.mjs
NOVA_PROBE_EVIDENCE_DIR=/Users/mac/code/dashboard/Nova-Content-Hub/docs/verification/production/2026-10-22-cover-interaction-performance/ui node scripts/cover-layout-ui-probe.mjs
NOVA_PROBE_EVIDENCE_DIR=/Users/mac/code/dashboard/Nova-Content-Hub/docs/verification/production/2026-10-22-cover-interaction-performance/ui node scripts/cover-gallery-ui-probe.mjs
NOVA_PROBE_EVIDENCE_DIR=/Users/mac/code/dashboard/Nova-Content-Hub/docs/verification/production/2026-10-22-cover-interaction-performance/ui node scripts/template-selection-ui-probe.mjs
```

- 类型检查：PASS。
- `cover-gallery.test.mjs`：8/8 PASS。
- layout probe：PASS。首屏两尺寸；50张末项键盘与 Tab 范围／Esc／焦点；不同组取消与跨页；子集应用／重开；源模板／工作版本；零张、版本刷新与已选 hash 丢失阻断；比例原位／最小宽度／Enter／Esc／取消／预设；照片与张数保全；无库写入。
- gallery probe：PASS。五列、原候选与批次、收藏／备注／选用／比较／下载、四图像比例×三视窗的可信鼠标批注、8000+3000字合计阻断且无写入、完整确认原文、资料选择与正常生成请求 payload。IPC 为合成 fixture，没有真实生成。
- template-selection probe：PASS。真实 App／Semi／一次性 native file-library；25条内容分页与10000条合成摘要的20/50/100分页；显式保存一次写入；失败与CAS冲突保持标题／正文／选项；删跳转后同篇正文入口保留草稿，原待确认操作核验／保留提交草稿／明确放弃提交载磁盘路径通过。最终结果与 CAS 恢复证据见 `ui/template-selection/result.json`、`composer-cas-original-path.png`。

未验证：真实助手生图、用户真实库、安装／升级包、Intel Mac、Windows、签名／公证。构建及性能测量由本次主线程和性能负责人分别记录。
