# 原型备份首次导入

Node ESM 的有限文件业务入口，供 CLI 与后续 Electron 主进程调用。只创建新的 schema5 内容库，不合并、覆盖既有库，不导入模拟授权/安装/信任为正式能力。

```js
import {
  inspectBrowserBackup, importBrowserBackup,
  getBrowserImport, resumeBrowserImport,
} from './browser-import/index.mjs';

const preview = inspectBrowserBackup('/absolute/旧工作台.json');
const imported = await importBrowserBackup('/absolute/旧工作台.json', '/absolute/新内容库', {
  expectedSourceHash: preview.source.sha256,
});
const status = getBrowserImport('/absolute/新内容库', imported.importId);
const resumed = await resumeBrowserImport('/absolute/新内容库', imported.importId);
```

`inspectBrowserBackup` 继续只读：4 MiB、稳定普通文件读取、严格 UTF-8/JSON 与随包 Core.validate。预检的 embedded-unverified 不代表图片解码通过。source JSON 可以有 BOM/CRLF，归档保留原字节；不执行脚本、不按 srcPath 读本机文件、不下载 URL。

`importBrowserBackup(source, destination, options?)` 保留两参数调用；可选 options 仅接受 `expectedSourceHash`，值为 64 位十六进制 SHA256（大小写均可）。GUI 可传预检的 `preview.source.sha256`：导入在自身那次稳定读取完成后直接比较实际原字节 hash，任何目标预约或业务写入之前不匹配即报 SOURCE_CHANGED，不创建预约；不会通过额外一次预检替代绑定。未知 options 键或无效 hash 报 INVALID_INPUT。resume 仍只使用已接受并存档的来源。

导入/恢复为 Promise，查询同步且不打开业务库、不恢复 pending。共同返回 `{importId,status,sourceHash,destination,libraryId?,progress,issues,targetChanged?,descriptorChanged?}`。progress 包含已落结果的 steps、resources 数量，报告完成后另含逐类 counts。状态有限为 prepared/running/blocked/ready/publishing/committed；无目标预约的查询返回 null。异常在已接受操作后带 importId/workDirectory/destination；提交后错误另带 outcome:'committed'。资源问题列 key/code/status，不把完整图像 base64 或私人正文放入调用结果。

## 预约与恢复

GUI/CLI 固定用户选择的目标。父目录以真实路径、dev/ino 绑定，目标 basename 经 Windows/macOS 安全规则验证；以保守 NFC + 大小写折叠 hash 建唯一预约。先完整保存随机工作目录中的 source.json 原 bytes 与版本化 operation.json，再 hard-link 独占发布预约。同目标同 raw hash 只接受一个 importId；不同 raw 报 IMPORT_CONFLICT；不能按输入文件路径或更新时间认定来源相同。预约前失败的孤儿准备目录保留且未执行 CRUD。

`resumeBrowserImport` 只用已存原字节，不依赖原文件仍存在。整体 async operation 锁固定为 operation → 短时 library，图片解码不占库锁。只在同机 owner PID 明确死亡时回收精确 token；活 PID、异机、空/坏锁不按时间抢占。BUSY 表示已有执行者；LOCK_UNCERTAIN 保留现场。

createLibrary 完整成功后才发布 stage-binding；绑定前初始化孤儿可以保留并换新的 stage candidate，绑定后的 stage 不允许丢失或替换。每个固定 CRUD 在执行前持久保存 stepKey/方法枚举/输入/原 token/mutationId；恢复先 queryMutation，再从历史结果重建对象/追加 ID。不会拿最新 token 改写旧 intent，也不从最新数组末项猜 ID。工作目录或目标被替换、意图/结果不一致、未知操作版本都停止。

## 迁移事实

- 内容与合集独立建对象，基础正文保持空，不拼接各渠道文案；保留录制日、计划日、渠道、示例标记、模板偏好。合集只引用内容成员，不复制成员事实。
- 保留每规格候选/收藏/原显示编号、选图、旧批次日期/状态/参考；ID 键包含 project 或 trash、material、candidate 作用域。旧 running/done 只进入历史批次/历史任务，不创建真实 coverJobs/claim/receipt。
- 每渠道计划保留独立 text。只有日期为 date；没有时区的 date+time 为 local-minute/timezone:null，不补午夜或当前机器时区。
- 历史发布文案/基础正文/标题证据缺失均 unknown。pub.snapshot 单独解析；同旧 candidateId 不同图片必须新建历史候选，只有同作用域、同实际 hash、同旧批次且唯一匹配才复用。发布不会更改当前规格选图。
- 所有导入模板使用新 UUID、新的不可变文件版本包；原定义/规则/历史 sourceVersion 与目标版本映射保留。缺图记录在 definition.importMissingReferences，不造假 resource/hash；历史指纹只在已知原图/回收图中唯一匹配，再独立验证实际 bytes。回收原图保存在历史包，当前包仍固定回原定义。不会凭 source builtin 布尔冒领内置身份、替换新版或额外安装 seed。后续 app seed 可能另装当前原生内置，界面应区分导入模板与当前内置。
- 提示词全部保留为 custom/builtinKey:null，off 与软删分开，目录保留空分类；私人提示词不成为内置分发。
- 照片先建 schema2 unavailable，再完整解码补图，沿用 ID/来源；原型没有独立可信的本人声明，所以 isOwnPhoto:false，等待用户明确声明。已有默认选择愿望用有限 restoreGenerationDefaultReferences 保留；defaultIssues 显示 unavailable/ownership-revoked，不因此允许生成。头像无字节时 null，原值在原备份中。
- 回收内容、合集、照片、提示词、附件/不可用引用均通过有限软删接口保留。回收附件仍在原 owner 下、同 ID，可区分 active/trash 并恢复；旧 remove 接口语义不变。不存在或无法唯一解析的历史 owner/member 关系报 IMPORT_RELATION_UNSUPPORTED 并阻断，不造一条替代内容冒充成功迁移。
- host/showSample 只作机器偏好建议；模拟 bridge/client/session/install/version/auth/trust 都不变成当前权限或运行状态。

原型合法字段若超过当前文件业务接口的字段限额，操作会 blocked 并保留原始来源，不截断后声称完整迁移。

## 资源与完整解码

data URL 必须是允许的媒体类型与规范 base64，实际 magic/完整解码决定图像类型，不信任旧 hash/px/扩展名。正本压缩 bytes 不缩放、不转码、不移除 EXIF。72 个随包原图/结构资源仅由 `builtin-resources.json` 精确路径、bytes、SHA256 解析；备份字符串只有命中此目录才会访问随包文件。使用过的 bytes 固定在工作目录，完成资源阶段后的 resume 不依赖后来版本的随包目录。

本批资源按实际 hash 复用同一 validateImportedRaster 策略的完整解码结果；普通附件未解码结果不充当 raster 通过。照片 resolve 仍执行其自身完整校验。PNG/JPEG/静态 WebP 与 GIF/动画 WebP 全帧验证见 `image-validation/README.md`；APNG 明确 unsupported，保留来源，不拿首帧替代。SVG 只作模板结构，不能成为照片或候选封面。缺 sharp 是执行能力阻断；磁盘 EIO/ENOSPC/EACCES、路径或未知错误上抛，可恢复后重试，不永久伪装成“来源图片不可用”。available/unavailable/unsupported 与限额/坏图代码分别报告。

最终库的 `系统（别动）/导入/<importId>/` 保存原始 JSON、带作用域映射、资源结果、逐类报告、非活跃历史任务与 SHA 绑定收据；有实际坏图/unsupported bytes 时另存 `不可用资源/<hash>`。这些是固定 provenance 写入，不是公开任意文件接口。正常库 API 能读到已迁移的活动与回收对象。

## READY 与提交点

所有 CRUD 完成后核对最终 token、资产/模板/发布引用和来源数量，生成包含全文件/目录 bytes/SHA 的 READY。目标可不存在或真正为空；首次 mkdir 后持久绑定目标 dev/ino，绑定后绝不认领替代目录。按 READY 独占复制，不依赖跨卷 rename，不覆盖异值文件。临时文件必须有本 import 的 install-started 记录及精确路径/hash/长度；合法完整临时文件可在恢复时清理重试，异值或未知文件保留并 TARGET_CHANGED，不泛化忽略临时前缀。

`内容库.json` 最后以 hard-link 独占发布，是唯一提交点。descriptor 已发布、响应/完成记录丢失时，只核已绑定目标、descriptor 原 hash、固定收据/libraryId/sourceHash，即可查询/补记 committed；不要求整库仍等于 READY。提交后的正常正文编辑不触发重新导入。已 durable committed 后正常升级 descriptor 仍保留原完成事实，另报 descriptorChanged；被替换的目标另报 targetChanged，不重建或覆盖。失败/成功工作目录、孤儿和半成品都不自动 rm-rf。

## 验证与边界

```sh
node --test browser-import/test/*.test.mjs
node --test file-library/test/material-trash.test.mjs file-library/test/photos-v2.test.mjs image-validation/test/*.test.mjs
```

已有临时合成数据端到端、同目标双进程、14 个真实 SIGKILL 边界、CRUD 提交后响应丢失、descriptor 前异常/异值临时文件、资源存储单次 EIO 后恢复、当前/历史同 ID 不同图、缺解码器、历史指纹、回收数据、备份恢复测试。受控临时 HFS+ 卷作为源、本地另一文件系统作为目标的实际导入验证通过；stage 按设计就在目标父目录，未以此声称任意独立 stage 卷组合已验收。

当前是 macOS 文件核心测试；Windows 真机路径/锁/刷盘、Electron UI 与两宿主真实生成、安装发行、恶意同用户进程持续替换路径和断电硬件持久化未验收。Node 无法刷 Windows 目录句柄时沿用核心有限降级，只声明进程崩溃/文件 fsync，不声称 Windows 掉电安全。APNG 全帧能力未实现。
