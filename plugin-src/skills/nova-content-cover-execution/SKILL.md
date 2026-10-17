---
name: nova-content-cover-execution
description: 执行自媒体工作台已准备的封面请求。用户从工作台交来明确的内容库位置、contentId、requestId、attemptId 时，读取本次参考图、生成封面并通过受控 CLI 整批提交。
---

# 执行封面请求

此 Skill 随实验本地执行包分发。CLI 位于本文件目录的 `../../src/cli.mjs`（旧分发位置的同源副本使用 `../../cli.mjs` 兼容入口），以 Node.js 运行，统一入口业务命令都加 `cover` 命令空间，例如 `node ../../src/cli.mjs cover context …`；旧兼容入口省略 `cover`。使用用户本次提供的绝对库位置、内容 ID、请求 ID、尝试 ID 和助手名；信息缺失时先明确缺失项。只操作这次请求。原型的 HANDOFF.json / REQUEST.json 仅交给 `contract check-handoff` / `contract check-request` 校验；未绑定原型请求不能转成真实封面执行。

## 步骤

1. 运行 CLI `doctor`。若业务命令返回 `AUTH_NOT_CONFIGURED`，说明可信权益尚未接入并停止；保留原包配置。
2. 运行 `context --library <库> --content <内容ID> --request <请求ID> --attempt <尝试ID>`。读取实际返回的正文和输入文件。用宿主的看图能力打开每一张 style 与 own-photo 图片，读取选入的资料；按 request 中固定的提示、准确尺寸、格式和数量执行。own-photo 为用户选入的本人照，style 中的人物仅用于理解构图；request.photo 为 null 时按无人物要求执行。
3. 实际读取输入后，通过 `claim` 提交包含 host 和 readAssetHashes 的 JSON；host 为本次助手的 `codex` 或 `workbuddy`，hash 列表覆盖本次全部输入。命令的固定 ID 参数同 context，JSON 通过 `--file` 或 `--stdin` 输入。以 CLI 成功回执作为接单完成判据。只接单不代表生图成功。
4. 使用当前宿主可用的图像生成能力，真实生成请求数量的图片。需要编辑本地参考时按宿主图像工具要求先看图。把结果作为普通文件复制到 context 返回的 inbox，用单层文件名；保持生成原始字节。尺寸、数量或内容不符时，保留产物并说明问题，不裁切、拉伸或复用同图来凑数。
5. 计算每个收件文件的真实 SHA256，创建一份原始回执 JSON：`libraryId/contentId/requestId/attemptId/requestHash/resultId/files`。resultId 使用新 UUIDv4，files 为 `[{"name":"文件名.png","sha256":"64位小写hash"}]`。保存并保留这份回执原字节，重试使用同一文件。运行 `submit`，固定 ID 参数同 context，以 `--file` 指向回执。
6. 只有 submit 返回成功，才报告候选已整批登记和 candidateIds，并提醒用户回工作台挑选。技术校验通过仍需人工检查文字、人物和视觉质量。

## 中断和失败

- 生图工具不可用、额度不足或调用失败：通过 `fail` 提交 `{"code":"具体错误代码","message":"用户能理解的原因"}`，保留当前输入和输出；如实说明当前尝试没有完成。
- 旧 attempt、输入过期、取消、坏图、错误尺寸/数量或路径被拒绝：保留 CLI 错误与收件文件，按工作台的新尝试继续；旧文件不改绑到别的请求。
- submit 响应丢失：重放原始回执，核心返回原候选；不要生成新 resultId。Stop Hook、打开助手和文件出现均不能替代 submit 的提交事实。

所有业务状态通过 CLI 修改；用户正文、模板包、内容 JSON、事务和校验报告由核心管理。图片与用户素材只发送给本次明确选择的宿主生图能力；如需额外外部服务或另行计费，先说明并取得用户授权。
