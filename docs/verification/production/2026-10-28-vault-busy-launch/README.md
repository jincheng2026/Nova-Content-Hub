# Vault锁竞争与助手打开

安装版原任务点击时曾显示通用NOT_READY。安装验收者用安装版独立临时库复现：外部进程持有活Vault锁→productionRead原NOT_READY→WorkerClient通用文案，posts1/launches0；无竞争读取与锁释放后恢复通过。该证据证明锁竞争可导致症状，不证明真实现场每次都由此引起。安装证据见相邻2026-10-28-assistant-launch-053/not-ready-diagnosis。

修复只将core活Vault锁竞争细分VAULT_BUSY，并在WorkerClient既有白名单有限读上按100/250/500/1000/1500/2000ms等待同一已冻结请求；仍受15s总读取截止。最多6次额外尝试，耗尽显示明确占用提示。普通NOT_READY、所有写入/提交/恢复均不自动重放；不删除活锁。

Root新增真实子进程持锁→ProductionController.launch+实际executeProduction→同请求重试→锁自然释放→launch回调一次，经历RED→GREEN；worker busy/timeout/真实launch合计22/22、core锁隔离1/1通过。主目录当次类型检查未通过：A2并行实现的resolveSampleEvidence声明及ResearchSearchEvidence→ProductionJSON仍处中间态，原始失败日志保留；不能据此声称完整类型检查通过。独立0.5.4冻结产物须重新执行并记录类型检查。该回调不等于真实宿主已跳转，最终0.5.4包安装后的原任务预填仍须现场复验。原库无本轮测试写入，无付费/网络。
