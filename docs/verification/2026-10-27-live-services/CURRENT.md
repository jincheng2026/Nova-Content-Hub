# 2026-10-27 本次真实服务复验

环境为 macOS darwin-arm64，当前未提交源码、独立临时编译。没有构建、替换安装版或修改用户内容库。UI与宿主真实聊天的验收由对应任务单独记录，本文只覆盖下述真实服务与后端链路。

## 本次实际请求

- TikHub首轮：`current-radar/summary.json`。北京时间13:33:31，从真实 `createRadarTask` 冻结“AI 工具教程”、1个候选、最多2REQ、无评论，经 claim → collectRadar → broker → worker/账本 → TikHub 发出本轮唯一一次抖音搜索，HTTP402、`PROVIDER_REJECTED`。立即停止，没有分页、作者资料、评论、重试或其他平台调用。供应商错误码为null，错误正文未保存，不能据此认定具体余额不足或套餐原因；按服务端拒绝计费/配额请求、具体原因待核验处理。账本0REQ是应用对402的请求量分类，不是供应商人民币账单证明。
- 用户指定Key复验：用户随后明确提供TikHub Key并要求保存后验证。主线程通过真实工作台保存，隔离helper先用safeStorage解密并与用户提供Key的SHA256比对，`credentialHashVerified:true`后才发请求。`new-tikhub-key-radar/summary.json`记录北京时间14:25:47本轮唯一一次搜索仍HTTP402、providerCode:null，立即停止，没有第二次请求；原文件SHA256不变。`post-check.json`复核原预算开关仍为false、TikHub/model状态已配置；Key匹配不代表供应商采集可用，不推断具体余额原因，也不绕过402。此次是用户重新授权后的复验，不是对上一轮自动重试。
- 火山方舟：`current-model-asr/summary.json`。用户明确确认已开启“安心体验模式”后，北京时间13:39:36只发出一次真实推理。实际响应模型 `doubao-seed-2-0-mini-260428`，正文 `OK`，prompt46、completion21、total67 tokens，其中reasoning20。经真实调研任务冻结配置、claim、broker、费用预留/结算、submit、回执和accept，产物1个；直接从临时知识目录读出的 `research-archive.json` 为accepted归档，回执hash与本次提交一致。没有复用原先70tokens结果冒充本次请求。
- 本地ASR：同一 `current-model-asr/summary.json`。使用系统 `say` 合成已知中文“你好，语音测试。”并转为16kHz WAV，登记真实媒体资产、关联转写任务，再经同一broker执行一次本地faster-whisper。音频1543ms，响应8字符、1段，0外部REQ，submit/accept均成功。`asr-text-verification.json` 核对实际响应hash精确匹配“你好,語音測試。”，简繁与标点归一后与输入词句一致。不是纯音、空识别或只有模块存在检查；该短样本不代表长音频质量已验收。
- 本地语言模型：`current-local-language-model.json`。实际保存配置只有volc模型，没有本地LLM端点；11434、1234的真实TCP连接均ECONNREFUSED，8000可连但单独lsof观察owner为ssh，未据此推断模型服务或发送HTTP/推理。没有发现标准位置的Ollama、LM Studio或Ollama模型目录。常见端口与位置检查不排除其他端点。当前设置校验拒绝本地HTTP，受控公网请求也对loopback返回 `UNSAFE_ENDPOINT`；尚无已支持的本地LLM接入能力。本地ASR不能代替本地语言模型。

## 各工作台业务覆盖边界

- 助手任务：本次模型/转写任务真实创建、冻结、领取、调用、提交、回执校验、确认；未启动新的Codex/WorkBuddy对话，宿主GUI/审批/恢复不在本服务脚本覆盖内。
- 调研：真实创建simple调研任务并只执行连通性推理，真实结果进入accepted任务归档。不是完整主题调研、带来源报告或深度调研质量验收。
- 对标账号：本次未为账号分析额外发送TikHub或模型请求。TikHub唯一402可说明同一供应商采集当前受阻，不能说明账号资料、作品或分析报告已跑通。账号参数冻结与手工平台分流按相关后端测试/UI验收单独记录。
- 低粉爆款雷达：上述真实一次搜索就在雷达业务链路，供应商402阻断候选采集。没有候选、作者补齐、采纳选题或成功报告；未用fixture替代服务数据。
- 转写：本次known-speech资产与本地ASR为真实调用。整套视频内容创作与长视频转写另行验收。

## 免费状态与设置保护

火山官方说明安心模式是账号维度开关，入口在控制台开通管理或开通模型时勾选；未找到可在单次Chat API请求强制仅使用免费额度的header、参数或model ID后缀。本次按用户已开启安心模式的明确确认执行，未独立读取账号开关、免费额度或账单。实际usage保留 `costStatus: unknown`，不填0元、不保证长期免费，也不静默切换其他付费provider。

- [官方免费推理额度](https://docs.volcengine.com/docs/ark/free-inference-quota?lang=zh)
- [官方安心体验模式细则](https://docs.volcengine.com/docs/ark/free-tokens-only-mode?lang=zh)；抓取可用同内容[官方文档地址](https://docs.volcengine.com/docs/undefined/1465347?lang=zh)
- [官方模型价格](https://docs.volcengine.com/docs/ark/model-pricing?lang=zh)

原加密配置只复制到临时目录，通过Electron safeStorage解密，没有将key写入命令或证据。用户原预算开关为关闭；只在临时副本打开最小预算并关闭评论/云ASR，实际用户开关未更改。因此本文证明源码受控链路可调用，不证明原安装版或原设置已启用付费调用。两个真实脚本结束前后原配置SHA256一致（`originalSettingsChanged:false`），临时设置、broker描述符、缓存、音频和库已删除。

## 本次发现并修复

任务会冻结 `serviceConfig.model/asr`，原broker却直接使用最新设置。复现：任务冻结Ark后修改当前provider/端点，调用进入新配置的校验，返回 `UNSAFE_ENDPOINT`，没有识别被冻结服务发生改变。该路径允许服务配置在任务后改变，可能改变请求模型或云/本地执行方式。

修复在broker初检和费用预留前比对对应工具的冻结配置，变化返回 `SERVICE_CONFIG_CHANGED`，不会预留或请求；需要按新设置重建任务。未保存serviceConfig的旧任务保留原兼容行为，不能声称它们已具备新的冻结保护。API Key本身不进入任务快照，轮换仍可用。

ServiceTools准备阶段同时保留本次配置快照，构造模型请求、云ASR请求、本地引擎检查和转写命令都使用该快照，避免prepare与invoke之间设置变化导致请求漂移。审查另外发现ABA竞争：初检当前A、prepare读到B、用户恢复A，若预留前只比较当前A仍会误放行B。新增回归先复现此错误，再将实际准备快照的副本传入预留hook，同时对冻结配置比较“当前配置”和“实际准备配置”，两者均匹配才可预留。没有全局放开SSRF、本地端点或云ASRfallback。

回归先红后绿，覆盖model/asr配置变化、准备期间变化、ABA恢复配置、旧任务兼容及本地执行配置快照。相关service/broker测试40项通过，测试中的受控模拟仅用于配置竞争回归，不作为上述真实服务成功证据。最终原生类型检查通过；未承诺Intel Mac或Windows实际运行通过。ABA修复后没有再次请求外部服务；本次67tokens与中文ASR真实成功记录保留。

复验命令（真实调用需确认账户条件且使用空证据目录，成功后不要重复调用）：

```sh
node workbench/scripts/live-service-probe.mjs --run-radar-one SETTINGS_PATH EMPTY_EVIDENCE_DIR
node workbench/scripts/live-service-probe.mjs --run-model-asr SETTINGS_PATH EMPTY_EVIDENCE_DIR
node workbench/scripts/local-language-model-probe.mjs EVIDENCE_FILE SETTINGS_PATH
node --test workbench/test/service-frozen-config.test.mjs workbench/test/service-tools.test.mjs workbench/test/service-broker-lifecycle.test.mjs
npm run typecheck:native --prefix workbench
```

`live-model-asr-entry.mjs` 在本次调用后补充了自动归档回读复制与已知语音明文记录；本次模型accepted归档由独立文件读取保留，ASR正文由已记录的实际SHA256比对确认。没有为补充证据再次请求模型或转写。
