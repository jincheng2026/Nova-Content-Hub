# Semi 组件统一与直播前收口

日期：2026-10-19，用户要求北京时间 17:00 前用于同事直播演示。技术栈继续 Electron + TypeScript + React，复用已安装固定版本 Semi UI，不增加收费接口或一期鉴权。

## 优先级与责任

1. Sol high 日程负责人：真实 Semi Calendar 月/周、DatePicker、内容/合集 Select、分钟显示、日期待定、渠道图例、选日新增及原计划定位；同文件提示词/模板控件一起统一。
2. Sol high 表单负责人：封面/个人资料/渠道/合集/发布计划/助手/偏好的真实 Semi Select、DatePicker、TimePicker、Input、Checkbox 等；保留业务原值、无效引用及草稿/冲突/忙碌保护。原生 dialog 保留现有顶层和恢复机制，弹层挂到最近 dialog 内。
3. 主线程：共同渠道颜色映射、主内容编辑/搜索、模板学习控件、严格审查、集中验证、实际 Mac 安装、宿主插件同步、原生演示链与文档留痕。Astra high 只读检查渠道一致性、日期/弹层/校验风险。

每项写入只有一个负责人。用户格式化、原始固定资源与历史文档保留，不推送远端。

## 数据约束

渠道继续由内容库 settings.channels 单处维护；设置新增明显管理入口，内容、总览、日程及表单集中使用它。名称、ink/bg、启用状态修改后刷新全局；已发布快照保留当时渠道名称。旧的固定五色仅作无数据后备，真实徽标和日程读取保存的颜色。失效的已选 ID 必须展示、让用户明确取消/改选，不能静默清除。

全局助手由同一 ASSISTANTS 定义提供 Codex / WorkBuddy。选择只在设置中维护，所有生图和学习交接沿用当前助手与对应 Skill；打开助手不等于任务完成。

纯日期不经 UTC 截日；local-minute 保留原时区和墙上时间；明确时刻按本机视图时区投影且保存原 UTC 值。时间待定不能被放到零点冒充实际时刻。

## 交付门槛

先完成本批功能，再集中执行相关组件、文件核心与构建检查；原生验证设置切换、创建自定义渠道、分钟计划、模板到两张封面回流/选用/导出、提示词往返、发布更正撤销、正常退出重启。最新 Mac 安装必须真实替换 Applications 并保留旧版，完整负载/版本及内容库保全单独记录。

Windows/Intel 没有额外真机、正式签名公证未完成；这些不会被标为通过，也不阻止继续交付本机 Mac 演示包。最终版本、测试结果与原生验收待完成后追加，当前文件不是成功声明。

## 官方依据

- [Semi 组件总览](https://semi.design/zh-CN/start/overview)
- [Calendar](https://semi.design/zh-CN/show/calendar)：真实日/周/月事件视图、周一起始、日期选择和事件渲染。
- [DatePicker](https://semi.design/zh-CN/input/datepicker)：日期/时间交互；同时核对本机固定依赖的实际 TypeScript 和 foundation 实现。


## 日程与工作区控件技术验收证据

本节只记录源码和定向验证，不代表 0.3.11 已构建、安装或完成原生演示验收。

### 实施范围

- `workbench/src/renderer/workspace-pages.tsx` 的月/周手写网格已替换为已安装 Semi UI 2.104.0 的真实 `Calendar`，周一起始，保留今天、前后翻页、日期选择、所选日详情和新增计划。日期使用 `DatePicker`，内容/合集使用可搜索 `Select`；点计划定位原 `PublicationPanel`，事件点击阻止冒泡，避免又触发日期格。
- 复用 `scheduled`、`scheduleForView`、`compareSchedules`、`scheduleClock`。分钟保留 `HH:mm`；local-minute 保留墙上时间和原时区，instant 按本机时区显示。date-only 使用顶部事件行，标题及事件均显示“时间待定”，不放进具体小时轴。Calendar 的事件对象是视图投影，未改原始计划数据。
- 渠道来源仍是 `library.settings.channels` 或工作区摘要，日程事件、图例、详情卡和总览徽标统一接入共享 `channelStyle`，读取已保存 `ink/bg`。Semi 按事件 key 缓存渲染内容，因此 key 包含计划、标题、渠道颜色和 busy 等显示事实，修改后可正确刷新。
- 同文件提示词参考内容、模板版本选择改用共享 `PopupSelect`。提示词/模板表单、预览、变量填写和搜索改为真实 Semi `Input`/`TextArea`，本人照片声明和包含正文改为 `Checkbox`；源码不再直接写原生 input、textarea、select。保留原生 dialog、草稿恢复、冲突检查、required/maxLength、分类 list/datalist 和自由文本输入。表单字段显式传入 busy 禁用，模板新增版本的既有名称使用 Semi 的 `readonly` 属性。
- 样式由独立 `semi-calendar.css` 和共享控件样式承接；Calendar 的 1280 视口月/周截图已人工查看，探针检查未出现页面水平溢出。

### 已通过的定向检查

以下命令均已在 `workbench` 目录执行并得到成功结果；本次文档补录没有重复运行测试。

| 命令 | 实际覆盖 |
| --- | --- |
| `npm run typecheck:renderer` | renderer TypeScript 检查通过。 |
| `node scripts/semi-calendar-ui-probe.mjs` | 真实 React/Semi/Electron：月/周周一、DatePicker 弹层选择、Select 切换合集、10:45 分钟位置、instant 本机时区、date-only 仅在待定行、合集原计划定位、选日新增带入日期、编辑后事件刷新、busy、保存的渠道颜色、1280 无页面横溢；原始计划和元数据完整不变，零 native 写操作。 |
| `node scripts/prompt-return-body-probe.mjs` | 真实 App/React/Semi/Electron：内容→提示词→原内容正文，明确切换参考内容，读取最新保存正文；正文/提示词草稿保护；不可访问、错误 ID、已删除和缺失内容留在原页并显示错误；无隐式选择或业务写入。参考内容选择已改为真实 Semi 下拉点选。 |
| `node scripts/prompt-availability-probe.mjs` | 提示词停用/删除/缺失时禁止填写和复制并保留草稿，恢复后可继续；显式包含参考正文、变量必填、多行复制、脏草稿关闭保护；外部更新后保留旧草稿，重新读取需确认，busy 时可暂时收起，明确保存使用新 token。预览选择器已适配 Semi TextArea 外层。 |
| `node scripts/semi-template-inputs-ui-probe.mjs` | 模板标题 required/maxLength、说明 maxLength、前后空格/多行/字面 `{{slot}}` 原样送入合成回执、规则按原逻辑拆行、busy 锁住全部字段、显式保存、既有版本名称只读、丢弃不保存；本人照片 Checkbox 保留明确声明。 |
| `node --test test/prompt-context.test.mjs` | 1 项通过：保存正文只在明确勾选后追加，正文中的字面占位符不被当作提示词变量处理。 |
| `git diff --check`（本负责人修改文件） | 无空白错误；没有据此宣称整个仓库或全部测试通过。 |

### 证据边界

上述 Electron 探针使用临时目录、隔离 userData 和合成 bridge；模板/提示词回执中的写入只发生在内存 fixture，不接触真实内容库。它们证明本批 React 组件、交互、校验、数据传递和草稿保护，不能替代 Applications 安装、真实用户内容库、宿主插件、实际助手/生图服务、正常退出重启或跨平台验收。

本负责人没有执行整套测试、最终构建、安装或插件同步；统一收口结果由主线程另行追加。1280 截图没有覆盖所有内容密度、全部缩放比例或真实主窗口侧栏组合。


## 0.3.11 集中验证与实际安装

- 全量验证日志 `docs/verification/production/2026-10-19-0311-unified-verify.log` 的全部测试子命令汇总：924 通过、0 失败、2 可选跳过。原会话在末尾桌面构建阶段被打断，未保留顶层命令的退出码；随后完整重跑两模式桌面构建并取得 exit 0，见 `2026-10-19-0311-desktop-build.log`。不把中断命令写为整条成功。
- 0.3.11 local DMG 构建 exit 0，hdiutil 校验通过，挂载原应用与构建产物 1,839 项一致。产品安装器真实替换 Applications，安装事务 complete；旧应用和业务库逐项保全，见 `2026-10-19-mac-0311-installed.json`。
- 两个宿主通过官方插件命令更新到 0.3.11，封面与模板 Skill 就绪；原版本负载和无关配置保全。此记录仅证明插件安装与就绪，不是新一轮双宿主生图证据。
- 安装版设置实际切换 Codex 并显示配套插件连接。通过界面创建“直播演示·自定义”，配置文件产生唯一渠道 ID；设置与发布计划同时读取该渠道。原生日期/时分选择器确实选到 2026-10-22 10:03 Asia/Shanghai。用户继续保存该计划后，在 0.3.12 安装版周日程中读到相应事件；不把用户的保存操作记为代理已完成整套发布验收。
- 用户在检查中将新内容封面改选候选 01，并收藏两张；后续安装保留当前真实值，不恢复成代理先前选择的候选 02。

## 0.3.12 原生 Esc 修复

原生发现：脏发布计划表单内打开时间选择器，Esc 既关闭弹层又进入外层放弃确认。草稿保留，但按键分层不正确。

共享控件最小修复：记录各自弹层状态；原生 dialog 的捕获阶段，首次 Esc 关闭当前弹层、归还触发器焦点并阻止 dialog cancel；弹层关闭后下一次 Esc 允许触发原有草稿守卫。Select/DatePicker 继续用自身非受控外部点击关闭；受控 TimePicker 补齐自身弹层的外部点击处理，卸载清理监听。

可信原生键盘回归先复现失败，日志 `2026-10-19-0312-semi-escape-red.log`；主线程独立运行完整共享控件探针 exit 0，见 `2026-10-19-0312-semi-controls.log`：四类控件 × 触发器/portal 焦点共 8 场景，首次仅关弹层、草稿值不变、第二次触发关闭保护；原有小窗口、外部点击、必填焦点、UTC 秒数、busy、双助手、动态渠道及发布 JSON 回归均通过。严格构建与 local、preview 安装包均 exit 0；局部修复后未重复全量 924 项。

0.3.12 local 已实际安装并完整核对，见 `2026-10-19-mac-0312-installed.json`，安装前后库一致。给同事的 preview 包已生成并通过挂载全树比对；preview 的实际替换与原生最终复验另行记录，不提前宣称通过。
