# 同事与学员交付：当前事实和待验收差距

日期：2026-10-28，源码观察约 11:59—12:06（Asia/Shanghai）。基于工作区实际文件，不等同于已冻结安装包；其他开发会话仍在修改代码，当前 `release.config.json` 已为 0.5.1，既有安装验收主要对应 0.5.0。本文只读代码和记录，未执行原包、服务、安装、采集或产品测试，仅新增本文。

目标是同事在自己的电脑安装后，打开自己的第二大脑即可完成已确认的内容主线；未来学员的流程、动作反馈和结果保存应与演示一致。**方法一致不要求复制锦成的个人定位、经历、判断、账号、图片、声音或全部历史资料。** 本文不扩展计费系统，不以本机结果宣布全平台完成。

状态用词：**静态可见**＝实现和接线存在；**历史已验**＝既有记录限定的具体版本／环境；**本轮未验**＝本次没有在同事或学员机器上验证。

## 1. 新库初始化已实现，但“任意自己的第二大脑”仍有结构前提

**静态可见：** [vault/index.mjs:74](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/index.mjs:74) 的 `openVault` 先检查是否识别为知识库；[core.mjs:182](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/core.mjs:182) 的未绑定目录识别依赖 `00_个人背景`、`04_选题库`、`05_内容草稿`。这不是任意 Obsidian 文件夹通用导入器。`createVault`（index 80—124）可从空目录创建目录、AGENTS、SOURCE_OF_TRUTH、选题卡模板和定位入口；定位明确写“尚未完成”，未自动套用锦成本人定位。

桌面 [controller.mts:433](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/controller.mts:433) 433—456 提供新建“我的知识库”，先保留新目录身份、拒绝覆盖已有目录。新库只创建 `skills/工作台说明.json`，业务方法实际来自插件，不是复制锦成的整份 skills/资料库。

**针对验收：** 在无开发资料的全新用户账户中，从“新建”走完定位→选题→参考→原页初稿→两轮手改→最终四项资产；再打开同事实际拥有、尚未接入的库。明确记录支持的目录结构；不匹配时给可执行的接入说明，不显示“打开成功但什么也没有”。空白库不能需要开发者后台预填 T 卡、源映射或私人资料才能继续。

## 2. 初次导入与已使用库迁移是两种路径，不能靠复制演示运行库混用

**静态可见：** [vault/index.mjs:30](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/index.mjs:30) 30—60 首次建立 `vaultId`、设备／inode 身份和 runtime 根绑定，旧身份变化会拒绝沿用。已用库复制到别处后直接打开，不等同于无绑定初始库首次打开。[backup.mjs:136](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/backup.mjs:136) 136—140 明确位置变化需迁移恢复；该文件 280—302 有重绑定以及 `restoreVaultBackup`／`migrateVault` 实现，因此不是“没有迁移能力”，而是必须用正确入口并实际验收。

**历史已验：** [便携性记录:37](/Users/mac/code/dashboard/Nova-Content-Hub/docs/verification/production/2026-10-28-vault-portability.md:37) 记录旧无绑定 ZIP 在新目录冷读，建立新身份，读取 47 条内容、56 个账号、32 份报告；同时保留 157 条分类问题。48—56 行说明后来新版 ZIP 只重新核对文件和空目录，未重跑冷读。这个记录不证明“复制已运行演示库到同事机器也能直接使用”。

**针对验收：** 分别测试无绑定初始资料包、同事未接入原库、已使用库的正式备份恢复。跨电脑恢复后，正文、原页意见、裁决、最终封面、阶段账本和未提交但已持久暂存的输入不丢；旧机器绝对路径不再作为有效运行绑定。不要通过手删 `.workbench` 绕过身份保护，因为其中有真实任务证据和业务状态。

## 3. 库内相对来源可携带；库外关联来源与私人方法前提必须明确

**静态可见：** [source-map.mjs:6](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/source-map.mjs:6) 6—15 定义内部相对目录；36—55 对 linked 来源要求绝对路径与根身份核验；69—80 将缺失来源标记为不可用。内部 source-map 与库外链接不是同等便携。已提取方法仍包含旧作者绝对路径和本人经历／判断库要求，例如 [教程原件:102](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-jiaocheng-video/upstream/current/METHOD.md:102) 102—112、146—150；这些是来源证据，不应在学员机器自动猜路径或假定本人资料已存在。

**历史已验：** 便携性记录 33—35 的初始包 source-map 全部为 internal 相对路径；导入清单中的旧路径被保留作静态溯源。这个结论限该包，不覆盖任何学员自己的 linked 来源。

**针对验收：** 用不同用户名、不同盘符／中文带空格路径、缺少外部判断库的机器完成内容主线。只读用户明确绑定的来源；外部参考缺失时仍可采用用户已有材料继续，并准确说明受限步骤。跨电脑恢复时要求重新定位确实需要的外部来源；不能悄悄读取开发者 Home、把市场规律当成本人观点或把锦成的语气与经历当作学员本人材料。

## 4. 随包市场、宿主安装、宿主登录和真实模型执行是四件事

**静态可见：** [dist.mjs:153](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:153) 将配套插件市场作为额外资源交付；[setup.mts:28](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/setup.mts:28) 28—43 检查市场版本／模式／架构，57—82 提供打开助手／市场和复制安装位置。它不等于用户已经安装并启用该插件。

[assistant-skill.mts:53](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/assistant-skill.mts:53) 53—95 要求用户当前宿主缓存、启用配置、精确版本、pairId、架构、能力和 hash 匹配；[assistant-runtime.mts:53](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/assistant-runtime.mts:53) 53—91 使用插件随包 Node 做 doctor，再启动宿主。因此插件升级后旧聊天是否加载新版必须单独核对，不能仅看到“已安装”就认定可执行。

**历史已验：** [0.5.0 发布记录:39](/Users/mac/code/dashboard/Nova-Content-Hub/docs/releases/2026-10-28-0.5.0-jincheng-preview.md:39) 记两宿主四能力的 8 次 doctor／空 callback 探测，明确未运行宿主模型；43 行也说明旧聊天须重载插件或新开聊天。不是新机器零配置的真实成功证明。

**针对验收：** 从未安装插件的同事账户完成安装引导、首次宿主使用、一次真实研究／写稿提交和一次真实封面候选提交；分别验证两种等待及恢复、失败取消重试、原任务继续与切换助手。宿主自身安装、登录和可用模型额度应在首次使用就明确；同事不用终端手改配置，不依赖开发者的宿主缓存。精确定位不了原聊天时诚实提示，不能用“已唤起助手”表示业务完成。

## 5. 部分运行时已随包，但“可安装的系统”不等于“本地转写支持的系统”

**静态可见：** 插件运行使用自身 `runtime/node`，不依赖系统 PATH 中的 Node（assistant-runtime 69—80）；打包 [dist.mjs:20](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:20) 20—35 要求平台和架构相同的原生 runner，不允许在一台机器伪造全平台构建。

本地 ASR 在 [dist.mjs:123](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:123) 123—127 仅在 `darwin-arm64` 且构建机指定负载存在时随包；[local-asr-runtime.mts:21](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/local-asr-runtime.mts:21) 21—35 只识别 darwin-arm64，且要求 manifest 的 `macOSMajor` 与宿主完全相同。App 配置最低 macOS 13（dist 165 行）不代表本地 ASR 覆盖 macOS 13 及以上。构建路径 `.local-probes/...` 是装配输入，交付后应只从正式 Resources 读取；不能要求同事也有该开发目录。

**历史已验：** 0.5.0 发布记录 39 行仅记录 macOS 26／arm64 下真实 MP4 转写，Intel、Windows 尚无同等验收，Windows ARM 未纳入。

**针对验收：** 用没有 Python、Node、ffmpeg 和开发缓存的干净目标机器核对核心读写、原页、研究报告和转写；断网后本地能力仍按真实已随包负载工作。Intel／Windows／其他 macOS 版本没有本地 ASR 时，明确可用的人工文本／字幕或用户配置的其他通道，不把一项缺能力变成整个工作台不可用，也不宣称同等已验。

## 6. 当前 disabled 是免权益实验路径；required 尚不是可交付的解锁产品

**静态可见：** [release.config.json](/Users/mac/code/dashboard/Nova-Content-Hub/release.config.json:1) 当前 AUTH_MODE=disabled、prototype=true。写入门 [validation.ts:80](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/shared/validation.ts:80) 对所有非 disabled 模式报 AUTH_NOT_CONFIGURED；[production-handoff.mjs:22](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/bridge/production-handoff.mjs:22) 同样拒绝 required 的助手任务执行；[setup.mts:46](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/setup.mts:46) 明确 required 为 `not-integrated`，disabled 为 `disabled-experimental`。

这说明目前 required 是受限测试门，不是“用户登录／付费后会自动解锁”的已接入功能。disabled 也不代表外部服务免费或自带额度；现有 0.5.0 记录明确 TikHub 需使用者自己的 Key 和预算授权（43 行）。

**针对验收：** 本次同事完整功能包必须明确实际渠道与模式，核对 App、插件、市场一致；不能误发 required 测试包让同事无法新建和编辑。未来若用户要求权益接入，另按既有接口和明确需求验收，不在本轮擅自新增计费／账号架构或把更改配置字符串当作权益系统完成。

## 7. 可公开教学示例与锦成真实第二大脑必须分别交付

**静态可见：** [build-demo-library.mjs:8](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/build-demo-library.mjs:8) 8—25 构建独立示例库：5 个模板、52 条提示词、一条 `isExample=true` 内容、两张标明 AI 虚构人物的封面；这是显式样例，不是锦成真实本人图库。

[artifact-safety.mjs:8](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/scripts/artifact-safety.mjs:8) 8—30、38—79 排除凭据、本机状态和多类测试数据，允许经清单核验的上游方法测试原件；[dist.mjs:142](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:142) 142—151 有对应打包过滤。这些能降低误带凭据／运行库的风险，但不能自动判断某段真实经历、公司资料、人物照片、声音、源方法素材是否适合对学员分发。

**历史事实：** 初始第二大脑 ZIP 是真实资料合集，便携性记录 17—35 包含 00–06、07、08、skills、交付物、历史备份和导入材料；“可冷读”不是“全部可公开教学”的授权证明。0.5.0 中四个技能包缺失的旧说法已被 [最新接续记录:10](/Users/mac/code/dashboard/Nova-Content-Hub/docs/handoffs/2026-10-28-continuation-progress.md:10) 更新为取得 621 文件；取得原件也不自动解决学员分发边界。

**针对验收：** 最终产物清单区分应用／方法资源、匿名教学示例、同事获授权的资料包、用户自己的库。学员包只带已确认可分发的示例和方法资源；逐项核验人物、声音、个人定位、经历、未公开稿件、第三方素材和方法原件的适用边界。示例无开发者路径依赖，清楚标记示例身份；新建学员内容后不把锦成素材自动作为本人资产。

## 8. 既有安装证据可复用其范围，不能给新版本或所有学生环境背书

**历史已验：** [0.5.0 记录:39](/Users/mac/code/dashboard/Nova-Content-Hub/docs/releases/2026-10-28-0.5.0-jincheng-preview.md:39) 39—53 记录 Apple Silicon／macOS 26 本地预览、安装／重开／可恢复卸载、部分系统信息，且明示 ad-hoc 签名、无正式公证、Intel／Windows 未验。相关缺口和版本范围应原样保留，不重写成当前 0.5.1 已通过。

**静态可见：** [dist.mjs:39](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:39) 39—56 检查生产签名后仍直接阻断 production，原因是完整功能／原生安装／签名验收门未完成。配置中有 Windows NSIS 与多架构参数，不等于已有对应完成产物。

**针对验收：** 对最终承诺交付的每个平台／架构单列已构建、已安装、已运行及未验；冻结源码、App、插件与清单版本一致。在同事真实机器上完成核心主线而非仅展示旧页；保留安装后名称图标版本公司版权、真实大小时间、签名、权限、重开升级及卸载保全证据。0.5.1 工作区修改须进入实际交付包重新验其影响范围；未具备生产条件就准确称预览，不取消或假装通过现有门禁。

## 本轮收敛标准

“同事可用”至少需要一台没有开发环境的承诺目标机器，从安装和选择自己的库开始，独立完成红框主线并重开读回最终四项资产；“学员体感一致”再加空白库首篇、本人资料替代、教学样例边界和明确的能力提示。流程等价、结果真实、保存可靠是共同标准，个人内容和未覆盖平台不因此自动承诺。
