# 0.3.52 雷达与真实流程验收

2026-10-27，Asia/Shanghai。功能源码 **60d649a** 已合入main。完整逐项矩阵、能力边界及设计规则见[实施记录](../../../实施/73-紧凑调研弹窗与爆款雷达.md)。

- [最终雷达桌面回执](release-electron/radar-ui-receipt.json)：6组检查，含自定义门槛/非法数值、创建/等待/提交/验收、加入/重复、目录即时刷新、原正文保存、未知指标/拒绝、1280×860及960×680七页巡检。真实sandbox/preload/IPC/worker/隔离库，候选合成，宿主启动模拟；付费请求0。
- [最终生产桌面回执](release-production-electron/electron-production-receipt.json)：18项，含报告HTML/伴随JSON/多页、设置保存与密钥清除撤销、原正文CAS、平台与能力隔离、保稿、菜单动效、系统reduce和切库。
- [紧凑弹窗](../2026-10-27-compact-research-dialogs/README.md)：17项，真实隔离内容库，账号保存、平台搜索、草稿放弃、CAS、嵌套图片、busy Esc、报告与调研。
- [真实服务](../../2026-10-27-live-services/README.md)：TikHub两次HTTP402、未得到业务数据；Ark简短OK（70 tokens、1 REQ）；faster-whisper真实短音频识别（2169ms、12字符、0外部REQ）。没有取得金额账单，不声称免费。
- [日志](logs/)：桌面428/428，原型150/150，生产core/交接38/38；最终恢复修复后针对14/14。计数存在重叠，不合计。桌面全套开始后补了最后恢复边界，新增修复由最终14项及最终UI构建覆盖。类型、skill静态验证与required/disabled开发构建通过，Vite大chunk警告保留。

高风险审查复现并关闭两项P2：普通report可注入雷达状态；子内容提交后父操作恢复冲突。针对实际事务补回归，包括ensureCreation、用户叙事/正文/参考更新、父回执存在但来源追加中断，由独立审查重跑4项后确认解除。

主线程已目检本版账号弹窗960×680、雷达列表/查询960×680；照片回焦/嵌套截图由弹窗执行者另目检。截图与实际几何校验保留；自动截图不等于每页所有业务状态已人工验证。初次探针读锁竞争见[说明](release-electron/initial-failures/README.md)，业务锁没有放宽。先前阶段的临时探针结果同目录保留，最终以release-*目录为准。

main已双模式重建并校验各576项资源，[哈希](main-runtime-verification.json)对应源码60d649a。旧开发进程9463正常退出，新开发进程68955运行0.3.52。没有覆盖已安装0.3.48；没有交付本版安装包。当前darwin-arm64开发环境；Intel/Windows、物理输入法/手势、真实助手GUI和新模型生图未在本轮全部验收。安装及系统元数据要求以根AGENTS.md为准。
