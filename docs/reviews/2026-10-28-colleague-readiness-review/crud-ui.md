# Nova 第二大脑：CRUD、入口与渲染只读审查

日期：2026-10-28。审查目录：`/Users/mac/code/dashboard/Nova-Content-Hub`。已读根 AGENTS.md 与 `docs/design/内容工作台设计标准.md`。仅写本报告；没有改实现、运行旧库脚本、启动旧服务、修改真实内容库或作外部写入。隔离实验在临时目录创建全新小库，结束后删除。未跑全量测试、构建或原生 UI，主线程负责汇总。

结论：不能宣布“同事打开自己的第二大脑后全部实体 CRUD 和渲染完整”。本次确认 5 项 P2，未确认新的 P1。当前未提交的分页改动在本次选定的 42 项测试中通过，不能据此推定资料回收、外部冲突恢复、关联报告附件和报告生命周期也已通过。

## 范围与原件对照

- 读取了 `docs/research/2026-10-27-jincheng-package-findings.md`、`2026-10-27-second-brain-positioning-findings.md`、`2026-10-28-vault-version-comparison.md`，并按其中明确的来源路径只读查看了 B 的目录样本和 `SOURCE_OF_TRUTH.md`；没有猜测同事业务库路径。
- B 原件路径：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑`。原件导航明示 00 是长期定位、01 是账号与主题研究、02 是原视频/逐字稿/拆解且有未参考/已参考、03 是规律候选与作者确认元问题、04 是分类的选题卡、05 是每 T 原位工作材料、06 是复盘及正式档案分析副本。正式发布真源在外部视频项目；本报告不将分析副本当发布事实。
- 现有 `SECTIONS` 覆盖 00–06；07_如何做自媒体不被错误当提示词目录，另行提供 11_提示词，源映射涵盖报告、方法、判断、官方档案、分析副本、视觉资产等；内部与显式关联目录分开。
- 图片/Obsidian 嵌入渲染缺口已由主线程独立核验，本报告不重复计数或分级。下表标明相关能力不能算完整。

## 实体 CRUD／渲染与入口矩阵

标记：有＝代码入口存在，本次不等同原生验收；部分＝格式、权威或生命周期受限；缺＝可确认没有相应公开 UI/契约。外部来源只读本身是能力边界，不作为缺陷。

| 实体／路径 | C | R／渲染 | U | D／恢复 | UI 入口与当前限制 |
|---|---|---|---|---|---|
| Vault 新建／打开／绑定 | 有 | 有，识别第二大脑或旧 Nova 库 | 切库有 | 解除／删除库不在日常业务操作范围 | 内容库→存储；Vault 根和 `.workbench/runtime` 分离，身份验证与持久 binding；重开换库仅代码/既有测试阅读，未原生操作 |
| 个人定位 00 | 有，手工资料／定位访谈任务 | Markdown 阅读有；定位状态按文件可用推导 | 原文编辑有 CAS，正式访谈须确认 | 普通资料删除有，恢复 UI 缺（F1） | 资料与定位；设置的个人资料表单是另一组 profile 字段，不等价编辑完整原定位 |
| 普通素材 02／文本／规律 03／复盘 06 | 文本新建有；助手入库有 | 列表、Markdown/文本有；二进制在通用编辑器仅只读文本及定位；富媒体不完整 | md/txt/json 可改，HTML 原件通常只读 | 普通资料删除有，恢复 UI 缺（F1） | 资料与定位；搜索名称/原路径/T号，不做全文，UI 如实标示范围 |
| 素材原片、字幕、图片附件 | 内容资料导入有；原位素材靠已选入库流程 | 逐字稿与定位可达；HTML/二进制/图片有各自不同阅读路径；Markdown 嵌入不完整（主线程） | 原件格式受限；普通编辑器不改二进制 | 内容资料是移除关联并保留原文件；原位资料回收见 F1 | 内容→更多→资料与设置；原位参考列表可以定位/复制路径，不等价所有本地媒体都可内播 |
| 对标账号 01／账号墙 | 手工/验收结果加入有 | 账号卡/完整备注/头像/多截图/关联报告有，当前新增分页覆盖末项 | 编辑字段有；显式关联外部账号只读，禁止写回 | 后端 trashAccount/restoreAccount 有，UI 两者缺（F4） | 市场调研→对标账号；可主页/拆解/编辑，未提供账号回收范围 |
| 参考作品／跨内容参考 | 手工、已验收研究及其他内容加入有 | 原文/校正文/拆解、分组、分页有 | 本篇参考编辑/移除并保存有 | 从本篇移除有；不删除共用来源 | 内容创作→参考，来源身份和回执保留；不能把已加入等同已验收 |
| 原始／手工调研报告 | 手工 Markdown、HTML导入、任务回传有 | 报告页沙箱、页序、伴随元数据、明细分页有 | 后端 saveReport 可更新；页面没有既有报告编辑入口（F4） | trashReport 后端有；UI 删除/回收缺，契约无 restoreReport（F4） | 市场调研→调研报告；页面只继续阅读/查看详情；报告搜索只标题（F5） |
| 报告 HTML 附页／md/txt/csv/json 附件 | 随来源组读取 | 内部注册来源有有限导航；显式关联外部来源会丢失有效附件映射（F3） | 原件保留；报告工作副本另管 | 不应独立冒充报告删改 | 继续阅读中的本地链接；不能用页面首屏能打开证明附件齐全 |
| 选题 04 | 推荐候选与人工采用有；通用“新建选题”实际集中生成 T 草稿正文 | 选题目录/卡片/来源/状态/分页有 | 卡片原文及采用状态路径存在，保持 T 号 | 内容回收有，通用资料回收见 F1 | 内容→选题，目录按当前卡片/状态证据；保留 T050 暂缓等独立事实由领域逻辑处理 |
| 稿件 05／内容正文 | 新建内容集中 T 目录有 | 正文/原创作页/当前稿选择/定稿及辅助资料可达 | 正文 CAS、原 HTML 创作适配、工作稿转换、当前稿冲突选择有 | 内容回收/恢复有（bridge 记录映射）；通用资料回收不等价内容回收 | 内容各阶段/原稿；不按 mtime 猜当前稿；具体冲突恢复还存在 F2 |
| 合集／渠道／照片／默认值 | 有 | 搜索分页及完整阅读入口有 | 有、token 冲突校验 | 照片/合集回收恢复，渠道停用恢复有 | 内容库→资料；照片已声明本人和可用性分开；未原生核验末项、焦点等 |
| Nova 模板／版本／样张 | 导入、派生、加版本有 | 整组/详情/原样张与还原图；当前分页覆盖末项 | 选版本/学习候选确认有；不是任意重写原内置模板 | 模板回收/恢复有 | 内容→封面→Nova模板；原VI另有只读来源入口，不自动等同可用生成模板 |
| 封面候选／选用／收藏／构图 | 生成任务有 | 完整图片预览/分页/批注入口存在 | 选用/收藏/批注/构图等有 | 候选操作与模板回收不是同一生命周期 | 当前改动含封面样张/候选分页；本次未验证实际图片设备缩放或生成服务 |
| 提示词 07/11／库内或显式关联 | 手工/导入有 | 搜索/分类/标签/完整预览/填写/复制有 | 库内编辑、启停、收藏有；外部只读有 | 回收/恢复有 | 提示词页；缺失内容上下文阻止误用，原手改保护由资源事务执行 |
| 助手任务／回传产物／知识候选 | 固定请求创建有 | 状态/结果/费用/回执明细有 | 取消/失败/重试/等待/切宿主等契约存在 | 终态保存，不随聊天结束当完成 | 助手任务；`ProductionWorkspace` 的 knowledge 分支并非当前主导航入口，本次不承诺知识候选完整 UI 覆盖；宿主一致性由另一审查覆盖 |

## 确认问题

### F1 · P2 · 普通知识资料删除后没有可用的恢复入口

- 位置：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/vault-workspace.tsx:70`，`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/core.mjs:572`，`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/vault-controller.mts:77`。
- 触发：在资料与定位打开任一可写定位／素材／规律文档，更多操作→确认移入回收区。
- 实际：源文件被移动到 `.workbench/trash/<mutationId>/source`；隐藏目录不再扫描；Vault UI/IPC 只有普通资料 trash，没有普通资料回收列表或恢复操作。内容回收站只能恢复 bridge 在内容操作中记录的 `projection.contents[id].trashMutationId`，不收纳上述普通资料删除。
- 隔离复现：新建 materials 文档后直接执行对应删除，结果 `remainingDocuments=0, contentTrash=0, receiptDirs=1`。字节保留，但用户无法从承诺的知识库回收区找到或恢复；只能离开应用人工查隐藏事务目录。涉及所有通用可写资料，不能以照片/提示词/内容回收站存在替代。

### F2 · P2 · 普通资料的外部手改冲突无法在保留草稿的编辑器内收敛

- 位置：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/shared/vault-editor-recovery.ts:13`，`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/vault-controller.mts:70`，`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/vault-workspace.tsx:36`。
- 触发：打开可写 Markdown，用户在本页输入；其他程序修改原文件；本页保存收到 CONFLICT；点击顶层“确认未提交后放弃修改”清除 pending，再继续保存本地输入。
- 实际：discard 回执的 current=null；reconcile 保留旧 current/hash，且将 conflict 设为 false，未获取最新原件。编辑器的“载入当前原文”只在 conflict=true 时显示，本路径不可到达。下一次保存继续提交旧 hash，再次 CONFLICT。原件未被覆盖、本地输入仍保留是正确的保护，但没有比较/合并/重读同时保留本地输入的闭环。
- 隔离复现：`first=CONFLICT, discardConflictFlag=false, hashRefreshed=false, second=CONFLICT, keptInput=本人编辑`。用户必须先另处复制草稿再关闭重开，才能退出循环。

### F3 · P2 · 显式关联外部调研目录的合法本地附件不能打开

- 位置：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/report-navigation.mts:59`（catalogFor 同类限制在 :38）。
- 触发：用户通过关联原调研报告目录选择自己的目录；报告 meta 指定 HTML 页，HTML 相对链接到同组存在的 `data.csv`（同理 md/txt/json、跨页链接）。
- 实际：资源投影支持 linked 来源，报告能出现在列表并打开；registeredReportPage 却拒绝所有 mode!==internal 的来源，navigation 无有效 pageIdentity，所有本地链接 target=null，提示“引用未提供或原注册页面已变化”。这不是未授权路径：目录已被用户显式绑定、文件也在该绑定目录中。
- 隔离复现：全新 Vault + 独立外部报告目录（meta.json、sample/index.html、sample/data.csv），`reportFound=true, pageCount=1, pageIdentity=null, links=[{href:data.csv,target:null}]`。本次没有放宽边界或写真实来源。

### F4 · P2 · 账号与报告的管理生命周期没有接到 UI

- 位置：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/production-workspace.tsx:114`、`:149`、`:166`、`:167`；后端能力对照：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/shared/production-validation.ts:14`，`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/file-library/production.mjs:254`、`:255`、`:292`。
- 触发：同事误建/重复添加一个账号，或已保存一份报告后需要改标题/分类/关联账号/正文，或移走过时报告。
- 实际：账号只渲染主页/拆解/编辑，没有移入回收或恢复；报告只渲染继续阅读/查看详情，新建表单没有 id，无法进入已有报告编辑；无删除/恢复范围。后端已有账号 trash/restore、报告 save/trash，但所有 renderer 搜索不到 trashAccount/restoreAccount/trashReport 调用；报告契约甚至没有 restoreReport。所有列表固定排除 deletedAt，故已有被回收记录也无 UI 可达。
- 限定：外部只读来源禁止原位写是正确边界；本问题同样发生于用户手工创建的库内账号/报告，不能用外部来源只读解释。原始通用资料编辑器也不等价有结构化报告管理 UI，且导入 HTML 的修改需要 companion/受控页语义。

### F5 · P2 · 报告搜索承诺正文却只查标题

- 位置：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/production-workspace.tsx:121`；控件声明在 :165。
- 触发：在调研报告页搜索只存在于报告正文、原始证据或账号关联中的关键词，标题不含该词。
- 实际：公共输入 aria-label 是“搜索标题、账号或正文”，reports 分支仅 matching(report.title)。有效报告会被过滤掉，全文内容在报告页/元数据中确实保留却无法按 UI 宣称的范围检索。当前分页测试只证明标题集合先过滤后分页，并未覆盖正文命中。

## 未提交 diff 与本次验证

本次直接审查当前工作区，非只查 HEAD 或历史验收。已看 renderer 分页相关 diff：账号/报告/任务、详情参考/文件、模板样张/导入、照片/个人字段、封面及跨内容引用。新增 `use-paged-items.ts` 和 `paged-items.tsx` 使用过滤后的全量集合切页；默认20，可20/50/100切换；resetKey 变更回首页；删除末页会夹取合法页；嵌套 compact 仅在默认容量内省略控件。没有发现本次测试覆盖场景中末项丢失或修改错对象。

运行命令：

```text
node --test workbench/test/use-paged-items.test.mjs workbench/test/jincheng-detail-pagination.test.mjs workbench/test/production-pagination.test.mjs workbench/test/image-collection-pagination.test.mjs
```

结果：42 passed / 0 failed，约1秒测试运行时间。覆盖零/一/多页、查询/筛选重置、20→50→100→20、末项删除夹页、截图删除身份、报告末页 id、任务动作身份、草稿跨页保留。另运行上述3项真实隔离模块实验（F1/F2/F3），复现输出记录于各问题。最初一次实验误用不存在的 listContentTrash API，随后改用真实 `listTrash` 完整重跑成功；不计作实现失败。

最终检查关键文件 SHA256（主线程若修改后须重新确认行号/结论）：

```text
production-workspace.tsx cd32de7ffffe8af299ccd01c64b8d59e5afac90fa386480c8ab0adb802eada39
vault-workspace.tsx 37498bbe867dfe9fc78f07586a05d57dc8abfd58de78b94ebfb76d1a760ef508
vault-editor-recovery.ts a41171da7d854d2ce32e183725b9b6e8e477a55b0d9f7578675b93887c8864f2
report-navigation.mts 8e3ef0a9627c58fba3324d320decb26e35152bbf0da585e0c8181f16c4346f8e
```

## 设计规则适用验收记录

| 规则 ID | 适用场景 | 本次结果 |
|---|---|---|
| Foundation-01/02/03/04 | 列表、表单、状态、弹层文字 | 仅阅读共享组件及页面引用；未截图、未算合成背景对比、未 Windows 字体核验，视觉未验 |
| Layout-01/02、Surface-01/02 | 外壳、账号/报告页头、卡片 | 入口和结构存在；本次无窗口尺寸/参考图对照，未验 |
| Surface-03 | 编辑器、账号/报告弹层的焦点、关闭、未保存 | ManagementDialog/ProductionDialog 与 managed draft guard 存在；F2 表明冲突恢复不完整；Tab/Esc/焦点返回未原生验 |
| Controls-01 | 危险语义和动作可达 | 已有普通删除确认，但F1恢复不可达；F4结构化删除/恢复动作缺失；点击区域与键盘未验 |
| Controls-02 | 数据型 Select 搜索及过滤分页 | 账号/报告等数据型选择有 searchable；本次42项分页通过；F5搜索范围不符；所有选择器未逐个原生检查 |
| Controls-03 | 状态/统计来源 | 列表读取真实行与状态，未发现分页改写总量；真实库状态一致性由领域审查补足 |
| Image-01/02 | 账号头像/截图、模板样张、封面 | 共用预览组件，末图与原始序号在测试可达；实际图片完整显示、缩放手势、OS差异未验；Markdown嵌入缺口由主线程记录 |
| Template-01/02/03/04 | 模板整组、版本、详情、学习 | 当前分页测试全组末项可达，不等价真实50张视觉/焦点验收；模板来源事实/候选验收保留 |
| Cover-01 | 生成表单和选择保留 | 分页测试验证样张选择跨页保留；1280×860/960×680首屏、生成流程未验 |
| Reading-01/02 | 定位、个人资料、长文、多图、附件 | 原文与表单可读；F1/F2生命周期不完整，F3关联附件不可读；长文本溢出/末图真实窗口未验 |
| Reading-03 | 提示词搜索、填写、阅读复制 | 入口与回收恢复存在；未原生逐项跑复制与脏保护 |
| Interaction-01/02/03 | 忙碌、动效、业务边界 | 本次只读未改业务；系统减少运动与事件清理未验 |
| Acceptance-01 | 当前代码静态／行为 | 42项针对分页测试通过，3项隔离实验复现缺陷；未跑全量、类型检查、构建 |
| Acceptance-02 | 各真实页面、窄窗、空/大库、键盘 | 本子任务未采新截图，无视觉通过声明 |
| Acceptance-03 | Electron/浏览器/最终包/各架构 | 本次均未验；Mac arm64历史记录不能替代x64/Windows或当前源码最终包 |

## 仍需的验收证据

1. 在可丢弃复制库通过真实Electron逐实体完成C/R/U/D/恢复，包含普通资料恢复、报告既有记录管理、原位Markdown外部手改的完整收敛。不能只检查没有覆盖原文件。
2. 重新打开和切库后核对所有实体、关联、分页选中、待核验意图；本次仅读相应绑定与libraryEpoch代码，未做原生重启试验。
3. 外部关联账号/报告/提示词的不可用→恢复、目录身份替换、合法相对附件、缺失附件分别验证；内部来源与linked来源不能共用一个成功结论。
4. 原件中多种HTML协议、富媒体/Obsidian嵌入、PDF、>8MiB媒体都需明确“可读/仅定位/待支持”能力并在UI呈现；当前通用扫描对普通文件有8MiB上限与2万条（含遍历条目）上限，不能承诺任意大库无损展示。
5. 原生Mac arm64、Intel Mac、Windows x64分别完成安装运行/系统展示和输入设备验收；本子任务没有作任何跨平台通过声明。

## 可重跑复现命令（无独立脚本文件）

以下即本次运行的模块级实验，可在仓库根目录用Node24执行；只创建并删除临时库，不接受真实库路径。遵守子任务“只写报告文件”，未另留.js脚本，复现源保存在本报告这一节。

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createVault,readVaultSnapshot,createVaultDocument,trashVaultDocument,saveVaultDocument} from './plugin-src/src/lib/vault/index.mjs';
import {linkSource} from './plugin-src/src/lib/vault/source-map.mjs';
import {openLibrary} from './plugin-src/src/lib/file-library/index.mjs';
import {reconcileVaultEditor} from './workbench/src/shared/vault-editor-recovery.ts';
import {reportNavigation} from './workbench/src/main/report-navigation.mts';
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'nova-crud-review-'));
try {
 const root=path.join(parent,'vault'); fs.mkdirSync(root);
 const binding=createVault(root),runtime=binding.root;
 const made=createVaultDocument(runtime,{section:'materials',title:'测试资料',text:'原文'},{mutationId:randomUUID()});
 trashVaultDocument(runtime,{id:made.document.id,expectedHash:made.document.hash},{mutationId:randomUUID()});
 console.log({case:'F1',remainingDocuments:readVaultSnapshot(runtime).documents.filter(d=>d.id===made.document.id).length,contentTrash:openLibrary(runtime).listTrash().length,receiptDirs:fs.readdirSync(path.join(root,'.workbench/trash')).length});
 const other=createVaultDocument(runtime,{section:'materials',title:'冲突资料',text:'基准'},{mutationId:randomUUID()});
 fs.writeFileSync(path.join(root,other.document.relativePath),'外部更新');
 const submission={method:'saveVaultDocument',input:{id:other.document.id,expectedHash:other.document.hash,text:'本人编辑'}};
 let first; try {saveVaultDocument(runtime,submission.input,{mutationId:randomUUID()});} catch(e) {first=e.code;}
 const recovered=reconcileVaultEditor({current:other,text:'本人编辑',title:'',category:'materials',submission},{...submission,mutationId:randomUUID(),outcome:'discarded',result:null,current:null});
 let second; try {saveVaultDocument(runtime,{id:recovered.current.document.id,expectedHash:recovered.current.document.hash,text:recovered.text},{mutationId:randomUUID()});} catch(e) {second=e.code;}
 console.log({case:'F2',first,discardConflictFlag:recovered.conflict,hashRefreshed:recovered.current.document.hash!==other.document.hash,second,keptInput:recovered.text});
 const external=path.join(parent,'external'); fs.mkdirSync(path.join(external,'sample'),{recursive:true});
 fs.writeFileSync(path.join(external,'sample','meta.json'),JSON.stringify({title:'关联报告',pages:[{file:'index.html',title:'首页'}]}));
 fs.writeFileSync(path.join(external,'sample','index.html'),'<html><body><a href="data.csv">完整数据</a></body></html>');
 fs.writeFileSync(path.join(external,'sample','data.csv'),'name,value\nhello,1');
 linkSource(root,{role:'reports',selectedRoot:external,authority:'candidate',writable:false});
 const api=openLibrary(runtime),reports=api.readProduction().reports,report=reports.find(r=>r.title==='关联报告');
 const html=api.readAsset(report.pages[0].assetHash).data.toString('utf8');
 console.log({case:'F3',reportFound:!!report,...reportNavigation(binding,reports,report.id,report.pages[0].id,html)});
} finally {fs.rmSync(parent,{recursive:true,force:true});}
NODE
```
