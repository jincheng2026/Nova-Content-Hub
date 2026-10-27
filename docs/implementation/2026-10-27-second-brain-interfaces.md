# 第二大脑并行实施接口

权威需求：`docs/research/2026-10-27-local-workbench-delivery-plan.md` 及用户后续补充。当前采用三块独立文件负责人；主线程负责集成和发布，不混写代理负责文件。已有新分支工作，不另建用户侧聊天或擅自移动原库。

## Task 1 共享 Vault 存储与运行桥接

唯一负责人拥有 `plugin-src/src/lib/vault/**`、`plugin-src/src/lib/file-library/index.mjs` 及该文件配套声明与新增 Vault 存储测试。其他文件需要改动先通知主线程。

以下接口由本任务在 `plugin-src/src/lib/vault/index.mjs` 和相应 `.d.mts` 导出，供桌面任务调用；均为同步本地文件 API，业务路径只由主进程传入：

```ts
type RootIdentity = {dev:string;ino:string};
type LibraryBinding = {root:string;libraryId:string;rootIdentity:RootIdentity};
type VaultSection = 'profile'|'accounts'|'materials'|'patterns'|'topics'|'drafts'|'reviews'|'prompts';
type VaultDocument = {id:string;section:VaultSection;title:string;relativePath:string;hash:string;format:'markdown'|'html'|'text'|'json'|'other';writable:boolean;contentId:string|null;tNumber:string|null;bytes:number};
type VaultIssue = {code:string;message:string;relativePath?:string};
type VaultSnapshot = {root:string;name:string;vaultId:string;documents:VaultDocument[];issues:VaultIssue[];positioning:{status:'missing'|'partial'|'available';documentIds:string[]};revision:string};
inspectVault(root:string): {recognized:boolean;issues:VaultIssue[]};
openVault(root:string): LibraryBinding;
createVault(root:string): LibraryBinding;
vaultRootForRuntime(runtimeRoot:string): string|null;
readVaultSnapshot(runtimeRoot:string): VaultSnapshot|null;
readVaultDocument(runtimeRoot:string,id:string): {document:VaultDocument;text:string};
saveVaultDocument(runtimeRoot:string,input:{id:string;expectedHash:string;text:string},options:{mutationId:string}): {document:VaultDocument;text:string};
createVaultDocument(runtimeRoot:string,input:{section:VaultSection;title:string;text:string},options:{mutationId:string}): {document:VaultDocument;text:string};
trashVaultDocument(runtimeRoot:string,input:{id:string;expectedHash:string},options:{mutationId:string}): {trashed:true};
readVaultTaskContext(runtimeRoot:string,contentId?:string|null): unknown;
```

`openVault` 识别并创建库内受管 `.workbench` 与运行库，原始知识文件保持原位；无法识别的非空普通目录拒绝接管。`createVault` 用已预留空目录创建基础骨架。`vaultRootForRuntime` 对普通旧库返回 null；对受管运行库校验根身份后返回显式 Vault 根。错误 code 可使用既有 `INVALID_INPUT/CONFLICT/CORRUPT/NOT_READY/IO_ERROR`，保留明确中文 message。

核心适配应使原 `openLibrary(runtimeRoot)` 的外部 API 读取源文件并同步可重建投影，创建/保存正文和 `saveProductionDraft` 受控落到同篇 T 目录；不让旧页面和 CLI 继续维护另一份权威正文。旧库原实现保持。同步前检查源 hash；未知或复杂 HTML 保留原文件，标只读并给原因，不向用户承诺未实现的可写能力。T号稳定并尊重作废编号；现有 T 卡/总览/已做目录、HTML当前入口按实际来源解析。

读/写/新建/回收操作拒绝 symlink、越界、超限、无效身份；写入采用持久 mutation receipt 与原文件 hash，重复 mutation 幂等，外部修改不静默覆盖。共享素材引用保留一份。新库初始化约束、README/SOT、定位入口、skills说明。用户资料从不复制进源码资源。

最低验证：临时目录新建库、拷贝真实库后识别/T卡/当前稿件数量与来源、创建无最终标题内容、修改后原文件可读、外部修改冲突、重复mutation、路径/符号链接拒绝、旧库创建读取不回归。优先实现后做这些数据保护检查；完整历史套件后期集中跑。

## Task 2 Electron 与 Semi 页面接线

唯一负责人拥有 `workbench/src/**` 中本任务所需文件及新增桌面测试；其他代理不得修改。不要改 `plugin-src/**`。依赖 Task1 的固定接口，可先实现类型与有限 IPC，后期联调。

当前开库支持普通旧库与显式 Vault，普通用户操作同一个“打开知识库”；新建默认创建 Vault 骨架，保留旧库读取。识别后绑定其返回的旧精确 LibraryBinding，应用当前库名称和揭示位置显示 Vault 根。所有操作继续经既有主进程 caller 校验、operation queue、有限 preload 与worker；禁止 renderer 直接 fs 或任意路径。

新增有限业务 API 可采用 `readVault/readVaultDocument/saveVaultDocument/createVaultDocument/trashVaultDocument`，严格校验字段。Task1 API 的 runtimeRoot 来自当前绑定，renderer只给文档ID/section/title/text/hash。读写适用 authMode；required 模式不得通过新增接口绕过。

实现 Semi 知识库资料界面：个人定位、账号、素材、规律、选题/稿件、复盘及未知资料可以列举、搜索、阅读；可写格式新建/编辑/保存，提示源路径及外部冲突，长文与未知文件可定位。能与现有内容详情、生产任务、封面、模板、雷达页面衔接，避免另建一套重复内容工作区。新建内容允许标题暂空，用稳定临时显示名记资料/想法，后续定标题；当前普通新建报告、手工报告、导入和账号等入口保持/补齐。

初始化提供“梳理定位/继续定位/调整定位”，启动现有 production writing task 的固定 `parameters.workflow='positioning-interview'`，`contentId=null`，`accountId=null`，`tools=[]`、零采集预算，参数中可携 `businessSkill='xindao-interview'`；常规内容写作参数用来源匹配业务方法。后续主线程把定位候选/阶段检查点的核心持久化接通。不要假称已有宿主自动安装；复用现有插件安装/检测UI。

必须读取 `docs/design/内容工作台设计标准.md` 和新版统一规范；规则ID记录适用。真实 Semi、单一主动作、可搜列表、预设＋自定义、未保存保护、中文输入、模态焦点/Esc和错误保留。主线程保留后期视觉与完整回归。

最低验证：native/renderer typecheck、受控IPC额外字段/路径拒绝、旧库界面入口不丢失、新建打开取消无写入。完成后报告文件、命令、实际结果与未覆盖项。

## Task 3 插件业务 Skills 与 registry

唯一负责人拥有 `plugin-src/skills/**`、`plugin-src/scripts/build.mjs`、相关纯构建/skill测试，以及新增 `plugin-src/resources/business-skills*`、更新 `production-methods-provenance.md`；不得改 Task1 数据代码或 workbench。

显式源：`/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑/skills/`、`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/` 下实际 jc-* 方法、现有 research sources，以及用户给的 xindao-interview ZIP（文件路径见完整交付计划/历史用户信息，可从已知微信2026-10目录按精确文件名定位）。只读来源，不运行其安装/业务脚本，不复制私人样例/密钥/绝对HOME。

把正式业务方法放入插件并以明确 executor/business-method 角色登记，含完整references与必要脚本完整性校验；Codex和WorkBuddy manifests都可发现。保留现有 contract-only/executable 权限语义，不让 required 模式获得业务执行权限。

默认定位为 `xindao-interview`：保存其四阶段访谈法、每次一问、真实事实、公开边界、逐关确认、续访、局部调整。改写来源中的CWD猜库/直接任意文件写入/全局强制拦截为冻结上下文与受控提交；已有 `_v0.1` 定位可识别，不重复创建定位。每个后续任务都读取适用定位上下文，非把全访谈发给全部采集服务。

找到并适配已取得原件的 jc-media-research、jc-comment-visualize（可选）、jc-benchmark-intake、jc-pattern-extractor、jc-topic-generator、jc-content-writer、jc-video-analysis、jc-jiaocheng-video、jc-gongzuotai-write、jc-cover-copy、jc-media-review、jc-publish-closeout 等，建立准确实际清单。只引用未取得的原件不能假称已安装；可用现有Nova方法提供明确命名的适配，不伪装原Skill。停用/历史B-roll方法不自动启用，dbskill不接。

所有方法通过执行Skill的固定handoff/context/claim/progress/两种等待/submit与receipt契约使用；业务方法给候选与允许检查点，不绕过CAS直接改当前稿。新建内容资料先行、标题可空；将来用户给新的标题选题Skill可通过registry新增路由，而不改页面逻辑。执行Skill提示按固定业务方法选择并读取，不把十几Skill变一排按钮。

最低验证：builder的Skill验证、role/capability/完整性路径包含实际依赖、两个manifest清单；执行旧测试中受skill数量影响的相关测试但不为保留旧个数而禁用新方法。完成后报告精确来源、适配改动、缺失原件和未验证宿主。

## 集成与提交

三个实现者均不创建子代理，不触碰原始用户资料，不自行提交/切分支或执行外部服务。各自完成后报告真实检查结果，主线程检查diff、按职责逐段提交。共享契约变更先给主线程，不能自改另一个所有者文件。后期集中回归、真实宿主和安装验收由主线程协调；不能把单模块完成称为全应用完成。
