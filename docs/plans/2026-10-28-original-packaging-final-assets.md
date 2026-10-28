# Original Packaging and Final Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本轮已由主线程指定 Sol 实施；不重新请求执行方式确认。

**Goal:** 将原 `jc-doc` 已采用包装安全接入现有封面固定请求，并让作者在发布前把最终逐字稿、标题、简介和选定封面保存、读回、导出到同一 T 知识目录。

**Architecture:** 原 HTML 继续是可编辑包装的唯一真源，新增同步只读快照与后端版本校验，不镜像到通用 `productionState`。最终资产是作者明确保存的不可变版本包，加一个 CAS 当前指针；正文来源、包装来源、图片来源分别记录。复用 Vault 根身份、事务、恢复和既有封面候选验收，不增加发布状态机或助手启动协议。

**Tech Stack:** 现有 Node ESM 业务模块、Electron 主进程/worker/有限 IPC、TypeScript DTO、React/Semi UI、Node test。

**Spec:** 正式合同 `docs/implementation/2026-10-28-final-workbench-delivery-contract.md` 的 D1、C1/C3/C4/C5、A08/A09；背景为 `docs/research/2026-10-28-jincheng-redframe-alignment.md`、`docs/research/2026-10-28-jincheng-redframe-source-audit.md`、`docs/research/2026-10-28-colleague-student-delivery-gaps.md`；根 `AGENTS.md` 与 `docs/design/内容工作台设计标准.md`。本计划基线为 `1253c64`；后续实现以真实 diff 收敛，不重复已完成 P0/P1/四方法工作。D2–D6 另由主线程推进，不作为本计划编码的前置条件。

## Global Constraints

- 本轮终点为“保留最终逐字稿、标题、简介、封面”；不要求录完、发布链接或 `published_at`，不生成虚假录制/发布事实。
- 原页逐格保存、手改、批注和来源选择保持现有职责；本功能不重写冻结 Kit、原模板或 `jc-doc`。
- 通用非 Vault 封面仍兼容原 schema 1/2 与原 `productionState` 校验；原页路径不能静默退回通用旧值。
- 任务提交不等于作者采用；只有本次明确保存及已有图片选用事实能进入最终资产。
- 不执行旧业务脚本，不读取上游 secret，不新增采集/生图服务权限，不默认采用锦成本人人脸，不改助手跳转。
- Codex、WorkBuddy 使用相同固定请求和进度/等待/恢复/终态契约；不把对话结束视为成功。
- “后续给学员使用”按分发与空库首次使用验收，保留现有 production/required 门禁，不新建付费权益系统。
- 当前计划仅覆盖源码实施与专项验收。打包、安装、平台架构和公司信息验收另依根 `AGENTS.md`，不能由本轮源码测试代替。

## 1. 已核实接缝与复用点

| 位置 | 现状与实施含义 |
|---|---|
| `workbench/src/renderer/covers.tsx`，`readProductionCreation` / `selectedCoverText` | 从通用包装取封面字，没有原页 `pubslot.fields.final` 来源身份。需要显示原页只读快照并提交 token。 |
| `plugin-src/src/lib/file-library/cover-jobs.mjs`，`normalizeRequest` | 显式 `coverText` 必须等于通用已选封面字；只改 renderer 必然遇到 `STALE_INPUT`。 |
| 同文件 `fresh`、`preparedRequest`、`requestPackage` | freshness 目前以 `meta.title` 和 runtime `bodyHash` 判断，request 只接受 schema 1/2。需统一 source-aware 分支，保留旧分支。 |
| `workbench/src/main/cover-worker.mts`，`handoffContext` | 另有直接比较 `context.content.title/body` 的检查；必须与业务层统一，否则创建后仍无法启动。 |
| `creation-document/parse.mjs`、`store.mjs` | 严格解析单一 `jc-doc`、原 HTML revision、`orderedSegments`、`assertUniqueCreationPage` 可复用。只解析，不执行 HTML。 |
| `vault/core.mjs` | `contentSources` / `resolveCurrentSource` 已有明确当前来源、冲突处理、同 T 目录；`withVaultReadLock` 同步且可在本调用栈复用。 |
| `vault/core.mjs`、`working-draft.mjs` | 稳定 mutationId、pending journal、CAS、根身份、恢复已有。新增独立 action，不能调用会更换当前稿的 `createWorkingDraft`。 |
| `publication-runtime/transaction.mjs` | 可参考“全部目标先校验、逐项 CAS、提交回执”的模式；该模块每文件限制 8 MiB，且业务含义为发布，不能直接用于大封面/未发布保存。 |
| `file-library/model-v5.mjs` | `selectedCover` 是当前人工选用；候选 `accepted` 会累积，不能把所有 accepted 当最终图。 |
| `file-library/production-vault-archive.mjs` | 助手候选已按 T 归档，但引用 runtime 图片不构成自包含最终资产；最终封面必须复制实际字节。 |

## 2. 真源与版本规则

### 2.1 包装和稿件独立取源

1. 包装只读 `kind === 'pubslot'` 且 `locked.slot` 精确等于 `标题`、`封面文字`、`简介` 的 `fields.final`。返回键统一为 `title`、`coverText`、`description`。不从候选 decision、备注、topic 标题或 HTML 可见文本猜采用结果。
2. 当前来源为有效 jc-doc 时优先该页；当前来源为 MD/TXT 时返回同 T 的有效包装页候选，由作者明确选择，即使只有一份也不暗选。显式 `documentId` 只能选择同 T 的已索引有效 jc-doc；不改变 `currentSource`。不得按 mtime 选择。
3. 缺少或重复 slot、重复 pageId、当前来源冲突、原件损坏/失联都要有有限状态。已确定走原页时，不能回退旧通用包装或默默使用空值。
4. 稿件跟随既有明确当前来源：MD/TXT 保留文件原字节对应 UTF-8 文本；jc-doc 用有序 `segment.fields.mine`。保留每段精确值与 itemId，在输出中以 `\n\n` 连接，不 trim、重写或丢弃空段；顺序缺失/重复而无法唯一解释时阻止最终保存。`locked.teleprompter:false` 只是展示属性，不默认丢弃作者正文。
5. “录完稿”是独立来源：只有作者显式选择 `recorded`，才读取该页唯一 info 的非空 `fields.recorded`，记录 info itemId。非空 recorded 不自动替代 current；最终保存不填 recorded、不切 approved、不确认拍摄。
6. 原文值与可用性校验分离：hash 基于精确 UTF-8 值；判断缺失可用 `trim().length===0`，不把 trim 后的内容写入请求或资产。

### 2.2 两个快照模块的约定

只读模块已由 `reference_groups` 的 Sol 单独负责。下面对齐已落盘的声明；共享 IPC 直接 import/re-export 类型，不再手写第二份。字段统一 `description`，稿件身份统一 `script.manuscriptSource`。

```ts
// creation-document/packaging.mjs：无 IO、无业务写入
extractCreationPackaging(doc: CreationDocument): {fields: PackagingFields; issues: string[]}

// vault/packaging.mjs：同步安全读取，不返回 Promise
readVaultPackaging(runtimeRoot: string,
  input: {contentId: string; documentId?: string}): VaultPackaging

type PackagingField = {itemId: string; value: string; hash: string};
type PackagingFields = {title: PackagingField | null; coverText: PackagingField | null; description: PackagingField | null};
type PackagingSource = {
  vaultId: string; workId: string; documentId: string;
  pageId: string | null; revision: string;
};
type PackagingScript = {text: string; hash: string; manuscriptSource:
  PackagingSource & {relativePath: string; format: 'html'|'markdown'|'text'}};
type PackagingCandidate = {documentId: string; relativePath: string; pageId: string; revision: string; issues: string[]};
type EmptyPackaging = {source: null; selectionToken: null; fields: null; issues: string[]};
type VaultPackaging = {contentId: string | null} & (
  | {kind: 'jc-doc'; source: PackagingSource & {pageId: string};
     fields: PackagingFields; script: PackagingScript; selectionToken: string; issues: string[]}
  | (EmptyPackaging & {kind: 'legacy'; script: PackagingScript | null})
  | (EmptyPackaging & {kind: 'choose-source'; script: PackagingScript; candidates: PackagingCandidate[]})
  | (EmptyPackaging & {kind: 'unavailable'; script: null}));
```

相对路径仅用于已验证来源展示；渲染端提交不接受 path/root。最终资产的 `ManuscriptSource` 在 B 模块由该身份补充为带 kind 的联合：`current-document` 保存 documentId/relativePath/revision/textHash；`jc-doc-segments` 保存 documentId/pageId/revision/textHash/有序 itemId 与每段 hash。这些附加信息在同一次同步 prepare 中按已验证 revision 从原页获取，不要求 A0 改变已确定 DTO。

`selectionToken` 用版本化 canonical payload 的 SHA256：format/schema、contentId、vaultId/workId、当前稿来源身份、包装页身份及 revision、三个 slot 的 itemId/hash、script hash。字段使用固定顺序对象或现有稳定序列化工具，不靠无序 Map。不同 T、切当前稿、包装改字、页 revision 变化均失效。根路径/inode 不放进可携带业务身份；每次 IO 单独校验当前绑定的物理根身份。

同步实现采用 `withVaultReadLock` + 只读 `scan` + 安全 `readBytes` + `parseCreationHtml` + 已导出的 `assertUniqueCreationPage`；不可在同步锁里 await `readCreationDocument`（它虽内部主要同步，声明为 async），也不调用会触发 recover/投影写的 `readVaultSnapshot` 来伪装纯读。

`withVaultReadLock` 本身不代表恢复已完成。A0须验证 pending-index 迁移标记及有界 active pending 目录，未迁移或有未决 Vault/creation 写入时返回 unavailable，不回放、不无界扫描历史回执。读前后比较标记与当前稿索引等身份。若后续提取共享 `readVaultPendingState(runtimeRoot): {state:'clear'|'pending'|'unverified'; mutationIds:string[]}`，只能由 B/core 唯一负责人实现，读取有限活动索引并限制返回条目数，不在 A0 引入并行 core 改写。最终资产首次 prepare 在 runMutation 的既有恢复之后、stagePending 之前读取活源；回放只读冻结收据，不重新调用 packaging，所以不会被自己的 pending 永久拒绝。禁止暴露 renderer 可传的 ignorePending 开关。

## 3. 独立可先交付：source-aware 封面请求

### 3.1 IPC 和固定请求

```ts
readCoverPackaging(input: {contentId: string; documentId?: string}): VaultPackaging

// 新增到既有 CoverInput；与原 coverText 互斥
packagingSource?: {
  documentId: string; pageId: string; revision: string; selectionToken: string;
};
```

renderer 对 jc-doc 只提交 `packagingSource`，不提交任意 title/description/coverText。后端每次重新读取，验证同 T、token 和必需字段，再构建 schema 3 请求：

```ts
{
  format: 'nova-cover-request', schemaVersion: 3,
  // 既有 requestId/protocol/libraryId/contentId/template/style/photo 等保留
  title: snapshot.fields.title.value,
  coverText: snapshot.fields.coverText.value,
  description: snapshot.fields.description?.value ?? '',
  bodyHash: snapshot.script.hash,
  packagingSource: {
    ...snapshot.source, selectionToken: snapshot.selectionToken,
    slots: {title: {itemId, hash}, coverText: {itemId, hash}, description: null /* 或同形 */},
    manuscriptSource: snapshot.script.manuscriptSource
  }
}
```

`正文.md` 写 `snapshot.script.text` 的精确 UTF-8 字节；不写 runtime HTML 摘要。description 缺失可不挡单独出封面，但读回必须显示缺项，最终资产保存要求完整。title/coverText 缺失或歧义阻止生成。

新增字段全部纳入既有 inputHash/requestHash；schema 3 明确允许现有 exact / ratio-minimum 两种尺寸策略。schema 1/2 按原语义、原校验和原字节继续读回，不迁移旧请求。指纹保留原字段，加可选 `packagingSource` 身份供同一 freshness 函数使用；旧精确键校验器同步调整，禁止未知键。

### 3.2 不能遗漏的后端路径

统一一个内部 source-aware 解析/比较入口，返回 `{title,bodyBytes,coverText,description,packagingSource}`，不让 renderer、CLI、worker 各拼一份规则。

- `inspectCoverInput`、`createCoverRequest` 两次解析之间 token 变化拒绝；已有 stable pending 保留。
- `findCoverRequest`、`preparedRequest`、`fresh`、createAttempt、claim、commit、refine/retry/host-change 使用同一来源规则；原页已变不能继续冻结旧输入为新任务。
- `requestPackage`、恢复/校验回调承认 schema 3 并校验其自洽 hash；离线读历史包不要求活源还存在。
- `cover-worker` 的 `handoffContext` 删除独立 meta.title/body 假设，改调用统一业务层“此固定请求现在仍可启动”检查。历史已完成结果展示与当前可启动状态分开。
- 任务手动改字或换根、同页复制导致 pageId 重复、显式来源不属于同 T，都拒绝且保留本次模板/照片/比例选择。
- source-aware 顶层调用统一先取得 Vault 同步读锁，再进入 runtime lock；在 index/bridge 组合处接入可信 resolver。不得在持有 runtime lock 的新增路径中再反向争用 Vault 锁，不在任何同步锁内 await。锁冲突继续使用现有 NOT_READY/重试，不等待死锁。
- 回放已提交 mutation 返回原结果，不根据今天的原页重算曾经成功的请求；新尝试才做 freshness。既有固定请求恢复协议不改变。

### 3.3 CoverPanel

原页分支显示只读“已采用标题 / 封面文字”，来源页与版本可查看，description 在折叠详情显示。编辑仍回原页保存，开始制作前 await 已有 managed flush，再读取新快照。不要新增第二套包装编辑表单。

遵守 Cover-01 基础项/首屏限制；本需求明确将原页分支的标题改为“原页真源只读展示”，这是该条“绑定原内容草稿”的具体实现；旧通用分支原编辑行为保留。冲突或未保存时不能生成；失败不重置模板/比例/照片。长文本按 Reading-02 完整展开。

## 4. 最终资产包：保存、读回与导出

### 4.1 原位文件与 manifest

目录由后端 `contentSources().contentDirectory` 解析，限定同 T；不使用 renderer 自传文件名，不覆盖用户原有 `定稿.md` 或 `创作过程.json`。

```text
05_内容草稿/Txxx_题名/
  最终资产/
    当前.json
    版本/<bundleId>/
      manifest.json
      逐字稿.md
      标题.txt
      简介.txt
      封面文字.txt
      封面.png                 # 按已验证 MIME 使用 png/jpg/webp/gif
      来源.json
      交接说明.md
```

`bundleId` 在一次 mutation 中确定，稳定重试不换 ID。新版本不覆盖旧版本；目录名不带标题自由文本。文本文件存精确快照文本，稿件为 UTF-8；来源段落和 recorded 选择放 `来源.json`，不掺入逐字稿正文。

```ts
type FinalManifest = {
  format: 'nova-final-assets'; schemaVersion: 1; bundleId: string;
  work: {vaultId: string; workId: string}; contentIdAtSave: string;
  adoptedAt: string;
  adoption: {kind: 'author-save'; mutationId: string; previewToken: string};
  packaging: PackagingSource & {pageId: string; selectionToken: string; slots: Record<string, {itemId: string; hash: string}>};
  manuscript: ManuscriptSource | {kind: 'recorded'; documentId: string; pageId: string;
    revision: string; infoItemId: string; hash: string};
  cover: {candidateId: string; assetHash: string; selectedAt: string;
    provenance: CoverProvenance; sourceMatch: 'current'|'different'|'unknown'};
  files: Array<{role: 'script'|'title'|'description'|'coverText'|'cover'|'sources'|'readme';
    name: string; sha256: string; bytes: number; mime: string}>;
};
type CurrentFinalAssets = {
  format: 'nova-final-assets-current'; schemaVersion: 1;
  work: {vaultId: string; workId: string}; bundleId: string;
  manifestHash: string; mutationId: string; adoptedAt: string;
};
```

manifest 不包含自身 hash；当前指针 hash 指向 manifest，manifest hashes 指向所有资产；只允许固定相对名称，不允许路径穿越、绝对路径、外链、symlink/hardlink 或额外可执行内容。

`CoverProvenance` 是明确联合：`generated` 含 requestId/requestHash/attemptId/receiptHash/template 与原请求包装身份；`imported` 含既有导入记录身份/原名/assetHash；缺历史来源时用 `legacy` 并明确 `unknown`，不能编造请求证据。严格使用 `selectedCover.candidateId`，重新核实候选归属、未删除、实际图片 hash/格式/解码验收和来源回执。被接受过但当前未选的图不自动入包。

旧图与今天包装不同不是伪造同源的理由：预览明确提示“这张选定封面来自另一版/来源未记录”，要求本次保存 DTO 携带对应 warning codes 的显式接受集合；拒绝未经预览确认的新 warning。保留原 cover 来源，不改写为本次包装。此决定允许作者保留仍可用旧图，不强制再次调用模型；hash 变化的图片或失效候选绝不允许确认绕过。

### 4.2 API 责任

新增 `plugin-src/src/lib/final-assets/index.mjs`、`transaction.mjs` 和声明文件，作为单一业务写入入口：

```ts
readFinalAssets(runtimeRoot, {contentId, bundleId?}): FinalAssetsView;
previewFinalAssets(runtimeRoot, {
  contentId, packagingDocumentId?: string,
  manuscript: {kind: 'current'} | {kind: 'recorded', documentId: string}
}): FinalAssetsPreview;
saveFinalAssets(runtimeRoot, {
  contentId, packagingDocumentId?: string,
  manuscript: {kind: 'current'} | {kind: 'recorded', documentId: string},
  expectedPreviewToken: string, expectedCurrentHash: string | null,
  acknowledgedWarnings: string[]
}, {mutationId: string}): FinalAssetsView;
readFinalAssetExport(runtimeRoot, {contentId, bundleId, manifestHash}): VerifiedBundle;
applyFinalAssetsReceipt(vaultRoot, receipt): FinalAssetsView;
```

这些业务 API 同步，依赖以业务模块内部或可信 h 参数注入，不能把资产字节/path 从 renderer 传入。`FinalAssetsPreview` 返回精确的四项文本、图片已验证展示信息、各来源、warnings、`previewToken`、`currentHash`。token 包含 schema、绑定 vaultId/workId、包装 selectionToken、稿件 kind/hash、完整 selectedCover 身份/图片 hash/来源 hash、当前指针 hash 和 warning codes。`FinalAssetsView` 返回 current/bundles、具体资产内容或安全资源句柄、源是否已变化、recovery issue；读取已有版本不依赖活源仍存在。

file-library 增加可信只读 `readSelectedCoverSnapshot(contentId)`：在 runtime lock 中读取当前选用与回执/asset，返回复制后的完整字节和有限来源；初次预览与 save prepare 均重新核对。以既有 `readCoverState`、`requestPackage`、候选图片安全读取/解码校验为基础，别通过活动 attempt 限制误拒绝已提交图片。图片消失、跨内容候选、被删除导入引用、回执 hash 不符均失败。

Electron 增加有限 `readFinalAssets`、`previewFinalAssets`、`saveFinalAssets`、`exportFinalAssets` IPC，输入与上文一致；`mutationId` 由主进程首次创建并持久化，不由每次点击重建。导出 IPC 只有 `{contentId,bundleId,manifestHash}`，目标目录由主进程原生对话框选择，renderer 不提供路径。导出只复制已验证清单到一个新目录，完整后 rename 可见；已有同名目录不覆盖；取消为无操作；失败保留来源且不声称导出成功。首次实现导出文件夹即可，不加 ZIP 依赖。

复用 `VaultController.mutate/dispatch/recoverVaultMutation` 的持久 pending 机制，扩展 `VaultPending`/result 联合为 `saveFinalAssets`；精确检查方法、根绑定、参数、恢复结果。若已存在其他未决操作，保留 noPending 行为。导出用只读校验和 native 文件选择，不冒充 Vault 业务写入。

### 4.3 事务与恢复

1. `saveFinalAssets` 调用 `runMutation`，action=`final-assets`。进入其 Vault 根锁后才解析 live 包装/稿件、读取已选封面，比较 preview token 和 currentHash；runtime 图片锁只用于同步复制快照，不跨 await。序列是 Vault→runtime，回放不再读取 runtime。
2. 新 bundle 所有目标的 beforeHash 必须为 null（重放允许精确 afterHash）；指针 beforeHash 是请求指定值。封面/文本/来源/说明先写，manifest 后写，当前指针最后写；提交回执在全部完成后记录。
3. 收据包含自包含冻结字节，恢复不重新采样今天正文/图片。第一次写入前所有目标 CAS 预检，每个实际写入仍立即 CAS；中途外部改动保留已写不可变文件和待恢复记录，不覆盖冲突目标、不把半包当 current。
4. 在 `core.applyReceiptUnlocked` 路由新 action；`recoverVaultUnlocked` 将该 action 的 CONFLICT 收敛为明确恢复 issue，避免一项资产冲突封锁整个资料库。稳定 mutationId+不同 requestHash 拒绝；已提交重试只返回原 bundle，不覆盖之后的新 current。
5. 根替换/跨库重放拒绝；rootIdentity 由现有绑定与 pending 根身份验证，业务 `vaultId/workId` 再校验。正常备份/迁移仍使用已有显式入口，不以 inode 写进 portable manifest 来禁止正常携带。
6. 大图不能套普通 `readBytes` 的 8 MiB 规则：新增 final-assets 内部受限 reader，复用 safe 路径/no-follow/单 hardlink/fd 前后 identity-size-hash 检查，封面上限与既有导入一致为 64 MiB；全部 raw 文件合计 ≤80 MiB，最终 JSON receipt ≤120 MiB，低于现有 journal 的128 MiB上限。文本/manifest 单文件≤8 MiB。超限在 stagePending 前拒绝，输入仍保留。
7. 新大图仅在目标缺失时 `atomic(..., expectedHash:null)`；恢复遇已存在图片用新 bounded reader 比较完整 hash，精确匹配则跳过。不得扩大所有 Vault 文件读取上限或用不带 CAS 的覆盖写绕过限制。
8. current 指针必须最后发布，读路径验证 manifest 和每个资产完整性；pending 状态先走恢复，冲突提示保留上个完整版本入口。索引重建保留 mutation journals；可携带目录在既有显式重开/迁移绑定后凭原位指针/manifest/hash 读回，不要求 `.workbench/runtime` 中图片还存在。

### 4.4 防止资产快照抢占当前稿

在 core 的文档分类/来源推断增加“托管最终资产”边界：固定 `最终资产/版本/<bundleId>/` 路径和有效 format/schema/work manifest 一致时，清单中的文件只作为已采用资产，不进入 bodyDocs、sourceEvidence 的自动当前声明、recorded/published 推断或 currentWorkingDraft。完整损坏包及同一路径下不明文件标为待核验辅助文件，不自动提升为当前稿。

保留所有文件的可发现/定位能力；大图片按 manifest 元数据分类，不让通用8 MiB文本扫描产生误导错误。用户在既有显式“选择当前来源”中选择包内稿件仍可按原选择契约处理，但本次保存和重建绝不自动选择它。避免只改文件名 regex：README 中稿件链接、无原件时 `docs[0]` fallback、topic卡当前入口证据、重新索引等路径都要测试。原件丢失时显示缺失，不拿最终资产替代。

## 5. 文件唯一写入责任

| 批次/负责人 | 创建/修改文件 | 边界 |
|---|---|---|
| A0：已派快照 Sol | `creation-document/packaging.mjs`、`packaging.d.mts`、对应 `test/packaging.test.mjs`；`vault/packaging.mjs`、`packaging.d.mts`、`test/packaging.test.mjs` | 仅新只读模块/测试，不改 core、IPC 或 cover-jobs。 |
| A1：同一 Sol 接续封面 | `file-library/cover-jobs.mjs`、`index.mjs`/声明、必要 `vault/bridge.mjs`；`workbench/src/shared/cover-contracts.ts`、`cover-validation.ts`；`main/covers.mts`、`cover-worker.mts`；`renderer/covers.tsx` | 完成 source-aware 全路径；A0模块修正仍由该负责人写。 |
| B：最终资产后端唯一负责人 | 新 `final-assets/index.mjs`、`transaction.mjs`、相应 `.d.mts` 与 `test/final-assets.test.mjs`；`vault/core.mjs`、`index.mjs`/声明、相关来源分类测试 | 只消费 A0，独占 core 新 action/恢复/分类。`file-library` 选用快照 helper 等 A1收敛后由同人串行改，避免共享锁/导出冲突。 |
| C：主线程指定的串行集成负责人 | 新 `shared/final-assets-contracts.ts`、`final-assets-validation.ts`；现有 `shared/contracts.ts`、`validation.ts`、`vault-contracts.ts`；`main/vault-controller.mts`、`vault-worker.mts`、`controller.mts`、worker路由；`preload/index.cts` 和 IPC注册表 | A1与B完成后统一接 DTO/持久 pending/IPC，不允许多代理同时写这些共享文件。 |
| C：同一集成负责人 | 新 `renderer/final-assets.tsx`；`renderer/jincheng-work-detail.tsx`、其样式；必要 `app.tsx` 接入；对应 workbench 测试 | 一个紧凑保存与交接区，复用已有flush/图片查看器/按钮，不创建新大工作流。 |

计划不要求改全局 source-map 默认值；主线程另一个独立修复只处理新库 bookmarks 默认，不与本计划共写 core。

## 6. 实施步骤与专项门禁

### Task 1：只读包装快照（A0，可独立收敛）

**Files:** 第5节 A0 文件。**Consumes:** parse/store/core 的既有读 API。**Produces:** 第2节两函数和声明。

- [ ] 先在两层专项中加入同页 slots、MD当前稿+HTML包装、重复slot/pageId、跨T选择和来源冲突案例。核心断言示例：

```js
assert.equal(snapshot.fields.coverText.value, '原页采用的封面字');
assert.equal(snapshot.script.text, currentMarkdownBytes.toString('utf8'));
assert.notEqual(afterEdit.selectionToken, snapshot.selectionToken);
assert.deepEqual(readOriginalBytes(), beforeOriginalBytes);
```

- [ ] 执行 `node --test plugin-src/src/lib/creation-document/test/packaging.test.mjs plugin-src/src/lib/vault/test/packaging.test.mjs`，记录功能新增前的具体失败。
- [ ] 实现同步只读模块：`withVaultReadLock(root, () => parseAndResolve())`；无通用包装写入；已选原页无法读取返回 unavailable，不返回 legacy。
- [ ] 重跑上述专项，检查完整同T来源和 UTF-8/hash 行为；仅提交 A0 文件，checkpoint message `feat: read original-page packaging snapshots`。

### Task 2：固定封面请求贯通（A1）

**Files:** 第5节 A1 文件；测试扩展 `file-library/test/cover-jobs.test.mjs`，新增 `file-library/test/cover-original-packaging.test.mjs`、`workbench/test/cover-original-packaging.test.mjs`。**Consumes:** `readVaultPackaging`。**Produces:** `readCoverPackaging` 与 source-aware schema3完整闭环。

- [ ] 新增“原页标题与 topic/meta.title 不同”的红例，覆盖 create→读取正文包→handoff→claim→commit；不调用真实模型，提交固定合法图 fixture。

```js
assert.equal(fixed.request.schemaVersion, 3);
assert.equal(fixed.request.title, originalTitle);
assert.equal(fixed.request.coverText, originalCoverText);
assert.equal(fixed.request.description, originalDescription);
assert.deepEqual(fixed.bodyBytes, Buffer.from(snapshot.script.text));
assert.equal(readHandoff().request.requestHash, fixed.request.requestHash);
```

- [ ] 执行新增两份专项，确认当前代码失败于缺少 source 接口/原meta freshness，记录证据。
- [ ] 实现第3节唯一 resolver/锁边界/schema3；调用形态为 `withSourceLock(() => existingCoverOperation())`，normalize 与 fresh 都使用同一 trusted source reader；新增IPC仅返回有限 DTO。
- [ ] 增加旧schema1/2回读、不同T拒绝、原页改字后inspect/create/claim/commit分别拒绝、stable retry不换请求、换助手仍同requestHash、恢复根替换拒绝专项；执行 `node --test plugin-src/src/lib/file-library/test/cover-jobs.test.mjs plugin-src/src/lib/file-library/test/cover-original-packaging.test.mjs` 及工作台新测试。
- [ ] 检查 CoverPanel 保留模板选择、只读字段与flush顺序；提交封面slice checkpoint `feat: freeze cover requests from original packaging`。

### Task 3：最终资产事务与可重建读回（B）

**Files:** 第5节 B 文件；`file-library` selected-cover helper 串行接入；新 `final-assets/test/final-assets.test.mjs`，扩展 `vault/test/current-source.test.mjs`、`pending-index.test.mjs`。**Consumes:** 第2节源读取和已选封面快照。**Produces:** 第4节五个API与独立action。

- [ ] 写初次保存、改源后保存新版本、同mutation重试、错误token/currentHash、无封面/封面损坏/跨T、未发布未录完案例。关键断言：

```js
assert.deepEqual(readFile(bundle.cover), selectedRasterBytes);
assert.equal(saved.manifest.manuscript.hash, preview.manuscript.hash);
assert.equal(readWorkflow().recorded, before.recorded);
assert.equal(readWorkflow().published, before.published);
assert.deepEqual(currentSourceAfterSave(), currentSourceBeforeSave());
assert.equal(retrySameMutation().bundleId, saved.bundleId);
```

- [ ] 执行 `node --test plugin-src/src/lib/final-assets/test/final-assets.test.mjs`，确认接口/文件包尚缺导致失败。
- [ ] 实现 `runMutation(runtimeRoot,{action:'final-assets',input},options,prepare)`，prepare在锁内比较token并生成有限writes；apply先全部CAS验证再顺序提交，current最后，收据持久化完成才返回。
- [ ] 加入故障注入：stagePending后、部分文本后、图片后、manifest后、current后、commit后断电；每点重开/重试都得到同bundle或明确冲突，绝不覆盖外部编辑；同mutation不同input必须拒绝。
- [ ] 加入 8 MiB以上合法图、64 MiB边界、总量/receipt超限、symlink/hardlink/路径穿越、根换inode、未决回执索引重建、已提交回执不覆盖后来版本测试。
- [ ] 加入删除runtime投影/图片缓存后原位读回、无原稿时只显示已保存版本、包内README/逐字稿不触发自动current、显式选包内稿按原契约生效测试；重跑 `final-assets`、`current-source`、`pending-index` 与受影响 Vault 专项。
- [ ] 提交后端checkpoint `feat: persist adopted final assets in the content vault`。

### Task 4：桌面保存与导出（C）

**Files:** 第5节 C 文件；新增 `workbench/test/final-assets.test.mjs`、`final-assets-desktop.test.mjs`。**Consumes:** 业务层只读预览/保存/导出API。**Produces:** 原内容详情内“最终资产”区和原生导出入口。

- [ ] 写持久 pending/重启恢复/切库拦截/导出取消测试。先预览再保存的控制路径：

```ts
await flush();
const preview = await invoke('previewFinalAssets', selection);
// 作者审阅后点击保存；只提交身份、token和已明确接受的warnings。
await invoke('saveFinalAssets', {
  ...selection, expectedPreviewToken: preview.previewToken,
  expectedCurrentHash: preview.currentHash, acknowledgedWarnings
});
```

- [ ] 执行新专项，记录缺失路由/状态恢复的失败；实现有限validator、preload/IPC/worker/controller，复用持久Vault pending而非组件内仅存mutationId。
- [ ] UI展示稿件来源（当前稿/明确选择的录完稿）、标题/简介/封面字、完整封面、已采用版本与差异提示；提供保存新版本、读历史版本、导出该版本和定位目录。无数据时给回到原页/制作封面的现有入口，不强制新建任务。
- [ ] 保存失败保留来源选择/警告确认及当前预览，成功后刷新current；原页还有未ACK输入时先flush，flush失败禁止快照并保留原输入。导出只针对已保存版本，活源变化不改变导出的旧版本。
- [ ] 执行新专项、相关IPC schema/类型检查和必要构建；共享任务完成后集中构建一次。提交checkpoint `feat: expose final asset save and export in work detail`。

## 7. 真实 UI 验收与完成标准

不在本计划编写阶段执行。实施冻结后，由主线程指定一位执行者在隔离测试知识库完成，绑定源码SHA与实际app版本。正式 D1/A08 要求 T044 真实副本及一条新内容分别走包装→实际制图→选图→最终资产→独立重开；固定图片 fixture 测试只关闭模拟回归，不能关闭实际制图证据。已有已授权条件不足时留 A08 真实制图缺口，继续其余 D1 开发。

- [ ] 原页编辑标题/封面字/简介并保持输入焦点，点击制作封面；核对原文件、只读预览与固定 request/正文文件精确一致。外部改原页后，旧预览禁止生成并保留选择。Cover-01、Surface-03、Reading-02。
- [ ] 用现有验收过的封面候选选用，不提供发布URL、不填录完稿，保存最终资产。关闭应用重开后四项一致；详情仍接回原当前稿；原 approved/recorded/publication文件未改变。
- [ ] 改原页一字并保存新版本；旧bundle不变，当前切到新版本；选历史版本导出后逐个hash核验；旧图来源差异提示可见且仅明确接受后保存。
- [ ] MD为当前稿、HTML为包装页时，封面正文及最终逐字稿仍取MD。两份包装页要求明确选择；重复pageId/来源冲突不猜测。
- [ ] 故障恢复UI展示未决状态、同一mutation重试和根身份不匹配；不能新开保存掩盖未决写入；失败时保留预览与原编辑输入。
- [ ] 在保持Vault原位文件与journals的前提下重建runtime索引，currentSource前后相同，最终资产读回/导出仍正确；新空库无包时没有错误占位和虚假“已完成”。
- [ ] 按正式合同 A14 增加1440级窗口，另在1280×860与960×680核对按钮可达、完整长简介、图片contain及原图查看；焦点/Esc/内层关闭归位符合Surface-03；Image-01/02、Layout-02、Controls-01/02留证据。既有图片查看器复用，不再写一套缩放。
- [ ] source-aware封面任务分别验证Codex/WorkBuddy的成功、waiting-user、waiting-permission、恢复、失败/取消/提交、原任务继续与切助手；本次只变输入来源，仍不可拿一宿主通过代替另一个。
- [ ] 验收记录明确实际OS/架构、源码构建/安装状态；macOS x64、Windows x64/ARM未执行时写待验收。0.5.1包/安装/系统信息展示仍单独冻结验收。

## 8. 取舍与本轮不扩展项

- 选择只读原页快照与后端冻结，不引入双写镜像；代价是原页编辑后需要刷新token，换来明确唯一真源。
- 选择同T命名空间版本包，不覆盖原有根目录稿件；资产文件自包含可携带，保存动作不抢当前编辑来源。
- 选择已选图片独立保留真实来源，旧图差异须明确接受；不要求为保存再调用生图模型。
- 选择独立Vault事务action并复用现有恢复，不把最终资产改称“发布归档”，也不创建通用工作流框架。
- 本轮原页路径为最终资产首个正式入口；旧通用非Vault内容封面兼容保留，但不伪造其同T原位存储。若无已绑定Vault，同T最终保存入口明确不可用并引导已有绑定入口。
- 不增加剪辑/字幕/监测/付费服务、权益系统或全局安装；原已存在发布/录完历史继续可读。

## 9. 计划自检

- 覆盖：原页三项包装→固定封面请求；未发布四资产保存/读回/导出；采用版本/来源；CAS/重试/根身份/重建；原当前稿不变；助手契约不变。
- 所有新写入均指定唯一负责人；A0可独立实施，A1接续，B只读消费A0，涉及file-library共享helper和C集成串行。
- 本文件是实施计划，不是已实现、测试已通过、已打包或已安装的声明。
