---
name: nova-content-cover-execution
description: 执行自媒体工作台交来的封面 handoff ID：读取固定请求和参考图，调用当前助手生图，并通过随包 CLI 整批提交候选。
---

# 执行封面

原型 `contract check-request` 只校验契约；真实执行以本地 context 与 submit 回执为准。

任务编号就是 handoff ID。只按原编号定位固定请求；跳转首句用于识别任务。

1. 使用本目录的 `../../bin/run-node`（Windows `../../bin/run-node.cmd`，均为带引号的完整路径；下文 `RUN`）。运行 `RUN doctor`；`AUTH_NOT_CONFIGURED` 时停止业务执行并如实报告。
2. **执行前完整读取 [执行与提交契约](execution-contract.md)**。它规定全部输入读取、角色、尺寸、实际生图 prompt、原字节复制、SHA256 与 submit 回执；逐项完成才继续。
3. 运行 `RUN cover context --handoff <ID>`，完整保存 stdout 为临时 JSON。拿到身份后先回写 reading，再按返回的 requestPath 读完本地原始请求；按 bodyPath 读完固定正文；再依契约读完整模板说明与全部输入。当前助手必须等于 attempt.host。
4. 全输入实际读取与清单核对完成后 claim；生图前、校验提交前分别回写阶段进度。阶段顺序为 `reading → generating → validating`。只有 submit 成功才报告已回传；候选仍由用户在工作台挑选与检查。

## 进度与待确认

每次先保存一份独立进度 JSON，再运行 `RUN cover progress --handoff <ID> --file <进度JSON>`：

```json
{"host":"当前助手 codex 或 workbuddy","requestHash":"context.request.requestHash","phase":"reading","state":"running","message":"正在读取固定输入","expectedRevision":0,"mutationId":"新UUIDv4"}
```

- `expectedRevision` 是最新 context.progress.revision，无进度时为 0；成功后使用回执的新 revision。message 是最多 240 字符的单行真实进展，不放正文或完整提示词。phase 采用上面的阶段；生成和校验阶段必须先 claim。
- 响应不明时重发相同文件与 mutationId；`CONFLICT` 时重新读取 context 后报告当前真实状态，不能用旧 revision 覆盖新等待。取消、旧 attempt、输入变更或终态被拒绝时保留错误并回工作台处理。
- 需要用户回答、选择或核准方案时，**提问前**写 `state: waiting-user`；需要用户批准额外服务/费用或已知工具权限时，**请求前**写 `waiting-permission`。读取阶段尚未 claim 也可等待。保留原 phase，message 简述待决定项。
- 只有收到用户实际回复或明确权限结果，才写 `running` 并继续。点击工作台的继续按钮不代表用户同意。宿主工具级审批没有可靠绑定 hook 时无法自动捕获，诚实说明；只报告实际已知的等待。
- 宿主明确提供当前会话 UUID 时，可加 `sessionId` 绑定当前 host 的原会话；后续报告保留该 ID。没有可靠会话 ID 就省略，不从 cwd、最近会话或其他任务猜测，不提交任意 URL。

## 生成、提交与中断

按 [执行与提交契约](execution-contract.md) 的对应步骤完成 claim、真实生成、原字节校验、submit 和 status。请求、正文、模板、元数据与事务均由核心管理；所有任务变化只通过 CLI。用户取消、工具不可用或输入错误时按契约 fail/cancel，保留原输入与输出。
