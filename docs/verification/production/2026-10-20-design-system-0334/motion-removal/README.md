# 应用减少动画开关移除

源码范围：删除本机偏好的减少动画 UI、公开字段和默认值；删除应用加载/保存时写入的 `data-reduced-motion`、模板预览的属性观察器和属性对应 CSS。保留系统 `prefers-reduced-motion`、模板媒体查询监听及 `.01ms` 动画/过渡时间。

## 既有偏好兼容

- 文件版本仍为 `version: 1`，不做打开即写回的持久化迁移。
- `Preferences.initialize()` 只在读取旧版完整且字段精确匹配的对象时接受 `reducedMotion: true/false`；丢弃这个退役字段后，继续严格验证提醒、提醒时间和开机启动。
- 旧文件的其他三个设置原样保留。读取、查看不修改原文件，也不调用系统登录项写入。新保存只接受当前三个字段，成功后自然不再写旧字段。
- 损坏/额外字段仍拒绝读取或保存，不使用默认值覆盖已有文件。
- `node --test test/preferences.test.mjs`：3/3 通过。覆盖两种旧布尔值、读取不改文件/登录项、保存并重开保留其他设置、新格式、非法旧字段、无效时间与额外/缺失字段保护。

## 有限 UI 验证

实际 React/Semi/Electron 源码与完整 CSS，合成 IPC 和隔离临时 userData；原生鼠标事件。没有使用实际用户偏好或内容库，也没有验收安装包。

1. 初版更新后的默认模式通过：照片/比例/每页条数、助手、日期/时间选择、弹层 Escape、脏表单 Escape；不存在应用动画属性或开关。见 `default-before-final-emulation.json`。当时默认系统媒体未显式固定。
2. 最终系统减少动画模式通过：上述交互、媒体查询 `reduce`、两枚剩余偏好开关、`.01ms` 过渡，以及 `.01ms` 动画仍发出 `animationend`。见 `system-result.json`。
3. 最终默认模式显式固定媒体为 `no-preference` 后，照片/比例/分页、助手及日期均通过，时间输入原生点击后等待 `.semi-timepicker-panel` 超时。日志显示点击到 `.semi-input`，弹层容器为空，合成 IPC 无意外调用。见 `default-final-failure.png`。此轮不能记为通过，需要主线程统一检查默认动画下的时间选择器。

最后失败：`node scripts/dialog-controls-ui-probe.mjs`，`Timeout !!document.querySelector(".semi-timepicker-panel")`。

最后系统通过：`node scripts/dialog-controls-ui-probe.mjs --system-reduced-motion`，exit 0。

`template-density-ui-probe.mjs` 已将旧应用属性断言换成系统媒体变化停止/禁用翻页的断言；未在此次子任务重跑，交给模板视觉负责人收口。

未跑全量测试、类型检查、正式构建或安装；按主线程要求留给统一验证。未修改真实偏好、内容库，未提交 Git。
