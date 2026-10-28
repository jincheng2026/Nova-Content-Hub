# 内容主线 B/C · 源码契约验收

2026-10-28，开发版本仍为 0.5.5；本轮没有构建、安装、变更版本或发布产品。所有业务写入都在测试临时库；无真实内容库写入、真实网络、模型、凭证或付费调用。

源码提交：`90609cd`（B 首个同聊协调接点）、`9caea33`（B/C 界面与闭环主体）、`e70f5db`（多次接续的原证据链）、`6d7b0ad`（原页逐句审定门禁）。`6676cc6` 是配合 U4 集成的资料管理核心/scope 薄片，独立留痕。

## 本轮已验证

- 真实 ProductionController、worker 和独立 CLI 进程，从根领取到受限 child、材料与准确作者决定、advance 后继。同聊推进不再启动新聊天，固定 attempt 的交接可重建。
- Codex、WorkBuddy 两种宿主标识分别验证两种等待/恢复、原聊天继续、显式换助手、挑战领取；原 attempt/epoch 不再具有执行权。它们是后端契约测试，未标为真实宿主 E2E 通过。
- typed 材料包保留当前原件、研究/原片/转写/拆解来源、3—5 题本人回答、取舍与缺口。模型生成的摘要不能代替材料包；作者须确认准确产物。合成回答仅用于接口测试，不代表真实采访质量。
- 普通完整链在同一原创作页完成：完整稿、逐句建议、作者不采纳、作者包装选定、设计确认、独立封面、author-save 最终资产。封面是合成服务边界 fixture，未进行真实生图。最终完成核验同 work、当前稿件/包装、设计、当前已选封面、真实保存回执、manifest 和文件字节。
- 审稿具有两条明确路径：真实受控 review 回执与全部作者建议决定；或保存当前全文和准确 revision 的“本版无需修改”产物，再由作者确认。摘要 Markdown、未决建议和旧 revision 均拒绝推进。
- 连续多次作者保存必须从原授权版本沿真实 before→after 回执链串接；正文改变退回写稿，包装选择改变使依赖的下游失效。外部字节和旧身份不能借此写入。
- 显式绝对库路径与 T 的 CLI lookup：逐文件 hash、mtime 与目录清单保持不变；待恢复只报告缺口，不开恢复句柄、不 claim。覆盖两个库的同 T、来源歧义和物理根替换。
- 挑战由 native 随机生成 32 bytes；只保存 hash、15 分钟有效、单次消费。错误/过期/旧 host/通用 claim/并发消费/重新签发/取消均有定向断言。公开快照与同聊文本没有 claim 或挑战明文；一次性文本只由显式准备动作返回。
- 两次换聊后的真实研究 runtime 继续：保留原 search、已登记原片及原账；新 video 请求归新 attempt；再重绑到下一 owner，完成报告→拆解→typed 材料。原响应 provider hash 与实际交付 normalized envelope hash 分别核验。不复制成本、grant 或 claim，不扩大样本/媒体额度；篡改原始字节拒绝。

## 可复核日志

各组有重叠，不合计为唯一测试数量。中断的 `/tmp/nova-journey-all.log`、`final-suite` 和 `regression` 大组不作为通过证据；本目录仅复制具有完整 exit/统计输出的定向结果。

| 日志 | 完整结果 | 对应范围 |
| --- | --- | --- |
| review-full-chain.log | 2/2 | suggestions 与 no-changes 完整普通 B 链，含摘要/旧版本/未决建议反例 |
| repeated-continuation-materials.log | 1/1 | 两次接续→新请求→typed 材料，以及原账/旧原片复用、篡改拒绝 |
| kernel-remaining.log | 13/13 | 中断后未完成的预算、WAL、作者版本、挑战与并发领取定向集合 |
| desktop-waits-scope.log | 2/2 | 双宿主标识、等待恢复、显式迁移及同 ID 物理 clone scope 拒绝 |
| ui-cli-final-assets.log | 5/5 | 组件动作、真实 CLI 进程与准确 final asset handler |
| read-only-lookup.log | 4/4 | 零写定位、待恢复、真 CLI、歧义与根替换 |
| handoff-and-ui.log | 29/29 | 固定 handoff/原任务保留与 UI 显式动作 |
| legacy-stage-regression.log | 14/14 | 原单 stage、作者字段、教程/科普原门禁与原页选择 |
| root-claim-fields.log | 1/1 | 根 claim 额外字段在意图发布前拒绝 |

最后的全树 native/renderer 类型检查由 Root 在并行 owner 完成后运行；本轮中途已有类型检查 exit 0，不代替最终冻结检查。

## 设计规则与未覆盖项

- Foundation-02/03/04、Surface-01/03、Controls-01/02/03：复用 Semi 与现有 dialog，显式 busy/wait/error、主要动作和危险取消；没有新增品牌资源。
- Reading-02/03：长库路径、原聊天/一次性全文可完整阅读和复制；正文与创作页脏稿先保存，迁移必须经明确预览动作。
- Acceptance-01：上述静态与行为日志；CSS/注入断言不充当视觉验收。
- Acceptance-02：本执行代理未运行 GUI 或截图。960×680/1280×860、长路径、焦点/Tab/Esc、减少动画等由 Root 独立验收。
- Acceptance-03：真实助手、真实内容质量、原聊天保持、宿主审批事件、真实网络/本地 Qwen/生图、各 OS/架构安装运行与正式签名均未由本轮测试验收。已安装 Qwen 的其他证据不能被当作本主线真实字幕时间码通过。

资料沉淀仍遵守原素材入库 v2 与长期知识候选/作者采用契约。时间码缺失只能保留纯文本和明确缺口，不能伪造 segments 或放宽 strict intake。最终资产引用真实保存文件；它不表示自动发布或全量原片自足备份。
