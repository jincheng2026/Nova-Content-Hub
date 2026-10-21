# 0.3.34 内容工作台设计体系重构

本记录区分隔离 React/Semi/Electron 验证、最终 ARM Mac 安装包与真实安装验收。源码冻结和产物数据以随后生成的 package.json 为准。

## 改动范围

- 实际查看已安装内容工作台的今天、内容管理、VI、提示词、设置、生成封面弹层，留下 reference/ 截图；固定规则见 [设计标准](../../../design/内容工作台设计标准.md)。仅提取视觉参数，不复制其品牌/素材/业务源码到安装包。
- 全局中性浅灰 #F5F5F7、近黑文字 #1D1D1F、主蓝 #0071E3；Semi 控件、侧栏、卡片、表格、模态一并映射。总览同图模糊背景 Hero、普通页浅蓝页头、模板真实不同样张叠图；保留已有 N 标识及渠道颜色。
- 个人资料在原卡片内编辑；全部保存字段可读，长文本和多照片可展开收起；复用原 CAS、草稿和错误保护。其他长摘要使用 Semi Typography 展开。
- 删除应用“减少动画”开关、公开字段与 renderer dataset；仅兼容读取旧布尔值，不重写旧文件，不改变提醒/登录设置。保留操作系统减少动画和 Semi animationend 生命周期。
- 生成、发布、图片读取/缓存、内容库结构和后台写入规则沿用已有实现。

## 已执行的定向验证

| 检查 | 结果与边界 |
|---|---|
| workbench native + renderer typecheck | 通过，logs/typecheck.log |
| preferences.test.mjs | 3/3 通过；旧 true/false、保全其他设置、不在读取时改文件、新保存严格校验 |
| creator-settings-ui-probe.mjs | 通过；真实 React/Semi + 隔离 bridge，原卡片保存/取消/错误/CAS/输入中刷新/全部字段和照片，1440/1100/900，profile/ |
| design-system-ui-probe.mjs | 通过；五页、提示词弹层、50 张模板末项、长文展开、760 窄窗口/空态/无横溢，visual-system/；合成库，非真实业务写入 |
| template-density-ui-probe.mjs | 通过；既有选择/预览/学习回调、键盘与系统 motion；无真实学习或生成 |
| dialog-controls-ui-probe.mjs | 默认最终通过，系统减少动画通过。旧默认失败可由探针窗口失焦复现，补齐 native 输入焦点前提后原流程通过，见 time-focus-diagnosis/；未因此修改产品控件 |

真实参考 screenshot viewport 由桌面窗口决定；隔离视觉截图1440×968，窄760×968。设置探针截图含不同尺寸，均在日志/脚本记录。截图和 CSS 检查不替代最终安装运行验收。

## 真实安装预检修正

首个候选的真实安装暴露侧栏未选中项继承 Semi 蓝字。视觉探针改用与产品一致的真实 Semi Button 后得到 red；对公共侧栏颜色加正确 specificity 后 green，选中蓝/未选中近黑。保留 preflight-3953098/ 原候选记录，最终交付重新冻结构建；不改按钮处理器和导航保护。

封面作品实拍另发现 borderless 图片按钮被根 .semi-button 胶囊圆角裁为椭圆；根按钮恢复12px，胶囊仅用于 light/solid 操作按钮。真实 Semi 图片按钮形状断言通过。第二候选记录保留于 preflight-dd09ac0/。

## 交付状态

待冻结构建、安装后原生页面与 Finder 核验。当前交付目标仅 darwin-arm64 preview；Intel Mac/Windows 未在本轮原生验收。按用户选择使用临时签名，不作 Developer ID、公证或全平台生产可用声明。
