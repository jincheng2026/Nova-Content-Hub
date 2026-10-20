# 默认动画下时间选择器探针诊断

未修改产品控件、CSS、系统媒体规则或真实偏好/内容库。持久改动仅在 `workbench/scripts/dialog-controls-ui-probe.mjs` 的 native mouse helper 中调用 `win.focus(); win.webContents.focus();`，随后保留原有250ms稳定期和真实 hit testing。

## 缩小与因果

真实 ManagementDialog + CalendarDateInput + ClockTimeInput、完整 renderer CSS、显式 prefers-reduced-motion:no-preference，在窗口有焦点时日期选择后时间打开/选择/Escape通过。生产 App 的发布计划路径，以及加回设置/助手、封面窗口和此前下拉选择历史的窄夹具也通过。

在最小夹具日期选择后只加入 `win.blur()`，得到相同 red：trusted mousedown/mouseup/click 命中时间 input，activeElement 变为时间 input，但没有 focusin，TimePicker panel 不出现、popup host 为空。Semi TimePicker 从 handleFocus 开启弹层，不能用 activeElement 或 click 已发出推断 focus 事件也已发出。

同一 blur 故障注入夹具只加入每步原生输入前的窗口/webContents focus，4.6秒通过（日期选择、时间选择到09:25、Escape只关弹层并保留dialog）。`blurred-red.log` 与 `focused-green.log` 保存 red/green 输出；`focused-probe-source.mjs` 是临时夹具源码快照（原运行位置 workbench/scripts，已清理临时脚本）。

## 原始失败路径回归

最后只跑一次原始命令 `node scripts/dialog-controls-ui-probe.mjs`，exit 0；显式 no-preference，照片/比例/分页大小/助手/日期/时间/弹层Escape/脏dialog Escape全部通过。见 `original-default-green.log`、`original-result.json` 与两张原始流程截图。

该结果证明原生输入驱动缺少焦点前提会产生与旧失败相同的症状，修正驱动后原始路径通过；未直接记录旧失败当时的OS焦点，不能声称其历史焦点丢失来源已完全查明。系统 reduce 分支此前已通过，本次未重复。未跑全套测试、构建或安装。
