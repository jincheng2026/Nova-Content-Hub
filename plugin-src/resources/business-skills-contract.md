# 业务方法执行边界

业务方法 role 为 business-method，没有独立写库、服务、安装、采集、付费或发布权限。两个宿主共同使用 [完整方法适配契约](method-adaptation-contract.md)、[production任务契约](production-contract.md)和[产物结构](production-artifacts.md)。入口必须读取 registry 对应完整原文及其分支依赖，适配层只处理环境与权限。

1. **先判断模式。** 直接对话按完整方法在当前聊天输出文字候选，不自动 claim/submit、不写库；特别保留 xindao-xuanti 的直接菜单和对话确认。固定工作台任务才从显式 handoff 完成 doctor → context → claim，后续保存走受控 checkpoint/submit。无任务时不猜库，也不因此拒绝纯文字讨论。
2. 从冻结请求读取当前库、账号、contentId、creatorContext及其hash；context.vault是变化线索，不静默替换快照。适用定位包括已识别的无版本/_v0.1等真实文件；已有定位沿用，续访读positioningCheckpoint。定位初始化只在本人请求或positioning-interview启动，不全局拦截其他明确任务。
3. 主要读者、主题/支柱、暂不做、表达视角和公开边界按本轮适用范围读取。外部服务只收完成任务必需的最小字段，不发送全访谈、私人经历、凭据或全库。原作者样本和商业判断不成为新用户事实。
4. 完整方法的停等和阶段顺序保留；教程必须显式选择，不因一般写稿自动进入。叙事确认、关键段确认、人工先拆、访谈逐关确认用真实答复；不能以一次最终submit替代途中协作。已确认原文和手改不由AI候选覆盖。
5. 固定任务的 waiting-user / waiting-permission、恢复、取消、失败、重试与更换助手沿用共同契约和活跃attempt。业务写入携带实际版本/CAS；冲突先重新读取，保留候选。schema不能承载的原字段保留完整文本并报告缺口，不自造受校验字段。
6. 来源旧路径、旧CLI、Python服务、安装器和脚本作为只读方法/协议源；不会自动执行原安装、后台服务、扫描、采集或文件搬移。是否存在等价当前adapter以真实工具/验收为准，缺能力明确未执行。
7. 采集、评论、ASR、provider、预算与费用只认当前冻结权限。评论需本轮明确要求；提供参考视频不授权评论。缺预算/权限走等待；自动发布、变现、消息和外部写入不由原文扩权。停用/历史/草稿仅回溯，dbskill不接入。
8. submit后回读taskId、attemptId、requestHash和结果hash；已交回、人工accepted、实际采用、真实发布分别说明。文件存在和对话结束不能替代成功回执。宿主成功/等待恢复/终态/继续/切换未逐项验收时保持contract-unverified。

完整来源字节、状态与引用缺口登记于 [method-sources.json](method-sources.json)；来源解释见 [provenance](production-methods-provenance.md)。历史记录只证明来源与状态，不把当前机器路径设成产品默认值。
