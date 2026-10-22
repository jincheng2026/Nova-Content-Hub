# 图片细节预览、渠道与共享输入控件（源码验收）

2026-10-22，本机 darwin-arm64，Electron 44.9.0，隔离 renderer / synthetic DTO。未访问用户内容库，未修改原图字节，未打包或安装。

## 改动

- 图片统一使用共享缩放查看器：适合窗口、100% 原始尺寸、加减缩放、百分比、拖动和双向滚动；键盘 `0` / `1` / `+` / `-`。覆盖候选、比较、首页、模板整组/样张、模板学习的参考与还原图、本人照和资料图。多图仍保持整组入口；点击单张进入细节，关闭返回原位置。批注画布与百分比坐标算法未改。
- 内容资料渠道由竖向 checkbox + 分页改为 Semi 搜索多选。选中、失效/停用警告、显式移除、草稿与保存契约保留。长名称使用显示省略和全文 title，文本与 ID 不截断。
- 共享 Select 内嵌输入包装层不再绘制第二个焦点环，外层圆角控件继续显示蓝色边界及焦点环。原生输入边框不会叠到 Semi 内部输入上。
- 可选模板调用统一共享 `isSelectableTemplate`，排除停用、回收、无样张；历史引用单独保留为 disabled 项；内容偏好模板已从可用列表移除时，仍明确显示「原偏好模板已不可用，请重新选择」，保留原 ID。

## 规则与证据

| 规则 | 结果 / 证据 |
|---|---|
| Image-01 / Image-02 | 图片仅改变显示；`results.json` 在 960×680、1280×860 检查 1200×1600、10000×100、100×10000 的完整 fit、100%、放大及双向细节滚动；PNG 为对应视窗的细节图。 |
| Controls-02 | `960-single-focus.png` / `1280-single-focus.png` + computed style：外环存在，内 wrapper/input border=0、shadow=none；渠道搜索、Enter 选择、零匹配、长名 160px + title、无横向溢出通过。 |
| Surface-03 | 子图片 dialog 的 Esc 只关闭当前预览，外层样张 dialog 保留、焦点归回原图按钮；`nested-preview-focus-return.png`。 |
| Reading-02 | 细节可拖动/滚动到原图范围，fit 可恢复；完整名称仍在 DOM 与 title，未截断保存数据。 |
| Interaction-03 | 无新依赖、无品牌变化，批注坐标逻辑未改；候选/本人照/模板/渠道操作沿用原处理器。 |
| Acceptance-01 | 下列针对性检查通过；类型检查和 diff whitespace 检查通过。 |
| Acceptance-02/03 | 仅隔离原生 Electron 的源码 renderer 验收；截图不代表已安装包或跨平台验收。 |

## 执行结果

- `npm --prefix workbench run typecheck:renderer`：通过。
- `node workbench/scripts/image-channel-controls-ui-probe.mjs`：通过。含真实指针拖动、键盘 0/1、两种视窗、三种比例、嵌套 Esc/焦点、渠道键盘搜索、多选保留、失效引用及已移除历史偏好模板的明确回显。
- `node workbench/scripts/dropdown-corners-ui-probe.mjs`：通过。单选、搜索、creatable、多选、分页、动作菜单、首末项圆角、禁用、native dialog portal/Esc；本轮截图/JSON 在 `dropdown-regression/`。旧 0340 证据已逐字节恢复，未混入本轮结果。
- `node workbench/scripts/semi-form-controls-probe.mjs`：通过。Select/Date/Time/UTC、焦点、原生验证、dialog portal/脏数据、动态渠道、发布保存，以及新多选显式移除停用/缺失 ID。
- `node workbench/scripts/cover-gallery-ui-probe.mjs`：通过。隔离真实 React/Semi/Electron，含 4 比例 × 3 视窗的批注点/框/路径坐标、拖动、视窗调整后重排、草稿与 IPC、比较和原有生成表单路径。证据临时目录 `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-cover-gallery-ui-shots-IvA5OB`。
- `node --test workbench/test/cover-gallery.test.mjs workbench/test/schedule-view.test.mjs`：15/15 通过。
- `growing-lists-ui-probe.mjs`：整支通过，见 `growing-lists/result.json`。1000 内容、320 合集、240 照片、145 候选、300 模板；含125渠道虚拟搜索末项与真实 Enter 不提交、跨页选择与全量成员保存、候选/记录/尝试/资料的20/50/100分页以及模板5/10/20分页。此前 timeout 根因是旧 synthetic collection fixture 缺少必填 candidates 数组，`favoriteCompositions` 抛异常致整块空白；已最小段红→绿确认并修正 fixture，无需产品代码补丁，见 `growth-diagnosis.json`。同时同步旧 card.title、模板分页值与资料折叠区断言。

未执行安装包、用户库真实操作、实际助手生成、Intel Mac 或 Windows 验收；完整套件也未运行。
