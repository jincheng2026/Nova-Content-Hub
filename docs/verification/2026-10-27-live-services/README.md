# 2026-10-27 最小真实服务联通

环境：macOS `darwin-arm64`；本工作树未提交源码的独立临时编译；未构建或覆盖共享 `dist`、未验证宿主 GUI、安装包或其他平台。

使用现有 `ServiceTools` → `productionToolBroker` → `executeProduction` → 真实临时文件内容库。每类任务具有冻结工具和 REQ 预算；每次调用真实预留并结算账本。原加密配置仅复制到临时目录，通过 Electron `safeStorage` 读取；仅临时副本启用预算（单任务上限 6）、关闭评论和云 ASR。没有输出密钥或 broker token。

| 项目 | 真实结果 | 请求账本 |
|---|---|---|
| 抖音搜索，一页 | HTTP 402，`PROVIDER_REJECTED` | measured / 0 |
| 抖音资料、作者作品 | 未执行；搜索没有真实作者标识 | 无调用 |
| 小红书搜索，一页 | HTTP 402，`PROVIDER_REJECTED` | measured / 0 |
| 小红书资料 | 未执行；搜索没有真实作者标识 | 无调用 |
| Ark 模型 | 成功，响应正文为 `OK` | measured / 1；prompt 46、completion 24、total 70 tokens |
| 本地 faster-whisper | 路径/模块检查及真实短 WAV 转写成功，非空正文 12 字符 | measured / 0；音频约 2169ms |

TikHub 共发送两次被拒绝的搜索 HTTP 请求，按现有 `ServiceTools` 对 HTTP 402 的分类记录请求用量 0。没有重试、分页、评论、下载、后续作者补全或云端转写。HTTP 402 没有提供可记录的精确供应商错误码；需要核实服务账户或支付可用性，不能据此推断具体余额。此处用量来自应用账本，未取得供应商实际金额账单；不推导人民币费用。

TikHub 的成功业务结构、真实指标、封面和来源链路仍待验收；不能用测试 fixture 或官方文字定义宣布已真实跑通。模型与 ASR 成功也不代表 TikHub 通过。

`summary.json` 保留时间、平台、错误分类、请求用量及实际账本摘录。成功调用另留 `.shape.json` 和脱敏 `.fixture.json`；字符串以稳定哈希占位，保留结构与非敏感数值。模型响应占位 `sample-565339bc4d33` 为 `SHA256("OK")` 的前 12 位，可在不保留响应原文的前提下核验本次简短结果。未保留 TikHub 候选 fixture，因为供应商没有返回候选。

运行完成后已删除临时加密设置副本、broker 描述符、缓存、合成音频和测试内容库；原用户设置与内容库未修改。重跑脚本要求显式 `--run-live` 和一个空证据目录，避免误用原目录导致重复计费：

```sh
node workbench/scripts/live-service-probe.mjs --run-live SETTINGS_PATH EMPTY_EVIDENCE_DIR
```

脚本固定上限为 TikHub 5 次、模型 1 次；实际仅 2 次 TikHub 被拒绝请求和 1 次模型请求。资料与作品仅能使用当次成功搜索返回的真实作者标识，任一步失败停止同任务后续调用。本地合成语音步骤仅适用于 macOS。
