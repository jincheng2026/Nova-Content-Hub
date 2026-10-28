# 转写方法的当前映射

完整方法读[原文](../upstream/current/METHOD.md)及其 correction-standard。运行边界以[完整方法适配契约](../../../plugin-src/resources/method-adaptation-contract.md)、[production 任务契约](../../../plugin-src/resources/production-contract.md)和[当前产物结构](../../../plugin-src/resources/production-artifacts.md)为准。ASR 实际调用参考[现有转写执行说明](../../nova-content-writing-execution/references/transcription.md)。

## 保留的业务方法

保留原始识别、分段复核、校正版逐字稿和逐项验收；失败项、缺段与疑似词明确保留，原识别不得被校正版覆盖。只有已核对时间码才称精确；字级均分估计不视为实测对齐。

| 原包交付层 | 当前固定任务映射 |
| --- | --- |
| raw／原始识别、原服务响应 | `references.originalText` 与来源媒体／字幕 hash；真实 provider、引擎、原返回和 fallback 证据保留于本次允许的 artifact 文本／附件。 |
| corrected／校正版逐字稿 | `references.correctedText`、`corrections`，逐项原字、改字与依据；只改可确认识别错误。 |
| segments／分段复核、SRT／字级时间 | `references.segments` 使用实际 `startMs/endMs/text`；复核过程与精度说明进入 artifact.text。当前 schema 没有字级字段时保留完整可读证据，不增加 reference 未支持的键。 |
| manifest／逐项状态与输入身份 | artifact.text 保留输入 ID、媒体 hash、成功／失败／未复核状态、实际引擎与覆盖范围；使用已有受控 ASR 回执，不伪造旧目录或 manifest 文件。 |
| validation／完整性核对 | artifact.text 记录非空、原稿／校正版对应、分段覆盖、时间有效性、缺口和实际核验结果；未执行原验收器就不声称它通过。 |

当前冻结 `parameters.transcript` 的 extract/correct/reextract 语义、稳定 referenceId、原文保全、重提取校正清理和采用 CAS 沿用现有执行说明。固定请求外不猜目标参考，直接对话不自动建库或任务。

## 运行与缺口

- 当前受控 `production asr` 只处理已授权媒体资产 ID，provider、fallback、预算、权限取冻结请求及当前设置。原包的火山／Qwen／Step 配置与 secret 路径仅作方法来源；收到这个包不授权读取密钥、安装引擎、上传媒体或触发费用。
- 原 `scripts/*.py` 全部 executable:false，只读保留；包括有写入副作用的 `--dry-run` 也不运行。旧服务与全局 Skill 不安装。
- 外部分支 `jc-qiepian-chupian/scripts/transcribe_chars.mjs` 未在 ZIP 中提供。句级 SRT／字级 JSON 的独立切片交付与完整校正版交付分别说明；该外部分支仍是未接入缺口。
- 需要额外权限先回写 waiting-permission，缺少本人判断先 waiting-user；只有真实答复才恢复。同一 attempt 完成 checkpoint/submit 后回读真实回执，文件出现和进程结束不能替代验收。
