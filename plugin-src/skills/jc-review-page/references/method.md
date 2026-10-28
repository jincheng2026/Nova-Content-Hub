# 审稿方法的当前映射

先完整读[原方法](../upstream/current/METHOD.md)、原模板与构建脚本中的规格（只读），再按[适配契约](../../../plugin-src/resources/method-adaptation-contract.md)和[production 契约](../../../plugin-src/resources/production-contract.md)执行。

- 原稿逐字保留；每条建议保留最小唯一 `old`、`new` 或 `insert_after`、明确依据与处置。依据 voice/frame/caption/meet/you/rule/plat/op/ai 分开，口播引文附真实时码；caption 不能冒充口播。must 只记录本人已确认，optional/keep/wait 继续保留原义。
- 已有 jc-doc 创作页时，走同一 contentId/T 的当前原页 read/suggest 和作者手改读回，遵守稳定 ID、未知字段保全、CAS、历史和外部修改冲突；原页真源协议见[现有原页方法映射](../../jc-gongzuotai-write/references/method.md)。不能再生成另一份页面接管正文。
- 没有原页时，writing任务调用受控jincheng-creation review生成保留原稿的可编辑审稿入口；原Markdown和当前稿决定保留。原 localStorage HTML、spec 和脚本是来源证据，不安装、不执行，不以浏览器缓存作为真源。
- 本人已编辑结果读回后原样保存到同一受控工作稿，先核对基线与 CAS，保留候选和日志。没有等价 adapter 时明确“候选已交回，页面编辑／落文件未执行”，不能将 submit 回执等同于作者稿已采用。
- 固定 handoff 继续使用 doctor/context/claim、waiting-user/waiting-permission 和真实答复恢复、取消／失败／重试、checkpoint/submit；直接对话只给文字候选。提交后核对 task/attempt/requestHash/receipt。两宿主真实流程尚待验收，runtimeStatus=contract-unverified。

## 当前受控入口

冻结stage=`review-page`时，执行前必读[四项方法运行协议](../../../plugin-src/resources/jincheng-method-adapters.md)，按该分支schema保存、停等、恢复与提交。运行协议说明已实装适配边界；runtimeStatus仍为contract-unverified，真人判断与真实宿主质量待验收。
