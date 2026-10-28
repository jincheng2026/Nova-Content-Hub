# 公共弹窗四角边界验收 · 2026-10-28

## 根因与范围

`ProductionDialog` 外框为 24px 圆角，但原始 `overflow:visible` 不裁剪内部实白 footer；直接 body/footer 结构的「共创口播稿」等弹窗底部因此覆盖为直角。恢复旧值的真实渲染 [production-before-960.png](production-before-960.png) 复现了两处白色方块。保留工作区已有的 `overflow:hidden` 修复，补边界职责注释；正文已有独立 `overflow-y:auto`，无需改变组件和业务流程。

通用组件一次修复覆盖口播/教程/科普共创、阶段动作、创作方法、研究采用、对标账号与报告表单及记录详情等全部 `ProductionDialog` 调用。

调查其余原生 dialog：`management-dialog`、`leave-dialog`/设置、`library-manager-dialog`、`prompt-dialog`、`image-preview` 已有或继承原生 overflow:auto；封面生成与图片查看已有 overflow:hidden。Semi Modal 实际 computed overflow:hidden（库自带），没有重复补丁。封面其它变更由主线程负责，本次未修改。

## 可复跑证据

执行：`node docs/verification/production/2026-10-28-cover-portable-fix/modal-probe.mjs`。

Probe 使用实际 `ProductionDialog`、`ManagementDialog`、`PopupSelect`、Semi `Modal`，内容为临时合成 fixture；当前源码经 Vite 打包后由本机 Chromium 真实渲染。临时 HTML/TSX、编译输出与浏览器会话运行后清理，不调用 IPC、不读取或改写真实用户数据、不安装应用。该脚本目前记录本机依赖路径。

| 规则 | 验收 | 结果 |
|---|---|---|
| Surface-03 | 1280×860、960×680，四角24px与白底子层 | ProductionDialog 四角连续，见 [1280](production-1280.png)、[960](production-960.png)；旧值复现底角覆盖，修复值消失 |
| Surface-03 / Reading-02 | 长正文末尾与底部动作可到达 | 960 下 body clientHeight=500、scrollHeight=2957、scrollTop=2457；footer 留在独立可见区域 |
| Controls-02 | 下拉 portal 不被圆角裁切 | 特意把 dialog 压至260px，使下拉越过底边；两种 viewport 的 `bottomOutside=true`，底部命中 `semi-select-option`；见 [popup-960.png](popup-960.png)、[popup-1280.png](popup-1280.png) |
| Surface-03 / Reading-02 | 管理弹窗长正文 | 两尺寸四角24px、overflow:auto、能滚到末尾；见 [management-960.png](management-960.png)、[management-1280.png](management-1280.png) |
| Surface-03 | Semi 模态 | 两尺寸 overflow:hidden、24px四角，没有白底覆盖；见 [semi-960.png](semi-960.png)、[semi-1280.png](semi-1280.png) |
| Acceptance-01 | 源码组件打包与渲染 | Vite 编译成功；结果见 [modal-results.json](modal-results.json) |
| Acceptance-02/03 | 验证边界 | 已人工看图；这是真实 Chromium 组件渲染，非完整应用流程、非原生 Electron 安装包验收；没有宣布全部二级页面业务流程、跨平台、焦点/未保存保护回归通过 |

完整 Electron probe 曾成功截图首个 ProductionDialog，后续窗口循环遇到 ERR_FAILED，改用隔离 Chromium 完成全部代表样本；不以浏览器结果替代原生 Electron 或 Windows 验收。
