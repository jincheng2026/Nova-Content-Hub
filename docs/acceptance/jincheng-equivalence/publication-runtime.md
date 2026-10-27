# 发布、复盘与知识运行链验收记录

记录日期：2026-10-28。源码工作分支：`codex/second-brain-workbench-rebuild`。本记录是 targeted 源码与离线 fixture 证据，不是最终包/真实平台采集或 Electron 视觉验收。

## 已接运行链

- 同 T 目录中的 `正式发布档案.json` 与 `发布收口.md` 指向本库 `06_发布复盘/正式发布档案/<video_id>`。真实发布 URL/时间、采用标题/简介/封面标识及完整定稿/hash 由作者桌面入口确认；录完不等于发布，已有原卡已发布但缺档案仍保持已发布。
- schema_version=2 的 video_id/content_id/work_id 分离，内容.md 程序区 hash、manifest、snapshots.jsonl 和原始证据均由同一既有 Vault write-ahead journal/CAS 协议落盘。重试沿用 mutationId，恢复只接受原版本或计划后字节。外改不覆盖。
- 显式关联或导入的 official-archives 原 schema2 登记单、原完整内容.md、snapshot 字段和未知扩展只读呈现，不改历史包装；analysis-copy 不参与正式写回。
- 手工真实证据随时可导入；记录原时点 target_at、实际 collected_at/age_hours、delay_reason 和 raw_evidence_sha256，未知指标为 null，不补零。
- 本地 observer 每分钟及宿主主动 tick 检查到期项。作者明确启用后仅允许已确认抖音作品 ID 的 12h/7d 各 1 REQ TikHub video 只读调用；reserve 在实际调用前持久化。未配置/未授权不消耗唯一机会；失败/unknown 不自动重试付费；实际晚采保留延迟。native collector 与生产 claim/费用 broker 的宿主装配由主线程负责独立验证。
- 自动采集成功结果先作为真实收集证据独立持久化，再处理正式快照；内容程序区冲突不会丢掉已付费得到的原始响应与服务回执。
- 复盘六块按原方法固定顺序：已确认的事实、会上说过的、初步观察、可能的原因（附对照）、还不能判断、下一篇怎么调。12h/7d 证据和对照 source/hash/quote 均核对。候选只进 manifest.review.draft 与专用候选证据；作者准确版本确认并选择一条行动或明确本次不选后，正式写内容.md，状态采用原 schema2 的 reviewed，备份旧 manifest/内容.md 与 review-history。确认时再核对 snapshot ID 与对照 hash，过期候选拒绝。
- 知识先建议、后作者采纳/拒绝，市场写法候选、个人判断、案例分别入明确根内源目录，同 T 待过目与跨内容来源/作者决定可追溯。不自动改 Skill、不经采纳转换类型。
- `jincheng-publish` CLI 仅接受固定 handoff、当前 claimToken/workerId 的 closeout/review/patterns 阶段，只能读取、核对收口、提交复盘候选和知识候选。作者决定只经桌面 IPC，JSON 冒充 authorDecision 被拒绝。

## 实测

命令：

```text
node --test workbench/test/publication-runtime.test.mjs plugin-src/src/lib/publication-runtime/test/runtime.test.mjs
npm run typecheck:native --prefix workbench
npm run typecheck:renderer --prefix workbench
```

10 个针对性测试通过；native 与 renderer 类型检查通过。覆盖发布身份、缺档案已发布、journal 幂等与恢复、缺7d门禁、延迟/hash、程序区保护与作者区保全、明确作者决定、知识类型分权、外源全状态只读、1REQ 授权/预约、自动成功真实回执、未配置不占用和 unknown 不重复调度。全局测试/插件构建/Electron GUI/真实宿主按主线程冻结回归执行，不由此记录替代。

## 设计标准与覆盖边界

| 规则 | 本轮静态/行为结果 | 尚待实际 GUI |
| --- | --- | --- |
| Surface-01、Controls-01/02 | 复用 Semi Card/Button/Input/TextArea 与现有 ManagementDialog/PopupSelect/UtcDateTimeInput，无新增视觉依赖 | 原生 Electron 窄窗、焦点、Esc、dialog滚动与可达性 |
| Reading-02/03 | 原内容/manifest/快照/来源与历史提供完整展开；指标和长文保持换行 | 长路径/长文真实页面截图 |
| Acceptance-01 | 10 targeted tests 与 native/renderer tsc 通过 | 主线程统一回归及冻结构建 |
| Acceptance-02/03 | 尚未宣称视觉/安装/跨平台通过 | 原生GUI、最终包和根AGENTS按目标平台证据 |

本子任务未调用真实平台付费采集、没有执行发布，没有运行/改写原锦成资料或外源安装器/server。测试均为临时新库与只读关联 fixture。真实 native collector、服务 Key/账单、应用重启/唤醒提醒与最终安装包仍须主线程验证；非本轮 arm64 平台未据此宣称支持。

## 最终关键审查收敛：身份与观测退出恢复

对应 `docs/research/2026-10-28-final-critical-review.md` 的 P1/P2：

- **P1 已修**：来源目录的关联只授予读取，不再按同号 T 贡献当前内容的发布、正式档案或复盘事实。外源必须具有相同原生 `(vaultId,workId)`，或存在作者逐条确认并持久化的 `(sourceId,videoId)→(vaultId,workId)` 映射；映射同时绑定 manifest 路径和原 source vault 身份，源身份更换后失效。旧无 vault_id 与已知 foreign vault 的同号档案默认进入 `unassociatedArchiveCandidates` 并给明确 issue。`associateExternalArchive` 是可信作者适配入口 API，未开放给模型 CLI；目录导入不会调用它。准确映射保留初次确认时的源 hash/决定，后续同一源 video 的真实观测更新可读，重开保持。
- **P2 已修**：observer 保留当前 tick Promise；`stop()` 先停止新预约，再有界等待当前 collect/finish。desktop 退出按 observer drain → broker 已接受调用结清 → shared operation queue drain → worker stop 排序。10 秒等待到上限后，额外有界写入 unknown；队列仍保留已接受的回执写入。费用以原服务账为准，超时不代表免费，也不触发重发。
- 重开对 reserved/unknown **只核验本地原 task/cost/result/已落原始证据**。已有完整原始结果时复用；已提交且 receipt、原 attempt、request hash、request ID、cost ID、1 REQ 测量记录和作品范围均匹配时，从原 task result 恢复快照。原平台 raw 未保留的恢复证据明确标注 `originalPlatformPayloadAvailable:false` 与 `verified-production-task-result`，不伪造平台原响应。只有已计费或没有可验结果时持久化可读 unknown 并带原 cost，保持人工补采入口，绝不再发送 provider 请求。后到的 unknown 不会把已成功快照降级。
- 有限读取继续使用实际 `vaultRootForRuntime` 的 `withVaultReadLock`；普通非 Vault 库直接返回无 due，避免锁错普通库根。`readPublicationFacts` 合并实际 core snapshot 的 `PENDING_MUTATION_CONFLICT`，并保留外改原文。

新增复现用例覆盖：两库同 T、旧无 vault 身份、准确 source/video 映射重开与源同身份更新；预约后退出；真实 shared queue 的 collect/finish 后退出；超时 unknown；实际原生 task 已测量费用但尚未 submit、随后原 task submit 的本地恢复；没有可验任务的 unknown；原始响应已落盘但程序区冲突后的本地补写；pending journal conflict 可见且不覆盖作者字节。

最终 targeted 命令仍为本记录上方的两文件命令；修复后合计 **17 项通过**，native TypeScript 检查通过。这里的生产 task/cost 均为临时库中的离线真实内核记录，未发起真实 HTTP 或付费采集；实际包/GUI/安装门禁由主线程另验。

### 作者逐条关联的 GUI 入口补齐

已将 `associateExternalArchive` 接入现有 `mutateJinchengPublication` 的 `associate-archive` 操作，模型 CLI 仍不能发起作者关联。发布面板列出所有明确 official 来源中的未关联正式档案，包含不同原 T 编号的条目；它们保持候选状态，不贡献当前内容发布/复盘事实。用户先展开阅读原正文、完整 manifest/snapshots、原 vault/work/video 与 source/hash，再进入独立身份核对弹窗，最后点击「我已核对，关联本内容」。后端从当前绑定内容解析目标 vault/work 并生成 author evidence，核对准确 revision、source/video、受限 manifestPath 与源 hash，按既有稳定 mutationId／重试协议保存。原档案始终只读，同一 source/video 不能被静默跨绑到另一内容。

新增真实 desktop controller→worker→Vault 集成用例通过：未关联候选保持 unknown → 作者明确 mutation → 重新打开仍可读准确原档案；重复同 mutation 幂等，源文件字节不变。负向覆盖 actor/authorDecision 注入、越界 path、未绑定 source、非 official source、异 hash、旧 revision 以及已绑定 source/video 改绑另一内容，全部拒绝。

本次针对关联运行 3 个相关用例全部通过（新桌面旅程 + 两个既有外档案身份用例）；native 与 renderer 类型检查通过。全模块已有 17 个用例保持为上一节验证基线，新桌面关联用例增加后合计 18 个用例；此处没有重复宣称重新执行整套 18 个。Surface/Controls/Reading 延用既有 Semi/ManagementDialog 与完整展开入口；实际 Electron 视觉由最终构建验收记录承接。
