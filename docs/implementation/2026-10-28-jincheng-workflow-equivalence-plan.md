# 锦成工作流业务与交互等价重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development`（按本文件唯一 owner 分派）或 `executing-plans`，逐任务实施。步骤使用 checkbox 跟踪。用户已确认业务方向，不再询问是否采用本方向；执行中只对真正未定且会改变业务结果的问题定点澄清。

**Goal:** 在 Semi + React + TypeScript + Electron 中，让用户打开选中的知识库即可按原锦成工作流继续已有内容或新建内容；CLI agent 到正式宿主插件的跳转、可靠事务和 Nova 雷达是增强。

**Architecture:** 选择“业务协议与交互等价重建，复用 Nova 基础”。以原 jc-doc 全结构和 T 内容真实文件为业务真源，增加受控解析、逐字段 CAS、明确的阶段决定与读回接口；原创作模板的完整功能分区、操作和生成 HTML 格式是兼容验收，不以大概相似的通用 React 编辑器代替。优先把经过审查并随包冻结的原 `template/shell.html`、`template/app.js`、`template/style.css`、`kit/kit.js` 适配为受信本地创作视图，在 Semi/React 外壳中挂载，通过 Electron 保存桥连接 CAS；不执行用户 HTML 携带的任意脚本，不依赖旧 Python 常驻服务。是否采用隔离的本地文档容器由安全审查决定，它不是加载旧服务的 iframe 方案。现有任务、事务、回执、候选验收、封面和雷达内核继续使用，通用 body 与最终整套 bundle 从主要创作协议退出，降为兼容投影/可选交付。

**Tech Stack:** 现有 Electron、React、TypeScript、Semi UI；Node ESM 业务库及 `.d.mts` 声明、Node test、现有 Electron UI probe。版本遵守仓库已锁依赖，不在本计划升级框架。

**Spec:** [本轮纠偏设计](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-jincheng-rebuild-decisions.md)、[原工作流证据](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-jincheng-workflow-truth-audit.md)、[Nova 差距审查](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-nova-jincheng-workflow-gap-audit.md)、[Vault 与完整 Skill 核对](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-vault-skill-workflow-truth.md)。纠偏设计是本轮实施设计，不倒写为原作者曾批准。设计与验收继续遵守 [内容工作台设计标准](/Users/mac/code/dashboard/Nova-Content-Hub/docs/design/内容工作台设计标准.md) 和根 [AGENTS.md](/Users/mac/code/dashboard/Nova-Content-Hub/AGENTS.md)。证据冲突以本轮用户明确要求、当前原件与具体字段/函数证据为先，不能只看文件日期。

## Global Constraints

- 当前用户要求覆盖来源的 shadcn/Circle 和 V1 固定写操作限制：本产品使用 Semi，提供真实新建入口、编辑、阶段协作和宿主跳转；来源规则只用于还原业务职责。
- 0.4 是技术原型，停止作为本轮同事业务版交付；旧包、测试、截图按旧版本归档，不改名冒充新成果。保留当前分支 `codex/second-brain-workbench-rebuild` 的源码检查点，不 reset/rebase 清除既有工作；业务重构从后续独立 feature 提交开始。
- 原始用户资料只读。真实样例在显式验收副本中测试，先记录来源路径、SHA256、复制时间和用途；不执行来源 install/server/CLI 脚本，不修改原包、原 Vault、原 App 或原账号数据。
- 新建知识库的全部新业务产出位于选中 Vault 内；旧 Vault 的库外正式档案、方法论、判断库、报告、VI 等只能显式关联或导入。不得猜父目录或 Home，不将 `06_发布复盘/已发布视频档案` 分析副本升级成正式档案。
- 内容身份至少 `(vaultId, workId)`；正式档案身份 `(sourceId, videoId)`。`work_id` 是 T 编号，`content_id` 是原待发布包身份，不能互换。安装原 App 的 47 条与用户交接 Vault 的 46 个 T 属不同观察，不能同号合并。
- 原模板的标题/叙事区、对照/通读、参考筛选、逐段作者栏、逐句建议、意见回复、录制/包装与扩展兜底区，以及键盘、选字、保存反馈必须逐项对照；生成文件仍为兼容 jc-doc 与原模板标记的单文件 HTML。原 jc-doc 的未知 page/item/locked/fields 扩展完整 round-trip；无操作保存字节不变，定点修改仅改变目标数据块内预期字段，HTML 数据块以外字节不变；用户明确重新生成时才按受信模板更新模板区，仍保留原身份和人工字段。原 HTML 不强制转 Markdown。
- 保留作者最新手改、已确认判断与版本关系；AI 不能用重新生成整篇覆盖人工输入。“任务提交成功”“用户采用”“内容已确认”“录完”“真实发布”“正式建档”“复盘看过”分别记录。
- 完整 Skill 与 references 的方法不可压成 13 行摘要；路径、权限、付费、provider、宿主启动单独适配。方法文件中的旧授权、私人样本和服务命令不自动成为当前授权。
- xindao 明确允许的直接对话纯文字模式保留：不要求handoff、不落库、不调用外部付费；工作台任务模式才走固定请求/回执。所有真实文件写入仍需显式绑定、权限与CAS，不能用“统一执行器”删除直接模式。
- Codex、WorkBuddy 共用固定请求、进度、两种等待、恢复、取消、失败、重试、验收与回执；两个宿主分别完成真实验证后才能标支持。没有原会话可靠标识或审批事件时明确能力提示，不猜、不自动批准。
- 不重新启用已停用的 jc-chendian、jc-broll-judge 或未交付草稿 B-roll 流程；不因代码里曾引用某 Skill 就标成支持。原 `jc-content-writer`、教程 Skill、研究共同写稿是不同方法，不能暗中拼成一条默认流水线。
- 本轮最终原生交付目标为 `darwin-arm64`。`darwin-x64`、`win32-x64` 各自构建/安装/原生运行未完成前明确缺口；`win32-arm64` 未纳入本轮支持。各目标按根 AGENTS 维护名称、图标、公司版权、版本、产物哈希和系统展示证据。
- 业务完成按真实旅程验收，不按测试数量、文件数量或“同名 Skill 已打包”宣布完成；不承诺今晚完成全功能或固定速度。

## 基线冲突已作的实施解释

1. `vault-skill-workflow-truth` 的创作页段落仍说只取得历史快照；`gap-audit` 与当前源目录证明完整 `creation-page/SKILL.md/schema/scripts/template/server` 已取得。计划采用完整源实现作协议证据，同时保留“源包不等于 installed brain-save/current 版本”的边界。
2. 9 月 28 日“25 环节分工总表”有现实、建议、待同意三层；以最新 Vault AGENTS、当前 Skill、原 jc-doc 实际字段交叉定契约。T020 的旧创作页与 10 月 8 日工作稿冲突必须呈现，不能按 mtime 或只看导航自动选当前稿。
3. 新 `xindao-xuanti` 为默认选题方法：候选未选不创建 T 卡；用户直接明确“就做这个/加这个选题”可在同一动作完成确认与建卡，不再重复确认。旧批量 `jc-topic-generator` 仅作明确选择的兼容方法，不把十条素材门槛套给自主灵感。
4. 新教程方法显式选择后遵守叙事确认与分段门；已有确认记录直接继续，不重复审批。研究共同写稿没有同一强制门，入口显示采用方法，不能悄悄放宽教程或强制研究都走教程。
5. 11 个元问题渐进填：立题 1/2/4 的写给谁；叙事 3/5/6/7 与 4 的收获；写稿录制 8；发布前 9；复盘 10；数条之后 11。其余“还没到”，不能在建卡时做长问卷。

主线程实际GUI还读到原T020详情：主动作接着写、当前创作页/旧对照页/card.html三条网页、四个参考及逐字稿/素材文件夹、24个其他文件、三个打不开的本机位置；当前创作页提示8977页面服务未开。这是当前环境的只读观察，未验证其保存。新产品须原生呈现同样的对象和证据入口，直接读写选定原件的jc-doc，消除手起旧服务的要求；服务不可达不等于原页面状态为空。

| 原动作类别 | 新版执行方式 | 例子 |
|---|---|---|
| 文件查看 | 原生reader/系统安全打开，不创建AI任务 | 参考原片、逐字稿、其他文件、正式档案 |
| 确定性操作 | 本地受控事务与回读 | 保存作者文本、复制提词稿、排序、选定候选、导入 |
| AI协作 | 带对应完整方法与上下文跳宿主 | 拆解、叙事建议、写稿、逐条处理意见、研究 |
| 人的决定 | 在原决策点记录具体版本证据，复用宿主确认 | 选题、叙事、采纳/拒绝、锁稿、包装选定 |
| 外部服务 | 独立连接器能力/权限/可用性，不泛化AI任务 | 社媒采集、X服务、私域、任务板连接 |

## 文件与写入责任地图

以下路径相对仓库根。标记“新”是本计划新增模块；既有大文件仅修改接线，不继续塞业务细节。

| owner | 文件责任 | 禁止重叠 |
|---|---|---|
| A：业务协议/安全（Sol high；关键协议 Astra high 审查） | 新 `plugin-src/src/lib/creation-document/{index.mjs,index.d.mts,parse.mjs,fingerprint.mjs,mutations.mjs,store.mjs,build.mjs,structure.mjs,feedback.mjs,publication.mjs}` 与 `test/`；新 `workbench/src/shared/creation-contracts.ts` | 原始数据解析、事务与权限唯一 owner；B 不改这些文件 |
| B：交互与桌面集成（Sol high） | 新 `workbench/src/renderer/jincheng/{workspace.tsx,compare.tsx,reading.tsx,reference-analysis.tsx,suggestion.tsx,recording.tsx,packaging.tsx,workflow-panel.tsx,workspace.css}`；`app.tsx`、`production-workspace.tsx` 接线；新 `workbench/src/main/creation-controller.mts` | 新增受信模板目录 `workbench/resources/creation-template/` 与模板保存桥也唯一归 B；所有共享 UI/IPC/主线程接线统一 B；C/D 提接口需求不直接修改这些文件 |
| C：方法与宿主（Sol high） | 新 `plugin-src/resources/method-sources.json`、`business-stage-contract.md`；各 `plugin-src/skills/*`、method adapter、`assistant-runtime.mts/assistant-skill.mts` 和 `production.mjs/production-artifacts.mjs` | 任务状态/Skill 构建/provenance 唯一 C；A 通过独立 creation API 提供写回 |
| D：库映射/选题/发布（Sol high） | 新 `plugin-src/src/lib/vault/source-map.mjs`、`workflow.mjs`、`topics.mjs`、`positioning.mjs`、`material-intake.mjs`、`knowledge.mjs`、`official-archive.mjs` 及声明/测试；既有 `vault/core.mjs/bridge.mjs/index.mjs/resources.mjs` | 不直接改 A 的原页模型、不改 B UI；B 消费 D 的 API |
| 集成负责人（主线程） | 阶段差异审查、跨模块决策、实际业务验收、提交/发布证据；最终发行文件 | 实现阶段不并行改相同文件，按阶段检查真实 diff，不重复整库无变化审查 |

并行只在明确接口后开：T1 同时启动 C 的 T10a（完整主体+全部refs+来源差异冻结），A 做 T2/T3，D 做 T4；T10a是流程T7/T8/T9的前置，不准等最后才修13行方法摘要。T10b运行接线依赖T7。B先基于T2接口做T5静态结构，真实写回等T3。不得四人同时改 `production.mjs`、`app.tsx` 或 shared contracts。机械文档/清单任务可用 Luna high，协议实现与测试使用 Sol high；两次实质修复仍失败或设计歧义升级 Astra high。

## 公共接口（由 A/D 各自实现，调用方不得另造近似类型）

```ts
// 新 creation-document/index.d.mts；Json 允许原扩展，不等于所有字段可任意写。
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type WorkRef = {vaultId:string;workId:string};
export type SourceRef = {sourceId:string;documentId:string};
export type RawItem = {id:string;kind:string;locked:Record<string,Json>;fields:Record<string,string>} & Record<string,Json>;
export type CreationDocument = {source:SourceRef;revision:string;pageId:string;raw:Record<string,Json>;items:RawItem[];writable:boolean;issues:string[]};
export type FieldEdit = {itemId:string;field:string;before:string;after:string;itemFingerprint:string};
export type WriteActor = {kind:'author'} | {kind:'assistant';taskId:string;requestId:string;approvalId?:string};
export type EditGroup = {mutationId:string;source:SourceRef;baseRevision:string;pageId:string;actor:WriteActor;edits:FieldEdit[]};
export type CommitResult = {revision:string;mutationId:string;receiptHash:string;changedFields:string[]};
export function parseCreationHtml(bytes:Uint8Array,source:SourceRef):CreationDocument;
export function itemFingerprint(item:RawItem):string;
export function replaceCreationData(bytes:Uint8Array,doc:CreationDocument):Uint8Array;
export function applyEditGroup(current:CreationDocument,group:EditGroup):CreationDocument;
export function readCreationDocument(root:string,source:SourceRef):Promise<CreationDocument>;
export function commitCreationEdit(root:string,group:EditGroup):Promise<CommitResult>;
export type BuildInput = {work:WorkRef;source:SourceRef;data:Record<string,Json>;templateVersion:string;mutationId:string};
export function buildCreationPage(root:string,input:BuildInput):Promise<CommitResult & {pageId:string}>;
export function regenerateCreationPage(root:string,input:BuildInput & {expectedRevision:string;removeItemIds?:string[];authorDecisionId?:string}):Promise<CommitResult>;
export type StructureAction = {kind:'append-suggestion'|'append-item'|'set-locked'|'reorder'|'rebase'|'remove-items';payload:Record<string,Json>};
export function commitCreationStructure(root:string,input:{source:SourceRef;expectedRevision:string;actor:WriteActor;action:StructureAction;mutationId:string}):Promise<CommitResult>;
export function noteStatus(item:RawItem):'empty'|'pending'|'handled';
export function buildSuggestionEdits(doc:CreationDocument,input:{suggestionId:string;decision:'采纳'|'不采纳'|'部分采纳';proposed?:string;partialMine?:string}):FieldEdit[];

// 新 vault/workflow.d.mts；状态是独立事实，非一个总 stage。
export type CheckpointKind = 'topic'|'author-analysis'|'analysis-comparison'|'narrative'|'key-segments'|'complete-draft'|'final-script'|'packaging'|'recorded'|'publication'|'archive'|'review';
export type DecisionInput = {work:WorkRef;kind:CheckpointKind;artifactId:string;artifactHash:string;expectedRevision:string;decision:'confirm'|'reopen'|'reject';evidence:{actor:'author';text:string;at:string}};
export function confirmCheckpoint(root:string,input:DecisionInput):Promise<{revision:string;decisionId:string}>;
export function readWorkFlow(root:string,work:WorkRef):Promise<{revision:string;facts:Record<string,Json>;decisions:Json[];nextActions:Json[]}>;
// 新 vault/source-map.d.mts
export type SourceRole = 'topics'|'drafts'|'materials'|'official-archives'|'archive-analysis'|'judgments'|'methods'|'author-evidence'|'reports'|'prompts'|'visual-assets';
export type SourceBinding = {id:string;role:SourceRole;mode:'internal'|'linked';root:string;format:string;authority:'official'|'analysis-copy'|'candidate';writable:boolean};
export function resolveSource(root:string,sourceId:string):Promise<SourceBinding>;
```

JS 实现和 `.d.mts` 同一提交；renderer 类型从 shared 接口转发，不复制另一套更窄业务模型。`Json` 未知键默认原样只读；原 `fields` 字符串通过明确用户编辑可写，未知 `locked` 默认只读且不能被助手通用 patch 删除。AI 修改 locked、reply、新增建议、结构重排使用单独验证动作，不伪装成作者 field edit。辅助公共函数在各任务定义并导出，禁止调用未实现的隐式 helper。

## 阶段与依赖

| 阶段 | 任务 | 可独立审阅/提交的成果 | 退出验收 |
|---|---|---|---|
| S0 来源冻结 | T1 + T10a | 0.4交付隔离、原件/副本、字段矩阵、完整方法与refs | 真实来源身份明确，原件未变，流程实现输入完整 |
| S1 第一纵切 | T2–T5 | 原 jc-doc 全读写、CAS、桌面接线、四篇恢复 | T020/29/26/44 所有状态读写重开保持，无未知字段丢失 |
| S2 业务协作 | T6–T9 | 对照/通读、作者先拆、叙事分段、新建选题/续接 | 各真人决定不丢，不强制整套提交 |
| S3 方法/研究 | T10–T11 | 全方法与refs、权限/provider适配、研究评论机器合同 | 路由和方法等价证据，可恢复阶段任务 |
| S4 完整闭环 | T12–T14 | 录制包装/封面、正式档案复盘、知识分权/次级入口 | 新库端到端，旧库缺资源真实提示，Nova雷达不退化 |
| S5 交付 | T15–T16 | 双宿主验收、Mac arm64冻结安装包 | 真实环境/系统界面/重开升级证据，其他目标明示缺口 |

T4 可与 T2/T3 并行但 T5 前必须齐备；T10a先冻结方法，T10b运行接线等T7；T11依赖T10，T12依赖T6/T7，T13依赖T4/T7，T14依赖T4/T9/T11。每个任务一项feature/test/docs提交，具体是否squash由集成检查决定，不把多个未验收子系统压成“重构完成”。

## Task 1：冻结来源和四篇 golden 验收副本

**Owner / depends:** 集成负责人；无前置。

**Files:** 新 `docs/implementation/jincheng-equivalence-source-map.md`、`docs/acceptance/jincheng-equivalence/golden-manifest.json`；新 `plugin-src/src/lib/creation-document/test/fixture-loader.mjs`、`fixture-loader.test.mjs`；修改现有交付记录中 0.4 用途标注（先定位当前发布记录，只加状态，不改历史事实）。真实副本存临时验收目录，不提交个人原稿。

**接口:** fixture loader `loadGoldenManifest(file)` 只返回已登记的副本路径/原 hash/当前稿冲突，不扫描 Home；`goldenCopies` 含 T020/T029/T026/T044 四篇。

- [ ] 读取三份 Spec、源 schema、原 `creation_doc.py`、保存服务和实际四个 jc-doc；建立 `kind/key → 来源 → 读取 → 权限 → 写回 → UI → 测试` 清单，至少含 info/segment/suggestion/refnote/skeleton/step/pubslot/pubcand/final 及未知条目。不要只列 body。
- [ ] 写 manifest 校验失败用例，拒绝原目录作为可写副本、缺原 hash 和重复源身份：
```js
assert.throws(()=>loadGoldenManifest({samples:[{workId:'T020',original:'/a',copy:'/a'}]}),/COPY_REQUIRED/);
```
- [ ] 创建只读来源快照记录和隔离副本；登记真实非空状态计数（见 gap §4），T020 另记录旧创作页与新工作稿冲突。提交测试用的是合成/脱敏完整结构 fixture，真实副本仅本机验收。
- [ ] 运行 `node --test plugin-src/src/lib/creation-document/test/fixture-loader.test.mjs`；读取原件 SHA256 与开始值比较不变。预期四个副本定位明确，fixture 失败项均拒绝。
- [ ] 提交 `docs: freeze workflow equivalence sources and golden cases`；标记0.4技术原型，不构建/安装替换用户现用版。

## Task 2：完整、惰性的 jc-doc reader 与无损序列化

**Owner / depends:** A；T1。

**Files:** 新 `creation-document/{parse.mjs,fingerprint.mjs,index.mjs,index.d.mts}`、`test/parse.test.mjs`、`test/fixtures/*.html`；D在A接口合入后修改 `plugin-src/src/lib/vault/core.mjs` 仅接入完整读取结果，旧 `htmlBody()` 仅作标明用途的摘要。

**接口:** 实现公共 `parseCreationHtml/itemFingerprint/replaceCreationData`；附 `orderedSegments(doc):RawItem[]`（按 `locked.order`、重复/缺失顺序报告，不变更 ID）。

- [ ] 写先失败的全字段读回与字节保留测试：
```js
const doc=parseCreationHtml(bytes,{sourceId:'drafts',documentId:'T029'});
assert.deepEqual(orderedSegments(doc).map(x=>x.id),['seg-b','seg-a']);
assert.deepEqual(replaceCreationData(bytes,doc),bytes);
assert.equal(doc.items.find(x=>x.kind==='unknown_branch').fields.future,'原样');
assert.equal(itemFingerprint({...item,locked:{...item.locked,ai_state:{reply:'新答'}}}),itemFingerprint(item));
```
- [ ] 运行 `node --test plugin-src/src/lib/creation-document/test/parse.test.mjs` 确认新增接口缺失/失败。
- [ ] 实现有界惰性 HTML 数据块提取：只识别唯一 `script#jc-doc[type=application/json]`，不 DOM 执行、不 iframe、不读取外链。保留原始 bytes 与数据块边界；识别字符串/转义，拒绝重复 JSON key、多个 jc-doc、重复 ID、非字符串 fields 为可写输入，允许安全只读展示问题。文件超限清楚报告，不静默截断。指纹对齐原算法（去 ai_state、NFC/换行规范化、排序键、数值规范化、SHA256 前12位）。
```js
// 仅变更 JSON 区间；序列化必须 escape '<'，防止新文本结束 script。
return Buffer.concat([prefix,Buffer.from(JSON.stringify(nextRaw).replaceAll('<','\\u003c'),'utf8'),suffix]);
```
- [ ] 跑 targeted 测试，加入 `</script>`、伪标签、Unicode、CRLF、未知嵌套键、refs 中 `..` 路径、重排数组仍按 order、无操作保存完全一致。媒体引用只解析不授予访问。
- [ ] 提交 `feat: read and preserve complete jc-doc documents`；对四个 golden 导出 raw 深相等对账，不作“迁移完成”声明。

## Task 3：逐字段 CAS、分组事务与安全原位写回

**Owner / depends:** A；T2。

**Files:** 新 `creation-document/{mutations.mjs,store.mjs}`、`test/{cas,authorization,recovery}.test.mjs`；D按A接口需求顺序修改 `vault/core.mjs` 导出已有 mutation journal/根身份/安全路径接口，A只消费，必要时只导出已有能力，不复制第二事务库。

**接口:** 实现 `applyEditGroup/commitCreationEdit/readCreationDocument`，模块内 `assertActorCanWrite(actor,item,field)` 从固定请求和作者决定解析权限，绝不信任 renderer 自报 approvalId；新增 `replyToNote(root,{source,itemId,handledNote,reply,expectedFingerprint,actor,mutationId})`，reply 原文必须与当前待处理文本匹配。

- [ ] 写失败用例：同组 `mine+decision` 全成/全不成、stale before、指纹变更、reply不改变编辑指纹、跨库身份、助手未经采用不能写 mine/note/decision/approved，未知扩展保留：
```js
assert.throws(()=>applyEditGroup(changedNoteDoc,staleEdit),/CONFLICT/);
assert.throws(()=>applyEditGroup(doc,assistantMineWithoutApproval),/AUTHOR_FIELD/);
assert.deepEqual(applyEditGroup(doc,group).raw.future,doc.raw.future);
```
- [ ] 运行 `node --test plugin-src/src/lib/creation-document/test/{cas,authorization,recovery}.test.mjs` 得到新增行为失败。
- [ ] 在锁内重新读原文件，用 pageId/itemId、原 fingerprint、每字段 before 校验；文件 hash 已变化但目标字段/指纹仍一致时允许安全合并，结构编辑要求整页基准一致。用现有 journal 持久 intent→临时文件→atomic rename→回读→receipt。禁止整 doc 黑箱覆盖。断电恢复按 mutationId 幂等核验，不重新生成新请求。
```js
for(const edit of group.edits){
 const item=current.items.find(x=>x.id===edit.itemId);
 if(!item || itemFingerprint(item)!==edit.itemFingerprint || item.fields[edit.field]!==edit.before) throw new Error(`CONFLICT:${edit.itemId}:${edit.field}`);
 assertActorCanWrite(group.actor,item,edit.field);
}
// 全部通过后才复制 raw 并应用，未改键不删除。
```
- [ ] 注入写前、rename后、receipt前故障；重开恢复到全旧或全新，不存在正文已换而decision未写；并发改不同字段不互相覆盖，同字段保留用户输入和冲突说明。真实副本写一次重读，原件 hash 不变。
- [ ] 提交 `feat: transact field-level jc-doc edits with recoverable CAS`；Astra检查权限与事务不变量后进入 UI 接线。

### T3b：首次生成、重新生成与结构变更（A，T3 同阶段硬性成果）

**Files:** 新 `creation-document/{build.mjs,structure.mjs,test/build.test.mjs,test/structure.test.mjs}`；B拥有的受信模板由T5提供冻结hash，A只消费构建接口。依据原 `creation-page/build_page.py:382–487,635–690` 与 `schema/creation-page.md:188–231`，移植协议，不运行来源脚本。

- [ ] 先写失败用例并运行 `node --test plugin-src/src/lib/creation-document/test/{build,structure}.test.mjs`：空库已选T首次生成可再读；重生成保留page_id/token/info id、全部人工fields与locked.ai_state；旧条目漏传默认拒删；同id换kind拒绝；新增建议原句恰好一次（包含重叠匹配）；旧已裁决建议原句不再匹配只提醒，保留决定。
- [ ] 实现 `buildCreationPage/regenerateCreationPage/commitCreationStructure`。新建校验源type必填与叙事条件，分配唯一page_id/token；重生成按稳定item id合并旧全部可改字段，输入值不得覆盖，旧扩展字段补回。删除只接受列明ID、基准hash及真实作者决定；rebase只在认可新稿后将mine写baseline；set-locked不能写ai_state；reply走专门接口。追加refs/refnote/skeleton/step/pub*同样有schema与权限校验。全部走现journal与回读，不直接fs覆盖。
- [ ] 受信生成器输出唯一jc-doc与原jc-style/jc-kit/jc-app标记、自包含HTML、稳定导出→重生成；防script闭合注入。明确区分“保存字段不动模板”和“重生成更新受信模板”。保留token作兼容身份，Electron授权由固定根/来源/能力决定，token不替代IPC安全。
- [ ] 空库选题→叙事与关键段→首次HTML→人工改稿→AI追加建议→结构调整→重生成→重开，全程保留人工fields/回复/扩展与身份，原件不变；缺此链禁止S1退出。提交 `feat: build and regenerate compatible creation pages safely`。

## Task 4：显式 source map 与新库根内业务真源

**Owner / depends:** D；T1，可与T2/T3并行。

**Files:** 新 `vault/{source-map.mjs,source-map.d.mts,test/source-map.test.mjs}`；修改 `vault/index.mjs` 的 create/open、`resources.mjs` 和相关声明；新 `docs/implementation/jincheng-vault-layout.md`。

**接口:** 公共 `SourceBinding/resolveSource`；新增 `createDefaultSourceMap(root)`、`linkSource(root,{role,selectedRoot,authority,writable})`、`importSource(root,{sourceId,selectedEntries,expectedHashes})`，只能以文件选择器已授予路径调用。

- [ ] 写失败测试：仅选 Vault 不访问父目录；分析副本不作为官方档案；不同 vaultId 的 T020 不合并；导入目标冲突不覆盖：
```js
assert.equal((await resolveSource(root,'archive-analysis')).authority,'analysis-copy');
await assert.rejects(()=>resolveSource(root,'unlinked-official'),/SOURCE_NOT_LINKED/);
assert.deepEqual(accessedPaths.filter(p=>!p.startsWith(root)),[]);
```
- [ ] 运行 `node --test plugin-src/src/lib/vault/test/source-map.test.mjs` 确认先失败。
- [ ] 将 source map 固定在 `.workbench/source-map.json`（沿用既有隐藏目录），业务目录明确：`06_发布复盘/正式发布档案`、`09_创作知识/{判断库,方法论,本人材料,案例}`、`10_调研报告`、`11_提示词`、`12_视觉资产`；旧02/03/04/05沿用，不移动既有文件。新库同时创建完整 `00~06` 业务目录（具体中文名称照已冻结Vault来源表）、`skills`、`AGENTS.md`、`CLAUDE.md`、`README.md`、`SOURCE_OF_TRUTH.md`；源文档中的用户私有路径/权限不能原样生效，写入经过适配且真实可用的导航、来源与规则。旧库不覆盖其这些文件。`.workbench/runtime`只为可重建缓存/任务运行证据，不藏唯一叙事确认或包装选择。显式外部 link 可只读；新产出默认根内。
- [ ] 验证路径/符号链接/选择范围、Windows分隔符、导入hash与来源记录；新空库打开后无需找作者Home，旧库缺资源报具体能力缺口。source map导入仅引用配置，正文迁入事务由对应任务执行。
- [ ] 提交 `feat: bind explicit vault sources and root-contained outputs`。

## Task 5：第一条桌面纵切——四篇全状态打开、修改、重开

**Owner / depends:** B；T2/T3/T4。

**Files:** A创建并维护 `workbench/src/shared/creation-contracts.ts`，B消费不另改；B新增 `workbench/resources/creation-template/{shell.html,app.js,style.css,kit.js,provenance.json}`、`renderer/jincheng/template-bridge.ts`，`workbench/src/main/creation-controller.mts`、`renderer/jincheng/workspace.tsx`；修改 `main/controller.mts`、`main/vault-worker.mts`、`preload/index.cts`、`shared/contracts.ts/validation.ts` 与 `renderer/app.tsx`；新 `workbench/test/creation-desktop.test.mjs`、`scripts/jincheng-golden-probe.mjs`。

**接口:** IPC `readCreationDocument({source}) → CreationDocument`、`commitCreationEdit(EditGroup) → CommitResult`、`readCreationPending/recoverCreationPending`，绑定根从主进程取得，renderer不能传任意root。EditGroup中的actor是主进程内部类型；对外IPC DTO剔除actor/approvalId，可信controller依用户当前操作、固定请求和已持久化的作者决定生成身份与权限，宿主插件同样不能自称author或自行提供有效approval。复用既有 pending 持久和未保存保护。

- [ ] 写失败测试：禁止 renderer指定任意根、非法字段拒绝、根切换取消旧视图写入、断开后恢复同mutationId；mock调用用实际 EditGroup，不绕开控制器。
```js
await assert.rejects(()=>controller.commitCreationEdit({...group,source:{sourceId:'other-vault',documentId:'T020'}}),/SOURCE|BINDING/);
assert.equal((await controller.readCreationDocument({source})).items.length,expectedItems);
```
- [ ] 运行 `node --test workbench/test/creation-desktop.test.mjs` 确认先失败；先建立受信原模板挂载与一个作者字段保存闭环，随后逐区对账；不以另做字段表完成模板验收。
- [ ] 接 IPC→worker→creation store；受信模板以冻结资源重建视图，只注入安全解析的数据，用户HTML原脚本永不加载；禁Node/任意网络/任意文件能力，URL与媒体通过已授权资源协议。kit的保存、pending、恢复与状态提示端口迁到Electron桥，保留原操作语义。打开来源页后以原pageId/itemId显示所有 kind；未知条目可展开看全部字段，原fields显式编辑、locked只读。取消主路径的“必须建立Markdown工作稿”，保留明确“仅抽取正文”的兼容入口且标丢失协作语义。旧对照页/普通Markdown/报告分别采用适合的reader，不因不含jc-doc假称为空；当前版不可编辑的旧格式明确只读。原T020的三网页/四参考/其他文件/缺路径以对象目录呈现。
- [ ] 运行 typecheck、targeted test、`node workbench/scripts/jincheng-golden-probe.mjs --manifest <验收manifest>`；逐篇原状态读回、改一个字段、重开、比对未知键；T020来源冲突留在选择界面而非自动覆盖新稿。
- [ ] 提交 `feat: continue complete creation pages in Electron`。S1退出：空库首次生成、重生成及四篇全状态可继续，完整原模板功能分区逐项通过，app关闭重开正确，原HTML数据块外字节不变、原件hash不变；此时仍不宣布所有工作流完成。

## Task 6：对照、通读、参考讲法与逐句反馈完整交互

**Owner / depends:** B（UI）、A（feedback模块，先独立提交后B消费）；T5。

**Files:** A新 `creation-document/feedback.mjs/test/feedback.test.mjs`；B新 `renderer/jincheng/{compare,reading,reference-analysis,suggestion}.tsx` 与 `workspace.css`、新 `workbench/scripts/jincheng-feedback-probe.mjs`；B修改workspace接线。

**接口:** `noteStatus/buildSuggestionEdits`；UI对照/通读都读同一 CreationDocument，不缓存另一份正文。`buildSuggestionEdits`纯函数输出field group，真正保存仍T3。

- [ ] A写失败测试覆盖删句、原句重叠多匹配、先改 proposed 再采纳、拒绝不改mine、部分采纳需作者具体partialMine、改note后旧reply保持但恢复pending：
```js
assert.equal(noteStatus({...seg,fields:{...seg.fields,note:'新版'}}),'pending');
assert.throws(()=>buildSuggestionEdits(repeatedDoc,{suggestionId:'sug-a',decision:'采纳'}),/QUOTE_NOT_UNIQUE/);
assert.equal(buildSuggestionEdits(doc,{suggestionId:'sug-a',decision:'不采纳'}).some(x=>x.field==='mine'),false);
```
- [ ] 运行 `node --test plugin-src/src/lib/creation-document/test/feedback.test.mjs`，失败后实现纯函数；采纳mine/decision/proposed同组提交，partial不自动猜替换，已裁决建议不被新AI建议覆盖。
- [ ] B优先复用已冻结原app.js操作逻辑并适配Semi外壳；确需替换的控件逐项证明相同行为，不将以下分区重新概括成通用编辑器。实现原对照/通读、refs多家展开、refnote讲法点/对应建议、skeleton段落跳转、spare_refs、baseline差异、意见就地选字锚点、整体意见、AI处理版本与回复。保留J/K/A/R和撤销重做且输入框不截获；撤销也用CAS，不能覆盖新外部改动。
```tsx
return view==='reading'
 ? <Reading document={document} onQuote={openNoteForSegment}/>
 : <Compare document={document} onEditGroup={commitGroup}/>;
```
- [ ] 运行 typecheck与feedback probe；在 T020/T029 副本验证既有决定、旧回复、改意见恢复pending、先改后采纳、部分采纳、通读选字归同段、切页/关闭脏输入保留。按 Layout-02、Controls-01/02、Reading-02、Acceptance-02记录960×680/1280×860截图和键盘路径。
- [ ] 分别提交 `feat: preserve suggestion and versioned feedback semantics` 与 `feat: restore comparison and reading collaboration views`；不以截图通过代替保存对账。

## Task 7：阶段产物与决定协议，解除通用整套终点

**Owner / depends:** D（workflow）、C（任务接线，D先提供稳定接口）、B（阶段UI，接线最后）；T3/T4/T6/T10a。

**Files:** D新 `vault/{workflow.mjs,workflow.d.mts,test/workflow.test.mjs}`；C修改 `file-library/production.mjs/production-artifacts.mjs`、相关声明与 `production-vault-archive.mjs`；B新 `renderer/jincheng/workflow-panel.tsx`；新 `plugin-src/resources/business-stage-contract.md`（C）。

**接口:** 公共 `confirmCheckpoint/readWorkFlow`（DecisionInput.evidence仅可信controller可构造，外部请求文本不充当作者身份）；新增 `appendStageArtifact(root,{work,kind,artifactId,hash,path,methodId,taskId})`。正式决定存同T文件夹 `创作过程.json`（schemaVersion1，只有该文件存artifact/decision引用、方法/当前入口，不复制正文）；拆解/叙事/稿/包装各自真实文件是内容真源。原jc-doc `info.fields.approved`、`recorded`、建议decision与pub*/final仍是相应原状态的权威字段；先从原字段及来源协议映射有效决定，不要求旧用户再次确认。`创作过程.json`只补原格式未覆盖的阶段证据/版本引用，不能另存一个可与approved相矛盾的布尔状态。涉及双文件更新用同一可恢复事务，投影读取冲突须报告并以有来源的原业务字段/版本裁定，绝不以新账本覆盖旧真源。

- [ ] D写失败测试：旧info.approved/recorded/decision映射后无重复确认且无账本冲突；叙事确认绑定artifactHash；叙事变化旧确认保留但不再适用；等待/重试不抹决定；已完整稿只改一句不要求analysis/narrative/packaging：
```js
await confirmCheckpoint(root,narrativeDecision);
await appendStageArtifact(root,newNarrativeVersion);
assert.equal((await readWorkFlow(root,work)).facts.narrativeConfirmed,false);
assert.equal((await readWorkFlow(root,work)).decisions.length,1);
```
- [ ] 运行 `node --test plugin-src/src/lib/vault/test/workflow.test.mjs`；实现append-only决定与当前适用性投影。作者UI点击或宿主可核实的明确回复才能创建确认，助手自称“用户确认”不是证据。可靠宿主回复引用/回执用于同一次确认，不让用户回工作台再确认一次；不能核实回复的宿主保留等待与明确操作入口，不偷转成已确认。
- [ ] C给既有固定请求新增 `methodId/work/source/checkpoint/expectedArtifactHash/allowedActions`；阶段产物可独立提交和验收，任务accepted不自动confirmCheckpoint。兼容整套bundle只供明确整套交付，不再是resume/only-edit必交四件套。
```js
if(request.workflow==='stage') validateStageArtifacts(request.checkpoint,artifacts);
else validateLegacyBundle(artifacts); // 保留旧显式调用兼容
```
- [ ] B显示具体待决定内容和版本：叙事/关键段/完整稿/定稿/包装等分别确认，已有有效决定直接继续；pending里保存本次输入；移除projection后从文件重建业务状态不丢。
- [ ] 三个owner按依赖各提交，集成后以“已有拆解/已确认叙事/已有稿/只改一句”四起点验收，提交阶段名 `feat: preserve stage artifacts and author decisions`。

## Task 8：作者先拆的盲态、对比与裁决

**Owner / depends:** D业务state，C任务可见性，B界面；T7。

**Files:** 新 `vault/reference-analysis.mjs`、声明与test；C更新 `skills/jc-video-analysis/` 完整方法入口与stage上下文；B新 `renderer/jincheng/reference-analysis-workflow.tsx`。

**接口:** `startReferenceAnalysis(root,{work,mode:'ai-only'|'author-first',referenceIds})`；`readReferenceAnalysis(root,{analysisId,audience:'author'|'worker'})`；`recordAuthorAnalysis(root,{analysisId,expectedRevision,text})`；`submitComparison(root,{analysisId,authorHash,aiHash,items})`；`decideComparison(root,{analysisId,itemId,decision,note,expectedRevision})`。未解盲AI内容不给author DTO、日志摘要、notification或复制上下文。

- [ ] 写先失败的防泄漏与阶段测试：
```js
const view=await readReferenceAnalysis(root,{analysisId,audience:'author'});
assert.equal(JSON.stringify(view).includes(secretAiSentence),false);
await assert.rejects(()=>submitComparison(root,beforeAuthorComplete),/AUTHOR_ANALYSIS_REQUIRED/);
```
- [ ] 跑 `node --test plugin-src/src/lib/vault/test/reference-analysis.test.mjs`；实现状态 `ai-prepared-hidden → author-writing → comparison-ready → awaiting-decisions → responded`，AI-only走独立直接产物路径，不伪造作者分析。
- [ ] 将AI完整分析保留在同T受控文件、作者分析独立文件；只在作者完成后构造same/author-only/ai-only差异。默认呈现AI独有项完整判断+原文/时间证据，same压缩，author-only保留并用于后续方法候选，不要求用户重复审。
- [ ] 用脱敏T046式案例和真实验收副本验证隐藏→作者写→差异→逐条批→AI逐条回复；纠正仅成候选，不因完成比较自动改个人判断/Skill。中断重开不能提前解盲。
- [ ] 提交 `feat: preserve blind author-first reference analysis`，验收记录包含传输DTO和UI可见性两层，不仅截图。

## Task 9：新选题选择建卡、原列表分区与多起点续接

**Owner / depends:** D业务、B UI；T4/T7。

**Files:** 新 `vault/{topics.mjs,topics.d.mts,test/topics.test.mjs}`；修改 `vault/bridge.mjs/core.mjs` 的当前稿判定；B修改 `content-list.tsx`、新 `renderer/jincheng/topic-board.tsx`、`topic-menu.tsx`；C更新xindao executor接线，不改五个已字节一致方法文件正文。

**接口:** D新增 `startPositioningInterview(root,{scope,previousVersion?})`、`confirmPositioning(root,{interviewId,artifactHash,authorDecision})`、`readPositioningVersion(root,version)`；完整xindao-interview逐关确认，定位版本与来源引用写入库内00定位文件；每个后续任务固定请求记录适用的positioningVersion/hash，局部更新不改旧任务快照，缺定位可按该方法允许范围继续并显式说明。`saveTopicCandidates(root,{sessionId,candidates,sourceRefs})`（最多4，不建T）；`adoptTopic(root,{sessionId,candidateId,expectedHash,authorDecision,mutationId}) → WorkRef`；`resolveCurrentWork(root,work) → {status:'resolved'|'conflict'|'missing',source?,candidates,evidence}`；`answerMetaQuestion(root,{work,number,answer,at,expectedHash})`。

- [ ] 写失败测试：空库逐问定位、局部续访、确认后版本固定，后续选题/写稿/研究使用对应版本且不串用户；候选提交/验收不占T号；用户选择后原子建卡+总览+T目录+导航；重试同mutationId同T，作废号不复用；两个Vault T020隔离：
```js
await saveTopicCandidates(root,menu);
assert.equal(countTopicCards(root),0);
const first=await adoptTopic(root,choice);
assert.deepEqual(await adoptTopic(root,choice),first);
```
- [ ] 跑 `node --test plugin-src/src/lib/vault/test/topics.test.mjs`；实现T分配事务和字段固定七项候选/六项交接，保留未选候选。用户直接明确选题可同请求传authorDecision；不得用最终发布标题代替选题身份。
- [ ] B恢复接下来要做（确认拍摄顺序）、暂缓收起、已经写过置底；类型筛选/搜T/题名；在做含已录未发，已发布按真实事实；“接着写”优先明确current-source与任务证据，T020冲突呈候选和差异，不能按mtime/数组第一项定真源。
- [ ] 按步骤显示对应元问题，提供原有答案/还没到，禁止一次十一问；新想法、已有拆解、已确认叙事、完整稿、只改一句均能起步；课题选择不强制使用教程方法。执行topic probe覆盖空库、46/47不同根、长题名、取消不建卡。
- [ ] 提交 `feat: create selected topics and resume original content positions`。

## Task 10：完整方法包、来源矩阵和独立宿主适配

**Owner / depends:** C；T10a与T1同时冻结完整方法及refs，并作为T7/T8/T9的输入；T10b运行接线依赖T7。任务编号不代表等T9完成才开始。

**Files:** 新 `plugin-src/resources/method-sources.json`、`method-adaptation-contract.md`、`plugin-src/src/lib/method-adapter/{index.mjs,index.d.mts,test/methods.test.mjs}`；修改 `resources/business-skills.json/business-skills-contract.md/production-methods-provenance.md`；完整 `skills/jc-jiaocheng-video`、`jc-video-analysis`、`jc-media-research`、`jc-comment-visualize` 等正式来源+refs，`nova-workbench-writing-method` 对齐已取得创作页协议；修改 `plugin-src/build.mjs/scripts/build.mjs`、`workbench/src/main/assistant-skill.mts/assistant-runtime.mts`。

**接口:** `resolveBusinessMethod({methodId,stage,mode:'workbench-task'|'direct-text',sourceMap,capabilities}) → {instructions,referenceFiles,allowedActions,missingResources,provenance}`。instructions由完整方法+独立adapter组成，不重写为通用摘要；原路径映射仅在adapter resolved refs出现。source matrix记录来源version/hash/每文件来源/适配原因/差异测试/支持状态。只有来源明确允许的method提供direct-text；其allowedActions仅文本输出，不含文件/平台/付费动作。

- [ ] 写失败测试：方法全部references可解析且在包内；教程明确叙事门、先重点段、运营稿首回复来源表与作者样本读取机制存在；未知来源标不支持；xindao五文件hash保持：
```js
const method=resolveBusinessMethod(input);
assert.equal(method.referenceFiles.some(x=>x.name==='evaluation.md'),true);
assert.equal(method.allowedActions.includes('auto-approve-host-permission'),false);
assert.equal(hashFile(xindaoSkill),sourceManifest.xindao.skillHash);
const direct=resolveBusinessMethod({...input,methodId:'xindao-xuanti',mode:'direct-text'});
assert.deepEqual(direct.allowedActions,['text-output']);
```
- [ ] 运行 `node --test plugin-src/src/lib/method-adapter/test/methods.test.mjs plugin-src/tests/business-skills.test.mjs` 确认覆盖缺口先失败。
- [ ] **T10a退出**：按来源包完整保留方法及refs；私人样本不擅自发行，将“锦成口气”机制映射到用户明确关联的同类稿/本人改前改后证据，缺样本提示而不假称已读。`method-adaptation-contract`逐项标“原规则保留/仅路径替换/权限收紧/provider替换/当前缺能力”。修正“未取得creation-page源码”过时声明和全局“无handoff一律回工作台”的误限，保留xindao直接文字模式；先提交 `docs: freeze complete methods and adaptation boundaries` 后才能定流程字段。
- [ ] 接宿主任务明确methodId和stage；host只决定启动/续会话，不改变业务权限。保存last known可靠session引用；缺会话标识走用户可读固定请求和继续入口，不能猜原窗口；不将全文方法塞任务标题。构建后扫描refs完整、绝对旧HOME无可执行默认、退出码与提交回执分离。
- [ ] 提交 `feat: preserve complete business methods behind host adapters`；方法与实现字段映射验收未通过的保留“未支持/待验收”，不是因打包数量升级为支持。

## Task 11：研究/评论机器合同与 Nova 雷达连通

**Owner / depends:** C（research协议）、D（报告落盘/源关系）、B（报告与雷达入口）；T10/T4/T7。

**Files:** 新 `plugin-src/src/lib/research-contract/{index.mjs,index.d.mts,test/contracts.test.mjs}`；修改 `file-library/production-research.mjs/production-reference.mjs`、`skills/nova-content-research-execution`；D把报告落到10_调研报告；B连接已有 `renderer/radar-workspace.tsx`、`production-workspace.tsx` 的accounts/reports与 `research-to-content.tsx`，不新建平行研究页。

**接口:** `validateResearchResult(result,context)` 与 `freezeFindings(findings):{value,sha256}`、`validateCommentReport(report,{frozenHash,sourceComments,ownMaterials})`。研究schema2的content/comments/sources/analysis/questions/baseline/selection；评论schema2 comments/topics/sources/findings/recommendations逐字段映射，不放泛artifact.text掩盖丢字段。

- [ ] 写失败测试：引文不在原评拒绝、重复cid、回复漏覆盖显式缺口、对象findings冻结后个人建议不得改动、个人建议缺本人源、图表分母与报告不一致：
```js
const frozen=freezeFindings(findings);
assert.throws(()=>validateCommentReport(changedFindings,{frozenHash:frozen.sha256,sourceComments,ownMaterials}),/FINDINGS_CHANGED/);
assert.throws(()=>validateCommentReport(noOwnSource,{frozenHash:frozen.sha256,sourceComments,ownMaterials:[]}),/OWN_MATERIAL_REQUIRED/);
```
- [ ] 跑 `node --test plugin-src/src/lib/research-contract/test/contracts.test.mjs`；实现对象分析独立子代理仅获对象数据与方法→冻结hash→主会话加本人建议；用户无采集授权只用已提供评论，不把“回复覆盖门”变成扩大采集许可。
- [ ] 保留完整研究路由、baseline政策、负面证据、长短评深读、每条两层以上回复覆盖与平台/实抓对账、报告/人群/快卡产物及生成校验；本轮预算/权限由固定请求冻结，原默认付费不能覆盖。报告布局按设计标准重建可读reader，不执行原任意脚本。
- [ ] 把已验收研究/雷达候选作为xindao输入或既有T参考；保留来源、排除理由、采用证据、重复检测和评论明确授权。用离线真实授权样本验证完整报告可回指原文，外部连接器按实际可用能力另验，不用合成数据假装真实。
- [ ] 提交 `feat: restore research and comment evidence contracts`；记录 Research相关标准与Acceptance-02，不以报告可打开代替证据校验。

### T11b：素材 intake、转写字幕与规律提取（D业务、C方法、B入口；与T11同阶段）

**Files:** D新 `vault/material-intake.mjs`、声明与 `test/material-intake.test.mjs`；C维护完整 `jc-benchmark-intake`、转写provider adapter、`jc-pattern-extractor`；B复用参考与素材入口。原始资料、转写、字幕、素材卡、规律候选分别保留真实文件和来源关系，均在选定Vault业务目录。

**接口:** `intakeMaterial(root,{selectedSources,expectedHashes,authorSelection,mutationId})`；`submitTranscript(root,{materialId,sourceHash,text,cues,provider,evidence})`；`proposePatterns(root,{materialIds,evidence,methodVersion})`。来源可为链接、原文、媒体或已有资料；缺原片/字幕/转写明确缺口，不能编造已看视频。

- [ ] 先写并运行 `node --test plugin-src/src/lib/vault/test/material-intake.test.mjs`：hash/URL重复、同名不同内容、原件保留、时间码可回指、provider失败可恢复、规律无证据拒绝；已入库素材再次入库不重复下载或覆盖人工卡。
- [ ] 素材入库先确定候选与授权，再执行必要采集/转写；转写付费/平台访问依当前固定请求，不继承源Skill旧授权。字幕与逐字稿分产物，人工校正版本保留；链接不自动意味着已取得视频证据。转写完成可接AI-only或作者先拆，不能绕过盲态。
- [ ] 完整规律提取含标题/开头/正文结构、样本与反例、适用范围、增量补证据；只生成市场规律候选，不能自动提升个人判断或改Skill。验证素材→转写→参考→拆解，以及素材→规律候选两条独立旅程；提交 `feat: restore material transcript and pattern workflows`。

## Task 12：录制、包装选择与封面内核接回同一内容

**Owner / depends:** A publication纯函数，B交互，C包装stage；T6/T7/T10。

**Files:** 新 `creation-document/publication.mjs/test/publication.test.mjs`；B新 `renderer/jincheng/{recording,packaging}.tsx`，接现有 `covers.tsx/publication-panel.tsx`；C修改对应packaging方法/产物契约。

**接口:** `readPackaging(doc)` 保留原 pubslot/pubcand/final 的全部字段并映射可操作候选；`selectPackaging(doc,{slotId,candidateId,expectedHash})` 返回EditGroup/结构事务；`compareRecorded(doc)` 返回录完稿与mine差异，不写回。具体pub*字段先从T1矩阵固定，未知字段不得丢弃。

- [ ] 写先失败测试：T020 2 pubslot/5 pubcand，T044 3/29及3 final保留；包装选择不改mine，旧录完稿非空不等于发布：
```js
const next=selectPackaging(doc,selection);
assert.equal(serializeMine(next),serializeMine(doc));
assert.deepEqual(next.raw.futurePackaging,doc.raw.futurePackaging);
assert.equal(compareRecorded(doc).publicationConfirmed,false);
```
- [ ] 跑 `node --test plugin-src/src/lib/creation-document/test/publication.test.mjs`；先按T1原schema做确定转换，不用空packaging覆盖原final。包装每项保存候选/作者选定/实际发布三层身份。
- [ ] B恢复教程录制清单、visual_type/our_visual、step.prompt/where/line/expect/caution、复制画面脚本/提词稿；后者排除prompt/teleprompter=false段。录完稿比较后作者选择同步，涉及mine仍T3权限与CAS。
- [ ] 用当前确认稿生成标题/封面文字/简介候选；一次出齐不等于一次自动全采用。封面图用Nova模板/人物/候选/批注/下载内核；锁定封面文字不得生成时暗改；实际封面用哪张、平台版本来自发布事实。运行T026/T044 UI副本旅程及已有cover targeted tests，依Cover-01/Image-01/02/03验收。
- [ ] 提交 `feat: reconnect recording and packaging to canonical creations`，封面内核接口改动只由其唯一owner合入，禁止另建封面产线。

## Task 13：真实发布、正式档案、观测和复盘分离

**Owner / depends:** D业务；C发布/复盘方法适配；B状态展示；T4/T7/T12。

**Files:** 新 `vault/{official-archive.mjs,official-archive.d.mts,test/official-archive.test.mjs}`；修改 `file-library/production-archive.mjs/production-vault-archive.mjs` 仅接业务档案引用；B修改 `renderer/publication-panel.tsx/publication-model.ts/production-workspace.tsx`；新 `docs/implementation/official-archive-schema.md`。

**接口:** `readPublicationFacts(root,work)` 返回独立 `{recorded,publication,archive,observations,review}`；`recordPublication(root,{work,platform,url,publishedAt,evidence,expectedRevision})`；`importOfficialArchive(root,{sourceId,videoId,work,expectedHash})`；`writeReview(root,{archiveRef,expectedHash,confirmedArtifactHash,summary,authorDecision})`。新档案使用原schema2语义保留兼容字段；内部额外字段命名空间隔离。

- [ ] 写失败测试：✅/已做/recorded≠published；已发布无档案应published+archive-missing；分析副本不能writeReview；work_id与content_id不同；缺7天不可完成正式复盘：
```js
assert.deepEqual(readPublicationFactsFixture(recordedOnly).publication,{state:'unknown'});
assert.equal(readPublicationFactsFixture(publishedNoArchive).archive.state,'missing');
await assert.rejects(()=>writeReview(root,analysisCopyInput),/OFFICIAL_SOURCE_REQUIRED/);
```
- [ ] 跑 `node --test plugin-src/src/lib/vault/test/official-archive.test.mjs`；实现manifest2：video_id/content_id/work_id、平台post_id/url/published_at、12h/7d target/collected/age/delay、snapshots证据hash、generated_block_sha256、review draft/confirmed/history；不手改程序区，不推测缺指标。
- [ ] 新正式档案写`06_发布复盘/正式发布档案`，旧外源显式关联或导入；采用前列来源/目标/冲突，读取真实标题封面简介冻结版本。人工发布动作仍由用户在平台做，自动发现/采集仅对已验证连接器和本次授权范围开放。
- [ ] 用T044/T047/T030已发未收口形态、已录未发、正式档案缺时点、补采延迟、复盘草稿未看/确认后写入验证；复盘六块+最多三行动候选，不把相关性写因果。删除重建runtime投影后事实从正式档案/决定文件完整恢复。
- [ ] 提交 `feat: distinguish publication archive observations and review`；未接平台采集时明确“手动证据/连接器未接”，不宣称12h/7d自动运行。

## Task 14：知识分权、次级入口与既有能力回归

**Owner / depends:** D知识/资源，B入口，C知识写入授权；T4/T9/T11/T13。

**Files:** 新 `vault/{knowledge.mjs,knowledge.d.mts,test/knowledge.test.mjs}`；修改 `resources.mjs`、既有 `workspace-pages.tsx`（B）、`assistant-settings.tsx`（B）；新 `docs/acceptance/jincheng-equivalence/dependency-capabilities.md`。

**接口:** `proposeKnowledge(root,{work,kind:'market-pattern'|'personal-judgment'|'case',evidence,text})`；`decideKnowledge(root,{candidateId,expectedHash,decision,authorEvidence})`；`readDependencyCapabilities(root)` 返回 `available/unlinked/unreachable/unsupported/unknown` 和真实检查证据，非布尔enabled假可用。

- [ ] 写失败测试：市场候选不能直接变个人判断；案例不能因一条数据好自动永久有效；新增/改范围个人判断需本人明确决定；缺外部服务与空数据不同：
```js
await assert.rejects(()=>decideKnowledge(root,{...candidate,decision:'promote-personal',authorEvidence:null}),/AUTHOR_DECISION_REQUIRED/);
assert.equal(readDependencyFixture({health:'refused',hasFiles:true}).state,'unreachable');
```
- [ ] 跑 `node --test plugin-src/src/lib/vault/test/knowledge.test.mjs`；实现候选/案例/已确认个人判断独立目录、证据与历史，锁稿后待过目清单在同T改稿日志，下一篇再提示，不自动改Skill。
- [ ] B保留今天/任务板、选题/在做/已发布/封面、市场调研的对标/X/报告、提示词、私域、运动入口，Nova雷达为正式市场调研能力。实现能力卡：原SCRM 8787不可达是当前外部依赖缺口；X书签/飞书/运动文件/VI逐一清点，不把未关联当空、不擅自安装服务或重写CRM健身。
- [ ] 提示词保留Nova既有管理能力并对齐原搜索/变量复制/收藏/排序/使用记录；原VI资产显式导入后接现有封面内核；对不在本期支持的外部行为提供准确说明与已授权关联入口。回归雷达真实来源采用/排除、模板学习版本、封面生成/选择/批注、账号与报告关联。
- [ ] 提交 `feat: preserve knowledge ownership and connected workspace capabilities`，记录每入口实际状态及证据，不能只交一张全绿能力表。

## Task 15：双宿主等契约、全旅程与恢复审查

**Owner / depends:** 集成负责人，A/C配合修复各自模块；T1–T14。

**Files:** 新 `workbench/test/jincheng-journey.test.mjs`、`workbench/scripts/jincheng-journey-probe.mjs`、`plugin-src/tests/jincheng-host-contract.test.mjs`；新 `docs/acceptance/jincheng-equivalence/journeys.md`，修改仅修失败owner的文件。

**接口:** CLI/plugin任务固定请求读取仍由现内核处理；新增stage字段验收沿用同receipt链。测试不得绕过正式controller/IPC/worker直接写用户文件。

- [ ] 写业务断言矩阵，分Codex/WorkBuddy两列：成功、waiting-user、waiting-permission各恢复、取消、失败重试、被拒产物修订、原任务继续、切助手、源文件外改冲突、应用重开恢复、原会话不可定位提示。每列都给请求/任务/回执/采用hash证据。
```js
assert.equal(task.status,'accepted'); // 本用例仅验收了叙事候选任务，作者尚未确认。
assert.equal(flow.facts.narrativeConfirmed,false);
assert.equal(afterSwitch.work.vaultId,beforeSwitch.work.vaultId);
assert.equal(afterRestart.pending.mutationId,beforeRestart.pending.mutationId);
```
- [ ] 运行新测试并定位失败，修复只归原owner；协议/安全失败两次无解由Astra重新审设计，不用反复补宽松校验。
- [ ] 实际跑三条旅程：A旧T029意见变更→宿主读回→建议→先改后采纳→重开；B空库完整初始化→xindao-interview逐问确认定位→资料入库/转写→xindao选定→T卡→作者先拆→叙事确认→分段→完整稿→录制/包装→人工发布事实→正式档案→复盘；C旧T020冲突选择+未关联外资源→继续局部工作。用离线授权fixture完成不能外发的步骤，真实平台发布不得被probe执行。
- [ ] 执行受影响全模块测试、`npm run typecheck:desktop`、`npm run build:desktop`、相关插件构建及契约检查；最终综合检查仅在代码冻结后一次，后续只对新改动扩大。实际截图按Foundation/Layout/Controls/Reading/Acceptance规则ID留通过/失败/缺口，记录原件SHA无变化。
- [ ] 提交 `test: verify original workflows across supported assistants`；主持人检查真实diff与旅程证据。一个宿主未过不得宣传两者支持；保留具体能力缺口不伪造已成功。

## Task 16：Mac arm64 冻结版本、最终安装产物与交付

**Owner / depends:** 集成负责人；T15通过，业务缺口已逐项明确。

**Files:** 更新仓库实际版本/插件manifest/build元数据/发行记录；新 `docs/releases/<冻结版本>-darwin-arm64.md` 与 `docs/acceptance/jincheng-equivalence/darwin-arm64.md`（执行时按真实冻结版本建文件，不预填版本号）；不回写已冻结旧包。

- [ ] 确认业务gate结果，冻结源码commit和单一版本；0.4原型仍独立留痕。应用名称「自媒体工作台」，开发/测试有后缀；公司/版权严格按根AGENTS；系统version格式映射记录。
- [ ] 在arm64原生runner构建相符Electron/随包Node/sharp/插件；使用现 `npm run dist:preview --prefix workbench` 或明确批准的目标渠道命令，不能为了快把未验收预览改称生产。核对实际产物架构、依赖负载、插件版本和SHA256。
- [ ] 安装最终产物，在真实macOS GUI核对Finder快速查看/显示简介的名称、图标、版本、公司版权、实际大小/修改时间；核对安装后app与Dock；记录签名/公证实际状态。源码配置不能代替系统界面证据。
- [ ] 用验收副本完成冷启动、打开库、保存重开、升级保全库与设置、退出再开、卸载后用户库仍在；新/旧两个库与两个宿主按已支持范围走关键路径；生成最终截图与哈希索引。
- [ ] 提交 `release: record verified arm64 workflow-equivalent delivery`。交付表分别列 darwin-arm64 已构建/已安装/已原生运行/待项；darwin-x64、win32-x64若无环境填未验收，不用Rosetta或arm64结果代替；win32-arm64本轮未支持。所有未通过业务gate都在交付说明中具体列出，不用“核心完成”隐藏。

## 风险、止损与阶段验收表

| 风险 | 触发证据 | 处理/验证 |
|---|---|---|
| 原字段被扁平化/扩展丢失 | unknown/pub*/ai_state/refnote数量或值变化 | S1前阻断，逐字段对账；不做HTML→MD默认迁移 |
| 原包/installed app/选中Vault版本不同 | T020入口冲突、46/47 T、模板与包装schema不同 | sourceId/vaultId+版本hash隔离，显式当前入口选择；不靠mtime判权威 |
| 并发写覆盖本人稿 | 同字段外改、指纹更改、原建议不再唯一 | CAS拒绝保留草稿；先回读再提建议；禁止模糊替换 |
| 隐藏AI分析泄漏 | author DTO/通知/任务摘要含blind正文 | 可见性在server contract执行，UI隐藏不算安全门 |
| 方法被静默弱化 | 教程确认门丢失、共享13行摘要替代refs | 源规则→字段→操作→测试映射；明确method selection与adapter边界 |
| 外部资源误认真源 | 06分析副本、猜父目录、同号归并 | source authority和明确关联；缺少显示unlinked，不造档案 |
| 任务结束伪装业务完成 | accepted直接改published/approved/reviewed | 分离事实与决定，实际receipt+作者采用+真实平台证据各自验 |
| 隐私/外部操作扩权 | 原Skill写了自动采集/付费/安装/发布 | 固定请求权限上限优先，方法不能扩大授权，provider能力缺口显式显示 |
| 跨平台失败 | 路径、原生模块、系统入口差异 | 使用现平台适配，目标分开测试和产物；未测不报支持 |

每一阶段验收记录包括：业务场景、来源版本、操作、预期、实际、文件hash/回执、截图、规则ID、失败/缺口、审查人。只读源码证据、模拟测试、真实宿主、真实Electron与最终安装包是五种不同等级，不能互相替代。

## 自审覆盖与执行交接

- 原工作流各环节：新库完整骨架T4、定位/新建/渐进问题T9；素材入库/转写字幕/规律候选T11b、研究T10–11；作者先拆T8；叙事/分段T7+T10；创作页首次生成/重生成/结构变更与模板全部功能T2–6；录制包装封面T12；发布档案复盘T13；判断/规律/案例T14。
- 生产化与保留能力：路径/事务/扩展字段T2–4；Nova内核复用T3/T7/T11–13；完整方法包与provider分离T10；原导航/次级依赖T9/T14；双宿主T15；Mac最终安装包T16。
- 用户当前已批准“业务协议+交互等价重建，复用Nova基础”，无需再选择方案或重复确认实施方向。此计划交给主线程按阶段推进；本计划编写不修改产品、不运行原件脚本、不提交Git。执行时提交是每项验证后的独立成果，不将撰写计划本身当成功能完成。
