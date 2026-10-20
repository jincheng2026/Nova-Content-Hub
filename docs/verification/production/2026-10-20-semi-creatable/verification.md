# Semi 可搜索／自定义分类验证

- 源码基点：`7d1eb85783356ed83aab7601c91eed1faca75e79`，工作区版本 `0.3.30`。
- 开发环境：`darwin-arm64`；本次无版本／依赖／安装包修改。
- 组件采用本地锁定的 `@douyinfe/semi-ui-19@2.104.0` 官方 `select/index.d.ts` 的 `filter`、`allowCreate`、`inputProps.composition`、`onSearch` 与 `onChange` API。复用现有 `useControl` 名称、原生表单验证和原生 dialog 内的共享 popup host。
- 输入保持原始草稿值；PromptEditor 保持既有的保存时 `category.trim()`。组件不把自定义值限制在候选集合，未收录的已有值仍显示。实际编辑回调触发既有草稿 guard，Semi 内部关闭弹层产生的清空搜索回调不写回草稿。
- Enter 阻止隐式表单提交；Tab 和 Escape 关闭选项后保留输入；Escape 再交给现有未保存提示；IME 组合期间按键先由输入法处理，不交给 Semi 的选中／关闭逻辑。

## 全 renderer 排查

检索范围：`workbench/src/renderer/**/*.{tsx,ts,jsx,js}`；检索 `datalist`、原生 `list=`、原生 `select`、`PopupSelect`、`Select`、`allowCreate`、`AutoComplete` 与“自定义／直接输入”等文字，并检查候选与自由输入的相邻结构。

| 位置 | 结论 |
| --- | --- |
| `workspace-pages.tsx` PromptEditor 分类 | 唯一原生 `datalist`／`list=` 建议输入；改为 `PopupCreatableSelect`，可搜已有分类或直接输入新分类。 |
| `covers.tsx` 封面比例 | 存在“预设／自定义 + 专用比例输入”的等价结构；主线程确认保留。自定义输入已使用 Semi Input，使用冒号归一化、比例及合法尺寸校验，与普通分类字符串业务语义不同。 |
| `library-panels.tsx` 分类／自定义比例管理 | 每行分类批量维护、比例新增／移除，是独立管理表单，无候选下拉；继续原表单及校验。 |
| 提示词分类筛选 | 筛选已存分类，不负责新建；保留可搜索固定候选。 |
| 内容、模板、照片、渠道、封面、版本、学习记录 | 选择实体 ID 或已有版本，包含失效引用／停用阻断；开放自由创建会制造无效引用，保留现有下拉。 |
| 内容／发布／提示词状态、范围、来源、排序、时间精度、资料用途、助手、分页条数 | 受业务协议约束的枚举，保留现有选择，不开放创建。 |
| 其他原生 datalist/list 或原生 select | 未发现。 |

## 验证

`npm run typecheck:renderer` 已通过。

`node scripts/semi-creatable-ui-probe.mjs` 使用隐藏 Electron 窗口、真实 React/Semi 和纯内存合成库；不启动真实产品、不调用真实库／真实桥接、不走 CUA。组件检查包括：存量自定义值、可访问名称、dialog 内弹层、搜索、方向键选已有项、Enter／Tab／Escape、无隐式提交、中文 composition 事件、清空与 busy。实际 PromptEditor 检查包括已有分类保存、自定义分类保存后重开、保存时去空白、取消保留草稿／明确放弃、busy 禁用。上述断言全部通过；最终结果见 `probe.log` 与 `probe-result.json`。`prompt-category-custom.png` 展示自定义草稿，`prompt-category-dropdown.png` 在已有分类选项可见且通过命中检测后捕获。

未执行全量 313 项测试、打包安装、其他平台／架构运行验收。IME 是合成 composition 事件序列，不代表真实系统输入法候选窗已人工验收。

## 共享表单控件回归：恢复按钮的视口前提

原 `semi-form-controls-probe.mjs` 在发布面板“暂时收起”后的恢复按钮命中检测失败，见 `shared-controls-red.log`。针对原失败的同一 Vite fixture 精简重放并记录 `resume-nearest-diagnostic.json`：viewport 高 1004，继续编辑按钮 top=1013.171875、bottom=1045.171875，中心 y=1029.171875 已在视口外，`elementFromPoint` 返回 null。关闭的 dialog 与 popup host 的 rect 均为零；host 为 pointer-events:none 且没有 portal 子节点，未发现控件弹层遮挡。

滚动后中心能命中继续编辑的 Semi span。`block:nearest` 会留下 0.171875px 的底部亚像素越界（bottom=1004.171875），因此最终探针使用 `block:center` 后再等待两帧，保留完整视口范围和 `elementFromPoint` 命中断言。仅改探针可见性前提，未改产品控件／发布面板。`resume-before.png` 与 `resume-after-nearest.png` 保留诊断截图。

`node workbench/scripts/semi-form-controls-probe.mjs` 最终 exit 0，全部六段通过，详见 `shared-controls-green.log`。恢复后继续保存，以及 date／local-minute／instant 的输出断言均通过。

补充核实方向键范围：`semi-creatable-ui-probe.mjs` 显式输入“写”，调用 Electron `sendInputEvent` 发送非 IME Down + Enter，并断言选择值变为“写作”且提交计数仍为零；最终完整 probe exit 0。实际 PromptEditor 的已有项选择另走鼠标 click，用来覆盖鼠标路径；中文 IME 仍是单独的合成 composition 序列。
