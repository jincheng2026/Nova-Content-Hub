# 0.3.51 全工作台易用性验收

2026-10-27，Asia/Shanghai。功能源码冻结 `ada224d`，已快进合入 `main`。完整实施及规则矩阵见 [72](../../../实施/72-全工作台易用性改造.md)。本目录记录开发构建与隔离环境验证。

## 验证结果

- native、renderer 类型检查通过。
- 桌面自动化回归 **422/422**，0失败、0跳过；平台/边界/生产任务聚焦 **21/21**。两者有重叠，不相加计数。
- 最终共享选择器修改后，补跑 renderer 类型检查及真实 Electron 操作专项，通过。
- `npm run build:both`、`npm run build:desktop -- --auth both`：required/disabled 开发构建通过。Vite 大 chunk 提示仍存在，`productionReady=false`。
- [操作入口专项](actions/README.md)：真实 React/Semi/Electron，内存 IPC，1280×860、960×680。
- [扩展 Electron 回执](electron/electron-production-receipt.json)：18项通过，1440×1000、1000×800；真实 sandbox/preload/IPC、worker、临时内容库和 Chromium 创作页。助手启动及文件选择模拟。
- [持久日志](logs/)；[初次探针失败说明](electron/initial-failures/README.md)。最终通过结果没有删除早期失败记录。

## 关键交互与设计规则

Layout-01、Interaction-01/02：收起侧栏42px行高、7px间距；展开有连续中间帧，快速反向切换、关闭后焦点归位及 inert 通过。系统 reduce 使用非零极短时长，Semi 下拉选择仍完成。

Controls-01/02、Surface-03：原按钮去重、平台别名搜索与保存、自定义比例 Tab/Enter 保存及旧值回显、非法值禁存、清除为 null、中文 Enter/Esc、刷新保稿及调研折叠保留评论选择通过。照片导入取消模拟无写入，封面照片空选不触发生成。

Acceptance-02：执行者目检 actions 总览、照片、封面、比例和中文分类截图；主线程目检侧栏收起窄窗、平台选择及960×680封面图。其他页面保留截图，未逐项复核全部视觉场景。

平台公开目录经真实 IPC 同步：V5.3.2、20项，UTC `2026-10-26T17:06:47.002Z`，见 [TikHub OpenAPI](https://api.tikhub.io/openapi.json)。固定无认证 GET，不发送服务 Key、不调用计费端点。**当前只有抖音采集操作已接入**，其他平台仅记录或使用已有资料；选择目录不授予采集权限。

## 交付范围

Acceptance-03：本次仅 darwin-arm64 开发环境，无付费采集/模型请求。未重新安装 `/Applications/自媒体工作台.app`（仍0.3.48），未生成本版安装包。Intel Mac、Windows、物理中文输入法、真实文件选择器/拖放、真实 Codex/WorkBuddy GUI 未在本轮重新验收。安装和系统展示要求引用根 AGENTS.md。

main 已在源码 ada224d 完成双模式重建与572项运行资源检查，见 [main-runtime-verification.json](main-runtime-verification.json)。旧开发进程42784正常退出，新进程9463运行0.3.51；没有强制终止或覆盖已安装应用。
