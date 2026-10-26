# 紧凑调研与账号弹窗验收

2026-10-27；当前工作树源码；本机 `darwin-arm64` 原生 Electron，实验版 `0.3.52`。测试使用独立临时内容库与桌面副本，只在临时副本重建 renderer；未覆盖共享构建目录。助手启动被替换为测试回调，付费请求为 0。

执行：

```sh
cd workbench
npm run typecheck:renderer
cd ..
node workbench/scripts/compact-research-probe.mjs
```

两项均退出 0。另对改动执行 `git diff --check`，对新增脚本执行 `node --check`，均无错误。完整行为与稳定动画后的几何值见 [收据](electron/compact-research-receipt.json)。最终只导出既有 `ProductionRecovery` 供雷达页复用，其实现与行为不变，导出后 renderer 类型检查再次通过。

| 规则 ID | 结果与证据 |
| --- | --- |
| Foundation-01/03、Surface-01/03 | 已查看账号、调研、报告导入及冲突截图：实白面板、蓝动作、灰辅助文字，圆角 24px、常规遮罩与模糊。弹窗固定最大宽 720px；960×680 下账号为 720×584.28、调研为 720×555.67、报告导入为 720×481.58，均居中且底部动作可达。账号墙未发生布局移动。 |
| Controls-01/02 | 普通表单仅一处“取消”与主要提交。平台与姓名同排，URL、备注、标签、截图可选；截图和平台说明可展开。平台别名 RedNote 搜索选择、下拉 Esc、可创建报告类型均经真实 React/IPC 验证。 |
| Surface-03、Reading-03 | 初始焦点、Tab 边界、Esc 与返回触发器通过。未触碰的空账号取消后不登记脏草稿；有实质内容的取消/Esc保留填写，主页面出现明确“放弃本次填写”入口，放弃后可正常切页。没有增加第二份 managed-draft guard。 |
| Image-01/02 | 保留原比例预览；内层图片 Esc 只关闭内层、外层草稿仍开且焦点回原图触发器。独立图片预览关闭也回到已连接的触发器。共享 viewer 通过显式 trigger ref 与 rAF 后恢复焦点，其他直接调用保留当前活动元素回退。缩放手势继承现有实现，本次未复验真实触摸板或 Windows 硬件。 |
| Reading-02、Interaction-01/03 | 40 行备注使内部内容区滚动，960×680 下弹窗最大高 632px，footer 仍可达。忙碌时取消与 Esc 被阻止；CAS 冲突信息在弹窗内可见，字段不丢失。既有 pending mutation 恢复组件保留；测试在合成库中明确丢弃冲突恢复意图。 |
| Controls-02、Interaction-03 | 新建调研使用显式标题、目标、深度与本次评论选项；评论初始未勾选，取消后选择回显，只有提交才创建任务。验证提交保存标题和未勾选评论参数，未进行实际助手或付费调用。 |
| Acceptance-01/02/03 | renderer 类型检查与隔离原生 Electron probe 通过；截图覆盖 1440×1000、960×680。此次仅修改瞬态表单及图片关闭焦点；未宣布完整应用页面、系统减少动画、全量模板多图、Intel/Windows、安装器、安装/升级或签名验收通过。打包交付门禁仍以根 AGENTS.md 为准。 |

截图：

- [账号 960×680](electron/account-add-960x680.png)、[账号 1440×1000](electron/account-add-1440x1000.png)
- [调研 960×680](electron/research-960x680.png)、[调研 1440×1000](electron/research-1440x1000.png)
- [长备注与固定底栏](electron/account-long-draft-960x680.png)
- [报告导入](electron/report-import-960x680.png)
- [CAS 冲突保稿](electron/account-cas-conflict-960x680.png)
