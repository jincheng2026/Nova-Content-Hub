# 工作台操作入口专项验收

2026-10-27，macOS `darwin-arm64`。命令：`node workbench/scripts/workbench-actions-ui-probe.mjs`，退出码 0；结构化结果见 [result.json](result.json)。

直接使用当前 renderer 的真实 React、Semi UI 和 Electron；Vite 输出、Electron 用户目录均在系统临时目录。IPC 使用内存夹具，未读取真实内容库、未生成封面、未发布内容。此次只核验下面列出的操作与页面，不代表全部旧布局探针或系统安装包通过。

| 规则 | 已验证行为 | 截图 / viewport |
|---|---|---|
| Controls-01、Layout-03 | 无计划 Hero 只保留“继续编辑”，调用原内容打开处理器；复制与日程仍独立 | `overview-no-plan-1280.png`（1280×860）、`overview-no-plan-960.png`（960×680） |
| Controls-01 | 照片仅一个原位选择文件入口，调用 `choosePhoto`；模拟取消不写入；本人声明文案保留 | `photos-single-import.png`（960×680） |
| Controls-02、Surface-03 | 旧比例 7:11 原样显示；搜索 3:4；非法 0:3 禁用保存且没有 mutation | `channel-stored-ratio.png`、`channel-ratio-search.png`、`channel-invalid-ratio.png`（960×680） |
| Controls-02、Surface-03 | 21:13 按 Tab 后保留并显式保存、重新打开；13:21 按 Enter 后保留并保存；清除保存 null；未改关闭不提示丢稿 | `channel-custom-saved.png`（960×680） |
| Cover-01、Controls-01/02 | 本人照片与“不放人物”双向切换；重复按钮不存在；无生成/保存；本人声明仍可展开；人物、生成动作可达且无横向溢出 | `cover-no-person-1280.png`（1280×860）、`cover-no-person-960.png`（960×680） |
| Controls-02、Surface-03 | 同一公共可新建选择器输入中文后 Enter 不提交父 form；Esc 只关闭下拉并保留当前中文文本 | `chinese-category-enter-escape.png`（960×680，隔离控件夹具） |

已目检总览、照片、封面、比例自定义与中文分类截图。实际系统文件选择器使用模拟取消回复；物理中文输入法、真实拖放、Intel Mac、Windows 和安装包不在本专项覆盖范围。旧 cover-layout 的无关卡片高度阈值未在这里放宽或宣布通过。

探针按 Semi 实际选中回调完成后开始下一次输入。早期探针仅等待两帧，先前点击的延迟回调覆盖后续输入，造成旧值回退误报；补齐选中值与下拉关闭的状态等待后，当前源码通过完整流程。本专项最终基于主线程的公共选择器修改；没有为过探针保留渠道专属应用/取消比例按钮。
