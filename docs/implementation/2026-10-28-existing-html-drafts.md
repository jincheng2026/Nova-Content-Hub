# 已有 HTML 当前稿继续编辑

## Task 1 明确创建可编辑工作稿

基础需求：已有第二大脑可直接正常使用，保留当前稿件、T编号、来源与原文；不在Electron执行任意旧脚本。目前能提取jc-doc人工稿但HTML只读，必须补明确可继续的路径。

所有权：新 `plugin-src/src/lib/vault/working-draft.mjs` 与声明/定向测试；按需修改 `vault/core.mjs` 的当前稿来源选择及受控导航更新（core其他职责不重写）；`workbench/src/shared/vault-contracts.ts/vault-validation.ts`、`main/vault-controller.mts/vault-worker.mts`、`preload/index.cts`、`main/boundary.mts`、`main/controller.mts` 新有限方法委托、`renderer/vault-workspace.tsx`。不要改bridge/resources/backup/index/production核心或production-workspace/shared production-validation（其他owner）。共享文件范围只做本新方法接线。

新增有限 `createVaultWorkingDraft`，renderer仅传 `{id,expectedHash}`，由当前绑定解析确切源文档、contentId、同篇目录与版本。主进程先持久vaultPending、worker受控写入、回执恢复沿用既有模型；新pending方法返回VaultText，补shared严格校验和有限API通道，required拒绝写入。

在“资料与定位”读取已识别的HTML当前稿时，显示明确动作“建立可编辑工作稿”，解释原HTML保留、后续改稿在同一内容目录进行。只对能可靠提取当前人工稿的jc-doc格式开放；未知HTML仍可阅读定位，不能把脚本或markup当口播正文。转换前核验source hash与对应T/当前来源，来源冲突保稿。

以现有 `materializeVaultBody` 等受控机制在同T目录生成Markdown工作稿，T/UUID不变。记录明确的新当前入口及原HTML历史来源，`contentSources` 优先选择经此操作登记的当前稿；旧草稿总览仍指原HTML时不能把选择悄悄切回去。SOT/README受管理区同步入口，保留人工正文。不是替换旧HTML、移动旧文件或创建新的T内容。

同一mutation丢响应重放不重复建稿；源文件已变化、目标被占用、操作中断后能恢复或明确冲突，不能留下无法重开库的journal。建立后通用编辑器可立即编辑新MD，既有内容工作区/生产任务读取新当前稿，源HTML字节不变。不要直接编辑原段落字段来伪造原交互页保存。

最低验证：临时jc-doc+T卡+旧总览入口识别→明确建立→同T/ID/原HTML不变→普通updateContent/saveProductionDraft写新MD→重开仍当前新稿→重复mutation/失响应/目标冲突/源hash变化/未知HTML拒绝；新有限API额外path字段拒绝与required拒绝。已有Vault/read-only路径回归及native/renderer typecheck。实现后报告写 `.superpowers/sdd/2026-10-28-existing-html-drafts/task-1-report.md`。不要开子代理、不commit/切分支、不写用户原库；可读给定主Vault，实际测试临时副本。
