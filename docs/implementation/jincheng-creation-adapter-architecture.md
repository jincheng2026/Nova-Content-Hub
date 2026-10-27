# 原创作 HTML：模板与保存适配的最小架构

日期：2026-10-28。供下一步 Sol 实施；本次只读原实现与 Nova 源码，只新增本设计文件，未执行原程序。用户最新要求为：**保留原创作 HTML 的生成，以及原 HTML UI 的功能分区与协作行为**。因此不再另用 React 重画一套近似创作页；外层工作台继续 Semi/React，内层使用冻结、核验后的原 shell/style/app 与显式适配的 kit。

## 1. 收敛决定

本轮采用 **受信模板生成 + opaque sandbox iframe + 限定 MessagePort RPC + 主进程持久暂存**。旧文件只读取 `jc-doc`，绝不载入它原有的 HTML 外壳、script、事件属性或远端依赖。展示 HTML 由随包受信模板重新组成；原位保存只更新原文件中的 JSON 数据块。新建则生成完整单文件 HTML，保留原三段模板标记和 `jc-doc`。

**只把 kit 的 fetch 换成 postMessage 不可交付。** 原 kit 依赖 IndexedDB、sessionStorage、页面重载、跨标签广播／锁；app 还把未提交批注放在 sessionStorage。这些必须在同一个纵切完成持久替代，否则会恢复成“页面能操作、重开丢修改”。

本地 loopback 服务对原 HTTP 调用更接近，但不是自动更可靠：随机端口改变 IndexedDB origin，重开可能看不到旧暂存；固定端口有占用问题；原 IDB 名只用 pageId，跨库同号会碰撞；HTTP 同源页面还扩大保存 API 的暴露面。既然事务与跨库边界仍须改接 Node 内核，优先复用现有 Electron IPC，不另造常驻服务。

若以后明确要求在 Chrome 独立打开并继续编辑，再把同一业务 API 暴露为独立、受限 loopback adapter；不让本轮 iframe 先承担外部浏览器支持。单文件 HTML 在应用外可读取完整页面，未建立正式保存通道时必须锁住编辑并准确提示；不得自动尝试原作者的 `127.0.0.1:8977`。

## 2. 已核对的原接口与真实语义

以下 **C** 为 `/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/creation-page/`。

| 原接口／依赖 | 真实请求与响应 | 来源 |
| --- | --- | --- |
| `POST /save` | `{page_id,token,self_path?,changes:[{change_id,item_id,field,before,after,item_fp,group?}]}`；返回 `{results,base_fingerprint,fingerprint,path}` | `C/kit/kit.js:429–448`；`C/server/brain_save.py:339–400,841–858` |
| 单条保存结果 | `{change_id,status:'ok',reason:'written'|'already'}`，或 `status:'conflict'`，reason 为 `item_gone/item_changed/field_gone/changed/group_conflict`，可含 `current/item_fp/group` | `brain_save.py:259–299` |
| 分组 | 同 group 全成或全不成；无冲突的其他组仍可提交。逐组判定需迭代到稳定，不能把整个请求粗暴变成全拒绝 | `brain_save.py:277–299` |
| 字段比较 | before/after 比较做原 `norm`；item 指纹排除 `locked.ai_state`，SHA256 前 12 位。文档 fingerprint 是文件 bytes SHA256，不能与 item 指纹混用 | `brain_save.py:74,103–121,259–268` |
| `GET /p/:pageId/meta` | `{fingerprint,path,same_file?}`；404 缺失、409 同号多文件。每 3 秒或回前台查询；变更时先提交暂存，再在安全空闲点重载 | `kit.js:549–584`；`brain_save.py:756–772` |
| `GET /p/:pageId/doc` | `{fingerprint,path,doc}`；原 doc 内含 token | `brain_save.py:776–779` |
| `GET /p/:pageId/changes?item=…` | `{changes:[{time,change_id,item,field,before,after,origin,group?}]}`，时间正序 | `kit.js:898–902`；`brain_save.py:302–336,773–775` |
| `GET /healthz` | 服务／版本／feature／root／writable／duplicates／模板可用性；主要用于 file 模式探测，不是保存成功证据 | `kit.js:565–580`；`brain_save.py:734–750` |
| 暂存 | IDB `jc-stash-${pageId}`，store `changes`，key=`itemId|field`；记录 before/after/item_fp/change_id/group/created/updated/conflict；故障会降为内存 | `kit.js:175–243,313–324,854–869` |
| 回执后清暂存 | 只删除对应 change_id；提交期间又改过同格时，保留新 after，并推进 before。缺单条结果不能清暂存 | `kit.js:451–486` |
| app ↔ kit | `edit/subscribe/doc/value/fileValue/isRegistered/itemFp/request/changes/info/status/state/setDescriber`；`edit` 成功只表示进入暂存并安排保存，不表示文件已写 | `kit.js:346–389,892–910` |
| 画面与原片 | `localHref()` 把原 `refs.video` 相对路径和 time 转成 `/f/` URL；原服务支持媒体 Range | `C/template/app.js:641–655`；`brain_save.py:785–839` |
| 未提交批注 | app 的 sessionStorage 不只是 UI 偏好：含选区与尚未按“保存”的批注文字 | `app.js:177–180,1719–1726` |
| 原模板 | `shell.html` 含 `#app`、唯一 `script#jc-doc`、`jc-style/jc-kit/jc-app:start/end`；依次 kit、app | `C/template/shell.html:8–28` |

原服务 `serve_page()` 在受信模板缺失时退回文件内嵌脚本（`brain_save.py:434–466`）。**Nova 不采用这一降级**：包内模板校验失败即只读并给错误，不能执行库内旧脚本。这属于宿主安全适配，不删减业务步骤。

## 3. 最小代码切分与不可省略的适配点

1. `creation-document/`：负责 parse、生成、重生成、字段／结构事务、历史、指纹。只此处写真实文件；复用现有 Vault journal。新增 HTML 生成不能再拖到 UI 最后补。
2. `creation-template/`：冻结来源的 `shell.html/style.css/app.js/kit.js` 与来源 hash；保留原 app 的 DOM、功能分区、快捷键、建议／参考／通读／录制／包装逻辑。只在明确环境接点打小补丁；不向 payload 执行 `eval` 或接受调用者传脚本。
3. `creation-frame-controller`：主进程签发短期 frameSession，绑定 `vaultId/rootIdentity/sourceId/documentId/pageId/templateVersion`，派生作者 UI 身份；负责 read/save/stash/media/history 的有限分发。
4. `CreationFrame`：React 仅承载 iframe、生命周期和消息转发；不镜像正文，不新增第二套编辑器。Electron 保持 sandbox/contextIsolation、无 Node；iframe 为 `sandbox="allow-scripts"`，不给 same-origin、顶层导航、表单或通用 popup。

必须适配的接点：

- **kit `req()`**：将已枚举的旧 GET/POST 路由映射为 RPC 动作。不是通用 URL 代理；任何其他 URL/method/pageId 都拒绝。返回仍为 `{ok,status,data}`，使原冲突 UI 和回执消费继续工作。
- **kit store**：把 `openIdb/robustStore` 替换为有 durable ack 的 native stash adapter，保持 all/modify 的调用语义；详见下一节。宿主模式禁止静默退回内存再显示可恢复。
- **kit mode/reload/peers**：新增明确 `desktop` mode，行为走原 http 的指纹分支；`maybeReload` 请求父级重建受信 HTML，不能 `location.reload()` 空白 srcdoc；原 goServed 禁用。主进程串行提交并向同页 session 发失效通知，替代 BroadcastChannel/Web Locks。
- **app/kit local/session storage**：通过 bootstrap 注入已恢复的 scoped snapshot；同步读内存镜像，写入排队持久化。必须包括未提交批注、撤销重做所依赖的 session 内容、选区/焦点；业务草稿持久 ack 前不让父级关闭／换库。字号等纯偏好可另存，不冒充业务已保存。
- **原片／外链／复制**：保留原按钮与位置，点击交受控操作。通过 itemId + ref index 在主进程从当前 doc 重新解析链接／相对媒体位置；允许合法 `..` 但最终目标只能位于已授权 source roots，拒绝链接逃逸。媒体用已有受控资源通道/有界 Range 服务，不能把大视频全量经 postMessage 发送。剪贴板走固定 copy action，未知协议链接拒绝。

只修改这些平台接点不能宣称无需回归原 UI；重点验收建议裁决、反馈、复制、原片跳转、键盘与恢复。

**kit 可直接保留的主体**：原指纹／规范化算法、base/fps/value/currentDoc、字段注册与锁定、中文输入事件与防抖、stash record 形状、冲突卡及“换回我的／用文件里的”、change_id 对账和保留提交期间新输入、状态条、subscribe 事件、给 app 的 jcKit 公共 API。改动范围集中在 req/store/init、edit 的原子暂存批次、mode/reload/peer、storage/clipboard；不要重写整份 kit。`applyResults` 的业务规则保留，但其落 stash 操作必须使用新批次事务。

## 4. 暂存、并发和恢复

暂存落 `.workbench/creation-pending/`，键绑定库身份、source、document、pageId；不能仅按 pageId。内容必须纳入备份／恢复说明，它是未提交业务输入，不是随时可删的缓存。

原 kit 的 `store.modify(key,fn)` 不能把 JS closure 传主进程执行。适配器在 iframe 内按已读版本计算新 record，向主进程提交 CAS patch；主进程返回最新 stashVersion，冲突时回读后重算。每个 frame 本地串行队列，主进程再按文档序列化；后台通知只推进已确认基线，不覆盖另一窗口脏输入。

**多格 `jcKit.edit` 的暂存也要整体持久化。** 原代码用多次 modify + Promise.all（kit:374–380）；新 adapter 为这一操作加 `modifyBatch`，把 mine/decision/proposed 以及 group 重绑同一批写入，ack 后才算“已暂存”。否则进程在两格之间退出，会留下半组并在恢复时错误补写。

建议使用一份带 revision 的有界 stash journal（沿用现有持久写原语），包含待提交 records、冲突、未提交批注与必要会话恢复信息。成功写原件后凭 change_id 对账清除；新输入已有不同 change_id 时只推进其 before。提交已落盘但响应丢失，重试同 mutationId 返回原回执；源值已等于 after 的 `already` 继续保留原语义。

关闭／切库先请求 frame 结束输入、排空 stash 队列并确认持久 ack；失败阻止丢弃并提供复制／明确放弃。renderer 崩溃后从最后已确认暂存恢复，未获 ack 的最后击键不得宣称已保全。写源失败、权限拒绝、断连均保留持久草稿；“已暂存”“已写回”“冲突”分别显示。

原 `.jc-changes/:pageId.jsonl` 和 `.jc-versions/` 不能因换 kit 消失：读历史兼容原记录，新变化按相同语义保留。由事务 journal 协调文件写回与日志登记，恢复时按 change_id 去重；日志故障不能回报全部完成却静默缺记录。

## 5. 给实现者的公共接口

以下为提案，不是现有已实现 API。沿用计划中的 WorkRef/SourceRef/CreationDocument；JS 与声明同批提交。

```ts
type FrameSession = {id:string;epoch:number;pageId:string;templateVersion:string};
type KitChange = {change_id:string;item_id:string;field:string;before:string;
  after:string;item_fp:string;group?:string};
type KitResult = {change_id:string;status:'ok'|'conflict';reason:string;
  current?:string;item_fp?:string;group?:string};
type KitSaveResult = {results:KitResult[];base_fingerprint:string;
  fingerprint:string;path:string};

// 主进程从已打开库和 source mapping 取路径；禁止 iframe 提供 root/path/actor。
openCreationFrame(source:SourceRef):Promise<{session:FrameSession;html:string}>;
closeCreationFrame(sessionId:string):Promise<void>; // 先核验 durable stash
readFrameMeta(sessionId:string):Promise<{fingerprint:string;path:string}>;
readFrameDoc(sessionId:string):Promise<{fingerprint:string;path:string;doc:unknown}>;
saveFrameChanges(sessionId:string,input:{mutationId:string;changes:KitChange[]}):Promise<KitSaveResult>;
readFrameChanges(sessionId:string,itemId?:string):Promise<{changes:unknown[]}>;
readFrameStash(sessionId:string):Promise<{version:string;records:unknown[];uiDrafts:unknown}>;
patchFrameStash(sessionId:string,input:{operationId:string;expectedVersion:string;
  put:unknown[];remove:{key:string;expectedChangeId:string}[];uiDrafts?:unknown}):Promise<{version:string}>;
openFrameReference(sessionId:string,input:{itemId:string;refIndex:number}):Promise<void>;
copyFrameText(sessionId:string,text:string):Promise<void>;

// 明确补齐空库→首篇与后续结构修改，不能只有旧页字段编辑。
createCreationHtml(work:WorkRef,input:{draftArtifactId:string;expectedArtifactHash:string;
  methodId:string;data:unknown;mutationId:string}):Promise<SourceRef>;
regenerateCreationHtml(source:SourceRef,input:{expectedRevision:string;data:unknown;
  removalDecisionId?:string;mutationId:string}):Promise<{revision:string}>;
```

`unknown` 只表示这里未重复原完整 schema，实施必须用已冻结 schema 严格验证，不能转成任意 JSON 写权限。主进程不接受 iframe 的 `actor:'author'`；frame capability 只能写允许的作者 fields。助手走既有 task/claim/allowedActions 通道，新增建议、reply、locked/结构动作与作者采用分别授权，不能拿 frameSession 伪装作者。

MessagePort 在已知 iframe 创建时一次转移，首次握手校验 `event.source===iframe.contentWindow` 和 session nonce；opaque origin 的 `"null"` 本身不提供身份认证。后续只接受持有该 port 的请求，带 requestId/session epoch；换库、导航、销毁即撤销 port/capability。父 React 仅桥接白名单，主进程再核对当前库绑定、source 身份、epoch、大小与限流。

CSP 禁外联、object/base/form、外部脚本；脚本仅受信模板与适配器 nonce/hash。不得将原用户字段拼成 HTML/JS。frame 内任意打开链接都必须被阻断或交明确动作处理。媒体通道只读授权资产，不复刻原 `/f/` 的任意文件服务。

## 6. HTML 生成与原文件保护

- 新页面由冻结 shell 填 TITLE（HTML escape）、DOC（安全 JSON，escape `<`）、STYLE/KIT/APP（受信资源及正确结束标签转义），保留原标记；参照 `C/build_page.py:494–566`。
- 初次生成必须通过方法对应的第一完整稿／叙事确认等门，创建 pageId/token/item ID 并检验库内重复身份；不得先铺一个空框架冒充原完整创作页。
- 重新生成沿用 pageId/token 和原 item ID，保留用户 fields、ai_state、未知字段，新增建议按保留下来的 mine 校验；遗漏有用户内容的条目默认拒绝，必须有具体删除决定。参照 `build_page.py:635–690` 与原 schema 的重生成合同。
- 展示安全 HTML 与磁盘原件是不同字节流：展示采用受信 shell，原文件写回保持 JSON 块之外字节不变；不得为了 CSP/宿主配置改写用户原 HTML 外壳。动态 session/nonce 不进入真实 jc-doc。
- 外部打开生成文件无宿主时只读，完整布局可读且无假保存成功；如要支持 Chrome 编辑，单列下一节能力，不私接旧服务。

## 7. 若改选 loopback，最小约束与成本

现有 `workbench/src/main/production-pages.mts:22–48` 已有进程内 `127.0.0.1:0`、随机 capability 和库绑定；但它的 CSP `frame-ancestors 'none'`、跨站拒绝、generic creation/body 协议不是本页可直接复用的服务。可以复用生命周期／授权思路，不复用旧正文写入合同。

loopback 适合“必须外部浏览器使用原 HTTP 模式”的版本：受信模板专用 origin、随机 capability 路径、严格 Host/Origin/Fetch Metadata、无 CORS 通配、仅枚举 API、无目录列表、每次请求重新核对库身份。嵌入模式若用 `allow-scripts allow-same-origin`，必须确认该 origin 与父工作台不同且只服务受信模板，任何原 HTML 都不能在保存 API 同源执行。

即便使用 loopback，仍需 durable native stash 及跨库键空间；不能依赖随机端口下的浏览器 IDB 自动恢复。原 `localHref` 的 localhost `/f/`、token、meta、自重载和跨窗行为也要适配。**因此它减少的是 req/reload 的替换，不会免去存储和权限工作；本轮不并行做两种 transport。**

## 8. 最小放行纵切

先完成 T029 旧页与一条新建合成完整稿：同一套受信原模板打开 → 原分区完整 → 修改 mine/note → 多格采纳 → 持久暂存 → 写回 → 重开 → AI 改 locked 引发正确冲突。再覆盖 T020/T026/T044 的已有裁决、回复、录完稿和包装。

必须注入：stash ack 前后退出、文件 rename 后回执前退出、提交期间再次输入、同组一格冲突、两窗口同格修改、原文件被移走／同号多份、换库同 pageId、未提交批注重开、模板损坏、伪造 RPC/session、旧文件恶意脚本完全不执行、媒体合法 `..` 和越界拒绝。对照/通读/录制/包装分区和按钮以原冻结 app.js 的真实行为验收；截图不能代替保存和历史对账。

Sol 实施顺序：①冻结原模板与最小桥接接点；②reader/store/生成器与 kit 兼容结果；③durable stash＋frame；④上述真实纵切；⑤再接后续阶段协议。首轮不继续重画 `compare.tsx/reading.tsx` 与原模板平行的第二 UI。
