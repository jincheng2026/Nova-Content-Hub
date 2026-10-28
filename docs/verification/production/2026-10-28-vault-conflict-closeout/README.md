# 资料外改冲突收敛 · 0.5.4 源码

本修复在0.5.3独立源码冻结后进行，不属于该预览包。

原问题：资料外部修改后保存发生 CONFLICT，核验未提交并放弃旧 pending 时返回 current=null，保留的编辑器继续用旧 hash 保存，反复报同一冲突。

修复：discard 核验完成后按原 documentId 重读最新原件。编辑器保留本人 text/title/category，以最新原文和 hash 更新源；外部有变化时仍保持 conflict，展示最新原文。用户可明确选择“已对照，保留填写继续编辑”后自行合并，再按最新版本保存。该动作不写库；文件再次变化仍被CAS拒绝。不可读/被替换原件继续禁止保存，不把 current=null 当安全覆盖授权。

验证：先红3项（真实Controller回读为null、恢复状态旧hash），再绿6/6，包含真实临时Vault外改→CONFLICT→discard→保留双版本→明确合并保存，以及再次外改仍拒绝覆盖。旧已提交/新建/后续手改恢复测试保留。未操作真实库。

规则：Surface-03 保留草稿与显式恢复；Controls-01 既有Semi按钮和busy状态；Reading-02 显示完整外部原文；Acceptance-01 定向6/6。新按钮的最终安装版/键盘/截图验收待0.5.4集中验证。全仓typecheck当时仅受并行journey新模块声明未落盘阻断，未宣称全仓已通过。
