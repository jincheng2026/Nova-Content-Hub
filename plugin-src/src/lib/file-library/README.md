# 本地文件库：schema 5 有限文件模型

Node ESM，使用精确锁定的 sharp 0.35.5 完整解码真实生成封面，供后续 Electron **主进程**和 CLI
共用。已包含内容、资产、照片、提示词、模板版本、候选封面、人工计划和人工发布快照；已增加真实封面任务文件核心，尚未接入 renderer
或外部发布。这不是完整 P1，也不是 Electron 发行验收。Node 20.11+。

```js
import { createLibrary, openLibrary, upgradeLibrary, LibraryError } from './plugin-src/src/lib/file-library/index.mjs';

// 传绝对本地路径，父目录必须存在；库根本身和库内路径不允许符号链接。
const library = createLibrary('/Users/me/Documents/自媒体内容库');
const content = library.createContent({ title: '一篇文章', body: '# 正文\n' });
const edited = library.updateContent(content.id, { title: '新标题' }, content.editToken);
const trashed = library.trashContent(edited.id, edited.editToken);
library.restoreContent(trashed.id, trashed.editToken);
const reopened = openLibrary('/Users/me/Documents/自媒体内容库');
```

## 接口与返回

除 `commitCoverAttempt` 返回 Promise 外，函数同步执行；失败会抛出 `LibraryError`；Electron 应在主进程合适的执行上下文调用，不能向
renderer 暴露通用文件或 shell 权限。

| 接口                                                          | 含义                                                                                                                                                                                         |
|---------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `createLibrary(root, options?)`                               | 只接受不存在或为空的目录；可绑定所选空目录身份，不接管已有非空目录                                                                                                                           |
| `openLibrary(root, options?)`                                 | 可绑定下文预期身份，核对后才拿锁恢复未完成事务；省略 options 保留原行为，整库移动后以新路径打开                                                                                              |
| `upgradeLibrary(root)`                                        | 显式将旧 schema 1/2/3/4 库升级为 schema 5，支持中断后重入；已经是 schema 5 时幂等打开                                                                                                        |
| `library.info`                                                | 冻结的打开时身份快照：`format/schemaVersion/libraryId/createdAt/root/rootIdentity/durability`；root 为祖先路径解析后的真实位置，嵌套 `rootIdentity:{dev,ino}` 也冻结，操作会重新核对磁盘身份 |
| `listContents()` / `listTrash()`                              | 按 ID 排序的当前内容 / 已删除内容数组                                                                                                                                                        |
| `readContent(id)`                                             | 读取内容；可读取回收站中的内容                                                                                                                                                               |
| `createContent({title, body}, options?)`                      | 创建稳定 UUID v4 内容 ID                                                                                                                                                                     |
| `updateContent(id, {title?, body?}, expectedToken, options?)` | 非空补丁；另接受下文 schema 5 描述字段；不能编辑已删除内容                                                                                                                                   |
| `trashContent(id, expectedToken, options?)`                   | 设置 `deletedAt`，不搬目录、不删正文                                                                                                                                                         |
| `restoreContent(id, expectedToken, options?)`                 | 清除 `deletedAt`；重复删除/恢复报 `INVALID_STATE`                                                                                                                                            |
| `queryMutation(mutationId)`                                   | 先恢复后返回 `{mutationId, status: 'committed', content}`；未知 ID 返回 `null`                                                                                                               |

内容返回：`format/schemaVersion/id/title/revision/createdAt/updatedAt/deletedAt/body/editToken`。变更结果另带 `mutationId`
。标题保留调用方原字符串，必须非全空白且不超过 500 个 JS 字符；正文可为空。目录名只使用内部生成的 ID，标题不成为路径。

`openLibrary` 的 options 若提供，必须精确为
`{expectedLibraryId: UUIDv4, expectedRootIdentity: {dev: string, ino: string}}`，两层均不接受缺字段或额外键。dev/ino
为规范非负十进制 BigInt 字符串（`0` 或无前导零的正整数；不接受符号、空白、小数或指数），不转 Number。调用方可保存已明确选择库的
`library.info.libraryId` 和 `library.info.rootIdentity`，下次打开时传回。规范化根路径后，先采集并核对这一次目录身份，再读
descriptor 核对 libraryId；任一身份不符报 CONFLICT，发生在任何拿锁和 pending
恢复之前。该次采集身份固定传入库实例，原有锁前、锁内检查继续使用同一身份，不在构造时重新采集并接受替换目录。`rootIdentity`
只是运行时投影，不写入 descriptor 或改变库 schema。省略 options 仍允许显式重开当前路径；桌面调用方需保存并传回两种身份才能使用此约束。该合同不声明抵抗持续恶意路径竞态或
inode 复用。

`createLibrary` 的 options 若提供，必须精确为 `{expectedRootIdentity: {dev: string, ino: string}}`
，使用相同的规范十进制校验，两层均不接受缺字段或额外键；非法参数在任何落盘前拒绝。传入身份时，所选目录必须仍然存在且匹配，目录消失或
dev/ino 不符报 CONFLICT，不会自动重建；软链接等不安全路径继续拒绝。省略 options 保留创建缺失目录的用法。创建固定首次 root
身份和各个已创建子目录身份，每次初始化目录、配置和 descriptor 写入前重验；配置使用独占创建。最后用提前生成的 libraryId 和固定
root 身份调用受约束的 `openLibrary`，在拿锁或恢复 pending 前拒绝替换库。失败会保留原目录的半成品，不按旧路径清理新出现的目录。目录身份检查与
Node 路径系统调用之间仍有窗口，这不是原子 openat 防护，也不保证识别 inode 复用；需要抵抗持续恶意替换时必须改用具备相应能力的原生文件系统层。

`editToken = SHA256(SHA256(元信息原字节) || SHA256(正文原字节))`，其中两段内部哈希是各 32 字节。它包含正文和元信息的原始字节，外部
Markdown 编辑或仅 JSON 格式变化都会让旧 token 失效。单纯改标题会保留正文原字节，包括 CRLF；`body` 返回 UTF-8 字符串。

业务变更的 `options` 只接受 `{mutationId: UUIDv4}`。调用前由调用方生成并保留 ID，可以解决提交后进程退出/响应丢失的不确定性。同一
ID、同一请求重复调用返回 **该次提交的历史快照**，不会再提交；请求不同则报错。旧 token 的幂等重试也可返回原提交结果，不会覆盖其后的编辑。未提供时由库生成
ID，失败后可从异常的 `mutationId` 获取。

## 磁盘契约

```text
内容库.json
内容/<contentId>/
  内容.json                    # format/schemaVersion/id/title/revision/时间/deletedAt
  正文.md                      # 正文唯一真源
系统（别动）/
  库锁/<ownerToken>.json       # 唯一 token、host、pid
  内容库.schema1.bak.json      # 仅旧库显式升级时保存的根描述文件原字节
  事务/待恢复/<mutationId>/
    intent.json                # 固定计划、前后原字节 base64 + SHA256
    captured-0 / captured-1     # 原子捕获的旧文件（实际需要替换时存在）
    COMMITTED                  # 完成判据：intent 原字节 SHA256
  事务/待恢复/.staging-<mutationId>-<uuid>/ # 尚未发布的意图，不执行、不自动删除
  事务/已提交/<mutationId>/     # 完成后整笔事务原样归档，所有历史字节保留
```

根描述文件 `内容库.json` 的 `schemaVersion` 是 **5**。新内容为 schema 4，新提示词为 schema 2；旧内容 1/2/3 与旧提示词 1
继续可读，普通业务编辑惰性升级，真实封面任务保持较高版本、不降回 3。新事务 schema 3 的类型严格限定
content/prompt/photo/template/workspace/collection；旧 schema 1 严格映射 content，旧 schema 2
只允许原四种类型。共用捕获/安装/恢复引擎，历史原字节不重写。

每次读取/变更都拿全库 `mkdir` 锁，锁内重读身份并先恢复事务。仅同机且 `kill(pid, 0)` 明确返回 `ESRCH` 的持有者可回收；活进程、PID
复用、权限未知、异机持有者一律不按年龄抢锁。回收只删除精确旧 token；`unlink` 失败（包含 `ENOENT`）立即停止，只有删除成功者才尝试非递归
`rmdir`。释放也只删除自己的 token。空锁保留并报诊断，不能靠超时猜测它是否安全。

意图日志先写入明确命名的 staging 目录，完整写入并刷盘后，才以目录 rename 原子发布为正式 UUID 事务；发布前绝不动权威文件。中断留下的
staging 保留且不参与恢复，调用方可用相同 mutationId 重试； **正式事务中的坏意图仍拒绝恢复**。日志不接受路径指令：目标只能由已校验的有限
kind 与对象 ID 推导为固定文件集（content/prompt/collection 各两个文件，photo/template/workspace
各一个文件），并检查产品格式、版本、字节哈希、revision 和状态转换。每次恢复先检查该 kind 的 **全部**目标；遇到既非 before 又非
after 的第三种字节，保留日志/文件，停止自动写入。

替换时先将目标 `rename` 捕获到事务目录，重新读取捕获字节与 before 对比；不同则保留捕获现场并报冲突。新字节先写入同卷临时文件并刷盘，再以
`link` **独占**安装到目标。出现 `EEXIST` 时保留双方，不回退到覆盖式 rename。所有目标 after 字节确认一致后，将完成判据写入
`.COMMITTED-<uuid>` 临时文件，刷盘后以 `link` 原子发布 `COMMITTED`；部分临时判据不影响重开，恢复可重写。回读确认后，以同卷目录
rename 将事务移至 `已提交` 并同步两侧父目录，才返回成功。历史日志的 before 字节永久保留；当前没有物理 purge 或自动历史清理。

恢复只扫描 `待恢复`。其中已存在有效 `COMMITTED` 的事务 **只归档**，不重放正文，也不要求当前正文仍等于历史
after：提交后的外部编辑是新的事实。归档失败的异常带 `outcome: 'committed'` 和 mutationId；后续操作必须先完成恢复与目录同步，才能启动另一笔变更。两处发现相同
mutationId 会报冲突，不任选一处覆盖。

冷启动和普通读取不读取 `已提交` 中的 intent/正文历史字节。`queryMutation` 及指定 mutationId 的重试按 ID
定位，完整验证该笔意图、字节哈希和完成标志，仍返回原历史快照。归档历史的损坏在访问该笔回执时拒绝，不把普通正文读取当作全历史审计。

## 旧库的显式升级

`openLibrary` 遇到 schema 1/2/3/4 只抛 `UPGRADE_REQUIRED`，不会建目录、备份、恢复或写入旧库。由调用方明确调用
`upgradeLibrary(root)`：

1. 拿同一全库锁并重新校验身份，将根描述文件 **原字节**经 staging 持久发布到 `系统（别动）/内容库.schema1.bak.json`
   。已有备份必须一致。
2. 建立 `待恢复` / `已提交` 两个目录作为旧版读写屏障。旧 schema 1 实现见到这些非 UUID 目录会拒绝继续。
3. 预检旧事务根、待恢复、已提交三处的全部事务：身份、字节哈希、完成标志、重复 ID、唯一未完成事务及其当前文件状态。异常停止并保留现场。
4. 完成事务原样移入已提交；唯一未完成事务移入待恢复、恢复并归档。旧 staging 移入待恢复保留且不执行。每次移动同步父目录。
5. 确认没有遗留旧事务或未解决 pending 后，最后原子发布只将 schemaVersion 改为 2 的根描述文件，保留其他字段。

升级中断可再次显式调用同一函数继续。`内容库.schema1.bak.json` **仅是根描述文件备份，不是整库备份，也不提供安全降级**。schema
1→2 完成后，继续执行专用 2→3 升级：先恢复旧 pending，再持久备份 schema 2 描述文件；在事务根创建 `升级到3/` 屏障，旧 schema 2
的恢复器会拒写；建立新增业务目录；最后原子发布 descriptor 3 并保存完成标记。各阶段均可显式重入。描述文件备份都不代表整库备份，不能以换回
descriptor 的方式降级。没有引入通用迁移平台。

## 错误与诊断

| `error.code`         | 含义                                                       |
|----------------------|------------------------------------------------------------|
| `INVALID_INPUT`      | 字段、ID、路径形态或 token 不合法；mutationId 请求不匹配   |
| `CONFLICT`           | 读取后被另一调用方/外部编辑器修改，或创建 ID 冲突          |
| `INVALID_STATE`      | 重复删除/恢复，或编辑回收站内容                            |
| `FORMAT_UNSUPPORTED` | 非本产品、未知或较新 schema，禁止写入                      |
| `UPGRADE_REQUIRED`   | 旧 schema 1/2/3/4 库，需要调用方显式升级，普通打开没有修改 |
| `UNSAFE_PATH`        | 符号链接或非预期文件/目录类型                              |
| `NOT_EMPTY`          | 新建目标已有数据，拒绝接管                                 |
| `BUSY`               | 活锁、异机锁、无法证实死亡，或回收时锁变化                 |
| `LOCK_UNCERTAIN`     | 空锁/异常锁，需诊断，未自动清除                            |
| `CORRUPT`            | 坏 JSON、缺权威文件、非法身份、损坏日志等                  |
| `RECOVERY_CONFLICT`  | 不符合日志前后状态的外部字节，或捕获/安装竞争              |
| `IO_ERROR`           | 底层写入、权限、刷盘或文件系统能力失败；`cause` 保留原错误 |

变更失败附 `mutationId`；正式意图发布后 `pendingRecovery: true` 表示 **可能已经发生部分提交**，不能向用户声称“完全没动”。发布前失败则为
`false`，只留下未执行的 staging。提交已完成但释放锁失败时附 `outcome: 'committed'`、`contentId` 和生成的 `mutationId`
，避免把成功创建当成失败后重新创建。保存此
ID，锁诊断处理后查询结果。坏的已发布日志仍阻止恢复，应保留整个库、事务和临时文件供诊断；本单元没有修复/强行解锁按钮。不要通过删日志、删锁或重建正文来“恢复”。

## 验证与承诺边界

```sh
node --test plugin-src/src/lib/file-library/test/*.test.mjs
```

测试使用真实临时目录，覆盖重开/整库移动、独立进程 stale token、真实活锁与死进程、空锁及回收/释放竞争、外部编辑、删除恢复历史、坏
JSON/缺正文/较新格式/路径逃逸、SIGKILL 后恢复、第三种字节保留、捕获/安装竞争、故障注入和幂等回执。`__testing.setHook` 只在
`NODE_ENV=test` 可设置，不属于业务对象能力。

Mac / POSIX 使用文件与目录 `fsync`、同卷 `rename` 和硬链接，`info.durability` 为 `process-crash/file-and-directory-fsync`
。Windows 路径保留文件 `fsync` 与原子发布；Node 无法刷盘目录时只对明确的平台错误 `EISDIR/EPERM/EINVAL/ENOTSUP/ENOSYS` 继续，
`EIO/ENOSPC/EACCES` 等仍失败，能力声明为 `process-crash/file-fsync`。两个声明只描述实现机制，不是断电硬件持久化保证；Windows
必须通过真实机测试才能验收。

入口允许 canonicalize 调用方选择的祖先路径，例如 macOS 系统 `/tmp`、`/var` 别名；库根本身不能是 link。打开后固定真实
root，库内目录与文件逐段 `lstat`，在平台支持时读/建文件带 `O_NOFOLLOW`，拒绝静态 symlink。Node 内置 API 不提供完整的
dirfd/openat 路径锚定： **不承诺抵御恶意进程持续替换祖先目录**。库应放在用户独占控制的本地目录。

普通外部编辑器与本模块不共享锁。捕获/独占安装避免检查到安装期间静默覆盖竞争字节，但编辑器持有旧文件描述符时仍可写入捕获文件；日志
before 快照保留原字节。提交后外部编辑仍是新的磁盘事实，读取会计算新 token。出现冲突时优先保留证据，不保证自动合并或不中断读取。

定向 I/O 测试覆盖 30 次编辑后冷启动与连续 read：已提交历史内容读取次数为 0；query 只读取目标事务的 intent 和
COMMITTED。列表仍读取全部当前内容，待恢复目录仍需枚举 staging；大规模内容列表、海量 staging、高频编辑与商业性能验收尚未完成，不将本次减少历史
I/O 等同于大库整体性能达标。

已验证范围仅当前 Mac 开发机临时目录、文件导入和进程崩溃，不等于断电/磁盘硬件持久化测试。Windows、网络盘、云同步盘、恶意路径替换、Electron
IPC/UI、WorkBuddy/Codex 真实生图接入、安装发行、大库性能及其余 P1 闭环尚未验收。

## 照片、提示词和资产接口

以下业务变更继续使用 `options = {mutationId?}`，更新、删除、恢复均提交读取时的 `editToken`。每种记录都有独立 ID、revision、时间和
deletedAt；正文仅在独立 Markdown 中。库内无通用路径或 registry 写接口。提示词保存在 `提示词/<id>/提示词.json` 与 `正文.md`
，照片保存在 `我的照片/<id>/照片.json`，模板元信息保存在 `模板/<id>/模板.json`。

| 方法                                                                                          | 输入与返回                                                                                               |
|-----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `importAsset(sourcePath, {purpose})`                                                          | 明确选择绝对普通文件路径；返回 `{assetHash, bytes, detectedType, decoded:false, purpose, originalName}`  |
| `readAsset(assetHash)`                                                                        | 重新校验 SHA256，返回 `{assetHash, bytes, detectedType, decoded:false, data:Buffer}`，不返回任意文件路径 |
| `createPhoto({title,assetHash,isOwnPhoto,originalName?}, options?)`                           | `isOwnPhoto` 必须明确为 boolean，这是用户声明，不是身份识别结果                                          |
| `updatePhoto(id, patch, token, options?)`                                                     | patch 只接受上列业务字段                                                                                 |
| `readPhoto(id)` / `listPhotos()` / `listPhotoTrash()`                                         | 返回照片元信息、assetHash、本人声明与 editToken                                                          |
| `trashPhoto(id, token, options?)` / `restorePhoto(...)`                                       | 只软删记录，不删被历史引用的资产                                                                         |
| `createPrompt({title,body,category?,when?,summary?,tags?,provenance?,builtinKey?}, options?)` | 返回公共字段及 prompt 业务字段，正文只在 `正文.md`                                                       |
| `updatePrompt(id, patch, token, options?)`                                                    | 同上业务字段；外部编辑 Markdown 会使旧 token 失效                                                        |
| `readPrompt(id)` / `listPrompts()` / `listPromptTrash()`                                      | 正常与回收站视图                                                                                         |
| `trashPrompt(id, token, options?)` / `restorePrompt(...)`                                     | 软删/恢复；builtinKey 在同一库内唯一，含回收站，重复 key 报 CONFLICT，不覆盖或复活                       |

purpose 为 `photo/material/template-reference/template-structure/generated-cover`。单文件最大 64 MiB，以 64 KiB 分块复制并计算
SHA256，源文件读前/后身份和时间戳不一致则停止。完整暂存刷盘后以独占 link 安装到 `资产/sha256/<前两位>/<完整hash>`；同 hash
已存在必须字节一致才复用。调用方文件名不参与库内路径，原名和角色只留在引用中。

类型只由字节决定，与源扩展名无关。支持 PNG/JPEG/WebP/GIF、PDF、UTF-8 文本；可明确解析为 JSON 的对象/数组规范识别为
application/json，Markdown/CSV/普通文本统一为 text/plain。SVG 仅在 template-structure
用途导入，仅作为原始结构说明，不执行；photo/template-reference/generated-cover 要求 raster 图片。`decoded:false`
明确表示只检查类型特征和完整原字节，未做像素解码、图片质量或人像识别。此旧导入接口保持 header
检测；真实生成回流走下面的任务提交接口，强制完整解码，视觉质量仍需人工确认。

资产先安装，引用后通过单对象事务提交；失败最多留下未引用资产/暂存，不宣称逻辑对象创建成功。首版不提供物理 GC，不删除历史
bytes。

## 模板不可变版本

| 方法                                                                      | 说明                                                                                                     |
|---------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `createTemplate({name,definition,resources,derivedFrom?}, options?)`      | 新 UUID 模板，初始版本 1；derivedFrom 为 `{id,version}`                                                  |
| `addTemplateVersion(id,{version,definition,resources},token,options?)`    | 新正整数版本，不覆盖旧版本；提交后成为 currentVersion                                                    |
| `selectTemplateVersion(id,version,token,options?)`                        | 只切换当前版本引用                                                                                       |
| `readTemplate(id,version?)`                                               | 返回元信息及直接字段 `name/version/packageHash/definition/resources`，省略 version 时读取 currentVersion |
| `listTemplates()` / `listTemplateTrash()`                                 | 返回元信息与 versions[]，不将缺失或损坏的已登记元信息当空模板                                            |
| `trashTemplate(id,token,options?)` / `restoreTemplate(...)`               | 隐藏/恢复元信息，不删除版本或历史资产                                                                    |
| `installBuiltinTemplate({id,name,version,definition,resources},options?)` | 专用稳定 builtin-* ID 安装；同 ID/version/packageHash 幂等，不同 hash 冲突；不覆盖、复活或改写旧版本     |

每个 `模板/<id>/版本/<version>/定义.json` 包只包含 `{definition,resources}`，资源映射为
`源标识 → {assetHash,bytes,detectedType,role}`。role 只允许 style/structure：style 只接受 PNG/JPEG/GIF/WebP；structure
接受这些图片、SVG、text/plain、application/json。PDF 可作普通资料，不能伪装为模板视觉样张。创建/读取/切换版本、绑定候选、登记发布均重新验证包
hash 及样张资产的存在、hash、bytes 和 canonical type。

definition 按调用方的有限 JSON 数据原样保存，包括旧 v3 来源、accepted、aiTested，不擅自提升验收结论。内置模板不能通过
addTemplateVersion 原地编辑；可显式创建 derivedFrom 克隆，内置新版本仅通过专用安装接口增添。

新模板先在父目录 staging 中完整刷盘未登记 marker，再原子发布正式 ID 目录，随后安装版本包，最后提交模板元信息。marker 严格绑定
ID/version/mutationId/packageHash。列表只跳过有效未登记 marker 下的孤儿包和明确 staging；缺元信息却无 marker 或 marker
损坏会拒绝。元信息存在时优先校验元信息；清 marker 失败不否定已提交结果。失败可留下诊断孤儿，稳定内置 ID 可以用同包重试，不覆盖不同包。

## 内容资料、封面与人工发布

| 方法                                                                                                          | 说明                                                                                                    |
|---------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `attachContentMaterial(id,{assetHash,originalName,role?},token,options?)`                                     | 新建 materials[] 项，返回内容记录；条目 id 即 materialId                                                |
| `removeContentMaterial(id,materialId,token,options?)`                                                         | 移除引用，保留原资产与历史                                                                              |
| `registerContentCandidate(id,{assetHash,requestId,attemptId,template?,source?,originalName?},token,options?)` | 登记 candidates[] 项，条目 id 即 candidateId，accepted 初始 false；template 为 `{id,version}`           |
| `selectContentCover(id,candidateId,token,options?)`                                                           | 用户显式选定，设置 selectedCover 并记录该候选的人工接受时间                                             |
| `savePublicationPlan(id,{id?,channelId,scheduledAt,timezone},token,options?)`                                 | 无 id 时新建稳定 plan ID，有 id 时改期；同内容可多渠道、多次计划                                        |
| `cancelPublicationPlan(id,planId,token,options?)`                                                             | 只可取消 planned 项；已发布计划不可改、不可取消                                                         |
| `recordPublication(id,{planId,publishedAt,timezone,url?},token,options?)`                                     | 仅人工登记；先安装不可变快照，再在同一内容事务中更新计划与 publications[]                               |
| `readPublication(id,publicationId)`                                                                           | 返回 `{snapshot,body,bodyBytes:Buffer,cover,template}`；校验快照 hash、正文原 bytes 及固定资产/模板引用 |

上表 scheduledAt/publishedAt 是兼容入口：UTC ISO Z 入库规范为毫秒 ISO；timezone 使用 IANA 名称。新入口使用下文三精度
schedule。channelId 使用稳定字母/数字/点/下划线/短横线标识。发布 URL 仅 HTTP (S) 且拒绝内嵌用户名/密码。

发布快照在 `内容/<id>/发布快照/<publicationId>/` 中包含 `快照.json` 和原字节 `正文.md`；固定标题/修订、计划、发布时间、封面
assetHash 和模板版本/packageHash。后续改稿、换封面、删除照片/模板记录均不改历史。快照先安装、引用后提交，故障可能留无引用快照，不产生假发布事实。它不调用外部平台，不代表已执行自动发布或实际生图。

扩展元信息在业务层校验每个条目、ID 唯一性、当前模板版本、候选/selectedCover 的内容归属、计划/发布对应关系；伪造选择、null/重复条目会拒读和拒写。事务校验禁止
content schema 2 倒退到 1；trash/restore 只允许 revision/updatedAt/deletedAt 变化，不能夹带正文或其他业务字段变化。

## 真实封面任务文件核心

`createCoverRequest(contentId, input, editToken, options?)` 固定输入并返回 `{content, request, bodyBytes}`；
`request.requestId` 和 `request.requestHash` 是后续交接的唯一身份。`input` 必须完整给出：

```js
{
  template: {id: '模板ID', version: 1},
  styleAssetHashes: ['本次选入该模板版本的style样张SHA256'],
  photo: null, // 或 {id, assetHash}；该照片必须 isOwnPhoto:true
  materialIds: [],
  prompt: '用户实际选择的提示文字',
  pixels: {width: 1200, height: 1600}, ratio: '3:4',
  count: 10, outputFormat: 'png', scope: 'cover-only'
}
```

尺寸非空、正安全整数、上限四千万像素，ratio 必须与尺寸精确一致；count 为 1–20，格式只允许 png/jpeg/webp。可选 `sizePolicy` 为
`exact` 或 `ratio-minimum`。省略或显式 `exact` 都规范化成原 v1 请求（不保存策略字段，原 inputHash 和幂等行为不变），按精确显示宽高验收。
`ratio-minimum` 保存为 v2 请求并参与 inputHash/requestHash：pixels 表示最小显示宽高，结果须严格同比例且每一维达到最小值，
例如 900×1200 接受 1086×1448；比例使用整数交叉乘精确比较。创建和读取请求均检查尺寸、比例和策略版本配对，旧 v1 核心拒绝 v2 请求，
库 schema 5 与内容元数据版本不变。历史请求、产物和归属保持原样。模板样张人物不作为本人身份来源；必须明确传
photo:null 才表示这次不放人物。协议 `nova-cover-execution`、版本 1、appScope `nova-content-hub` 由核心固定。内容标题、正文原字节
hash、模板版本/packageHash/definition、本次选入样张、本人照声明引用、选入资料与提示都进入固定包；图片和资料原字节复制到包内。GUI
可默认整组，但核心只要求选入非空、唯一且属于该准确模板版本的 style 样张；未选择样张及结构资源不自动发送给宿主。相同固定输入重用既有
request，重试或换宿主须新建 attempt；变化输入新建 request。

| 方法                                                                                   | 返回与约束                                                                                                                                                                                                                                 |
|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `inspectCoverInput(contentId, input, editToken)`                                       | 只读准备，返回 `{contentId,title,bodyHash,editToken,inputHash,existingRequest}`；核对当前 token、标题/正文、准确模板版本和全部选入资源，existingRequest 为 `{requestId,requestHash}` 或 null；既有包也重核原字节与归属                     |
| `findCoverRequest(contentId, {inputHash,title,bodyHash})`                              | 按已持久化的准备指纹只读核验，返回 `{content,request,bodyBytes}` 或 null；title/bodyHash 必须仍与当前原始标题/正文一致，否则 `STALE_INPUT`，不能当作 missing；仅元数据变化允许 token 不同，content 是最新投影；重复 inputHash 或损坏包拒读 |
| `createCoverAttempt(contentId, requestId, {host,reason?}, options?)`                   | `{content,attempt,handoff,inbox}`，host 仅 codex/workbuddy；新 attempt 在一笔内容事务中只 supersede 同 request 的旧活跃 attempt，不影响其他尺寸的 request；交接包 sourceAttemptId 保存接续来源，不表示恢复聊天                             |
| `readCoverContext(contentId, requestId, attemptId)`                                    | `{content,request,attempt,handoff,body,bodyBytes,inbox,inputs}`；inputs 含 role/assetHash/bytes/detectedType/path。paths 全由绑定库根推导，读取会重核包与输入字节                                                                          |
| `claimCoverAttempt(contentId, requestId, attemptId, {host,readAssetHashes}, options?)` | `{content,attempt}`；核对全部输入 hash 声明和宿主归属，状态只变为 claimed。声明本身不证明宿主真正看过图                                                                                                                                    |
| `await commitCoverAttempt(contentId, requestId, attemptId, receipt)`                   | `{content,attempt,candidateIds}`；receipt 可传原始 Buffer 保留精确 JSON 字节或对象；核心独立校验，不接受调用方 report                                                                                                                      |
| `failCoverAttempt(contentId, requestId, attemptId, {code,message}, options?)`          | `{content,attempt}`，只结束对应活跃 attempt                                                                                                                                                                                                |
| `cancelCoverAttempt(contentId, requestId, attemptId, options?)`                        | `{content,attempt}`，已取消/失败/superseded/committed 不再提交                                                                                                                                                                             |

回执严格字段为 `{libraryId,contentId,requestId,attemptId,requestHash,resultId,files:[{name,sha256}]}`，resultId 为
UUIDv4，sha256 为文件原字节 hash。只接受固定 inbox 内 basename，拒绝 URL、绝对路径、穿越、Windows 保留名、symlink
和未知字段；不能传任意路径、报告或 decoded:true。每图最多 64 MiB，整批最多 512 MiB。核心把稳定原字节复制到不可变收件现场，再按同一
bytes 做 PNG/JPEG/WebP magic 筛选和 sharp strict `failOn:warning` 全量 raw 像素解码，拒绝动画、截断和错误格式；按 EXIF
方向核对显示尺寸，不缩放、不重编码原文件。输出报告固定实际 format/width/height/hash/bytes/decoded:true，缺少 decoder 则
`DECODER_UNAVAILABLE`。

打开句柄绑定根目录 dev/ino，同 libraryId
的克隆目录也不能在调用中替换当前根；移动后须显式重开。核心先在短锁中核对身份、固定包和幂等回执，然后释放锁复制并顺序解码；最终私有业务变更在同一既有同步库锁中读取最新内容，重核
claim/活跃 attempt、标题、正文 hash、包完整性，安装全部资产与报告后，复用原 finite content 事务一次登记全部候选及 committed
状态。不会因 claim 或其他元信息 revision 改变而误报正文过期。解码期间修改输入报
STALE_INPUT；取消、重试、换宿主后的迟到收件保留但不登记。失败不部分登记候选；资产先安装、事务前崩溃可能留下未引用资产，重试可复用。相同原始回执
bytes 幂等返回既有候选，即使 inbox 源文件已删除；已 committed 的同 attempt 不同回执报
RECEIPT_CONFLICT；技术验证失败仅保留对应回执/失败报告，attempt 仍为 claimed，可修正问题重交，或显式 fail/cancel/新建
attempt。技术通过不会自动选封面或将 accepted 设为 true。

```text
内容/<contentId>/封面任务/<requestId>/
  请求.json / 正文.md / 输入/<assetHash>   # 不可变固定包
  尝试/<attemptId>/
    交接.json                            # 不可变
    inbox/<用户交回的basename>            # 不可信收件入口
    收件/<receiptHash>/
      回执.json / 图片-<index> / 校验报告.json
      拒绝-<reportHash>.json              # 失败或迟到诊断，保留现场
```

唯一可变任务真源在内容 `coverJobs` 引用和有限状态内；不另建任务 registry 或 journal。候选和 selectedCover 历史不因新任务清除。库
3→4 显式升级先恢复旧 pending、备份 schema3 descriptor、持久创建 `事务/升级到4/` 屏障，最后发布 descriptor4 并保存完成标记；旧
schema3 writer 即使误换回 descriptor3，也因不认识屏障而拒写。升级阶段可重入，内容 schema 不倒退；备份仍仅是根描述文件，不提供安全降级。

`node --test plugin-src/src/lib/file-library/test/*.test.mjs` 包含正常整批、失败矩阵、真实解码/EXIF、稳定收件、解码期间状态竞争、幂等与 SIGKILL
后恢复证据。当前实测是 macOS 开发机上的核心文件能力；不代替 Windows、两个宿主真实看图/生成、Electron、正式授权、安装/升级发行、断电和商用性能验收。

## 整库备份、核验与安全恢复

```js
import { backupLibrary, verifyBackup, restoreBackup } from './plugin-src/src/lib/file-library/index.mjs';
const saved = backupLibrary('/Users/me/Documents/内容库', '/Volumes/Backup/2026-10-17');
const checked = verifyBackup(saved.backupDir);
const restored = restoreBackup(saved.backupDir, '/Users/me/Documents/恢复的内容库');
```

三个同步业务入口供桌面主进程或 CLI 使用；大库应放到 worker，避免阻塞界面。精确目标目录必须不存在，空目录也拒绝；父目录必须存在。恢复不修改原库和备份，不替换现有目录，不自动启动
Codex、WorkBuddy 或生成任务。没有 ZIP、云同步、续传、自动重试或自动清理失败现场。

新建备份支持当前 schema 5；verify/restore 继续接受上一版 schema 4 备份。它拿现有全库锁，但 **不调用 openLibrary、不执行
pending 恢复**。除精确的 `系统（别动）/库锁` 外，整棵树均保留：正文原始字节（BOM、CRLF、末尾换行均不改）、软删对象、资产、模板版本、任务请求/交接/inbox/回执/校验报告、发布快照、所有
pending/history/升级备份/staging/孤儿、未知用户文件和空目录。HTML、脚本、未知文件只当作字节，不执行。封面解码在锁外运行，captured
图片及拒绝报告落盘经过短库锁，所以备份与核心持久写互斥；遇到 `BUSY` 不会把活跃任务自动标记失败。

备份目录协议固定为：

```text
manifest.json                 # nova-content-library-backup / schemaVersion 1
entries.ndjson                # 有序、无重复、逐行规范 JSON 条目
data/                         # 库全树，仅排除库锁
COMPLETE.json                 # 最后独占 link 发布，绑定 manifestHash + entriesHash
```

实际根目录只允许 `manifest.json`、`entries.ndjson`、`data/`、`COMPLETE.json` 四项。条目为 `{path,type:'directory'}` 或
`{path,type:'file',bytes,sha256}`，path 为规范 `/` 分隔相对路径；NDJSON 逐行解析，单行最多 64 KiB。manifest 包含 `backupId`
、来源 `libraryId/schemaVersion`、起止时间、工具版本、系统、唯一排除路径、计数和 entriesHash。SHA256 用于完整性检查，不是来源签名。

`consistency: 'stable-verified-copy'` 表示：锁内盘点，按块复制与 SHA256，文件在打开前/句柄上/路径上核对
dev/ino/size/mtime/ctime，目录成员与身份复扫，源全树再次流式算 hash，目标也复验；最后重核 descriptor 原字节和库根身份。它是普通文件系统的稳定观测，
**不是操作系统原子快照，也不隔离恶意同权限进程**。外部 Markdown 编辑器和 host inbox 不遵守库锁，观测到变化会报
`SOURCE_CHANGED` 并留下未完成目标，换新的目标目录重做。备份/恢复路径所有祖先和树内都拒绝符号链接；仅接受普通文件/目录，拒绝
Windows 设备名、尾点空格、控制字符、反斜杠、绝对/越界路径以及大小写/Unicode 规范化冲突，不擅自改名或跳过。

`verifyBackup` 严格检查根布局、manifest/seal/descriptor 身份和 schema、条目顺序/唯一性、真实全树的缺失/额外成员、字节数与
SHA256；不拿源库锁，也不恢复任何业务事务。缺完成标志的包不能恢复。

恢复先核验包，再复制到 **目标卷**独立 staging 并复验；仅在 staging 内恢复 pending：有 COMMITTED 的只归档，未完成的按既有
before/after 引擎恢复，第三种字节立即停止。随后检查对象、资产/模板引用、任务请求/交接/已提交回执/报告、发布快照与全部历史事务；历史逐笔读取，不把所有历史正文同时载入内存。所有
created/claimed 尝试（包含软删内容）在 staging 内通过受限 `restore-interrupted` 事务改为 failed/`RESTORED_INTERRUPTED` 并清空
activeAttemptId；保留所有 ID、既有 committed 候选和 before 历史，不临时恢复/删除软删内容。`系统（别动）/恢复来源/<uuid>.json`
绑定 backupId/treeHash、恢复的 mutation、打断的 attempt 与新增 mutation。

恢复保持备份原 schema：schema 4 不创建 workspace/collection、不写内容4或事务3，返回 `schemaVersion:4, upgradeRequired:true`
；普通 open 仍拒绝，必须显式 `upgradeLibrary`。schema 5 返回 `upgradeRequired:false`。

最后 `mkdir` 独占最终目标，文件逐项 O_EXCL 复制并全树核对，`内容库.json` 最后经 fsync + 独占 link 发布，作为可 open
的边界；不用可能接管空目录的 exists + rename。发布前失败的目录没有 descriptor，不能当作已恢复库。完成标志或 descriptor
发布后的刷盘/清理错误带 `outcome:'committed'`，调用方须展示明确状态；失败目录和 staging 保留用于诊断，不自动续传。返回的
`interruptedAttempts`、`recoveredMutations` 是数组；备份/核验结果另含 manifest/counts，核验含 `verified:true` 和 treeHash。

文件与目录刷新沿用核心现有策略：Windows Node 无法 fsync 目录句柄时，只声明进程崩溃与文件 fsync 级别，不能据 macOS 的目录刷盘结果宣称
Windows 掉电安全。跨卷复制算法可用，但未在真实第二卷和 Windows 主机上验证；macOS 合成临时库测试不代表
Windows、Codex/WorkBuddy 实机四组合验收。

## schema 5 可携带配置与内容增量

所有下列写入仍使用读取时的 `editToken` 与可选 `{mutationId}`；返回完整对象与新 token，不接受任意 JSON patch 或文件路径。
`库配置/default/配置.json` 是唯一 workspace（id=`default`）；`合集/<uuid>/合集.json` + `正文.md` 是独立 collection。

| 方法                                                       | 有限输入                                                                                                                                                                                                                                 |
|------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `readLibrarySettings()`                                    | 返回 profile/defaults/channels/promptCategories/customRatios；附只读投影 `defaultIssues` 与 `visiblePromptCategories`                                                                                                                    |
| `updateProfile(patch,token,options?)`                      | `name/intro/avatarAssetHash/marks:[{key,value}]`；头像 null 或真实 raster 资产 hash                                                                                                                                                      |
| `setGenerationDefaults(patch,token,options?)`              | `photoId/templateId/coverCount`（1–20）；设置时核对 active 本人照与模板；null 表示无默认                                                                                                                                                 |
| `restoreGenerationDefaultReferences(input,token,options?)` | 仅恢复已有 photoId/templateId（均须显式给出，允许 null）与可选 coverCount；source 必填 `{source,originalId?,note?}`；允许已软删/本人声明已撤销引用，拒不存在 ID；不提高本人声明、不复活、不改变资产可用性；source 参与事务 requestDigest |
| `createChannel(input,token,options?)`                      | `name,ink?,bg?,requiredRatio?`；生成 `channel-<uuid>`，颜色为 #rrggbb，比例 null 或正整数 width:height                                                                                                                                   |
| `updateChannel(channelId,patch,token,options?)`            | 同上字段，ID 不变；不能编辑软删渠道                                                                                                                                                                                                      |
| `trashChannel/restoreChannel(channelId,token,options?)`    | 只改变 deletedAt；旧计划与快照仍可读                                                                                                                                                                                                     |
| `setPromptCategories(categories,token,options?)`           | 有序、唯一、非空字符串；保留空分类；显示分类为此目录与当前未删除提示词分类并集                                                                                                                                                           |
| `addCustomRatio/removeCustomRatio(ratio,token,options?)`   | 约分存储，例如 6:8 → 3:4；去重                                                                                                                                                                                                           |
| `setPromptEnabled(promptId,enabled,token,options?)`        | enabled 与软删除分离，旧提示词编辑后默认 enabled:true                                                                                                                                                                                    |

正常设置仍严格要求 active、available 本人照/模板；导入旧来源的已失效默认引用必须用专用
restoreGenerationDefaultReferences，不能临时伪设本人声明或复活对象。默认 photoId/templateId 失效时不改选，`defaultIssues` 含
`{field,id,reason:'missing'|'trashed'|'unavailable'|'ownership-revoked'}`。用户撤销本人声明仍保留引用。配置默认值仅影响将来的
GUI 输入，生成请求依然逐次明确固定。profile.marks 保留有序 `{key,value}` 数组，允许相同 key 的不同记录。内置五渠道 ID 为
douyin/xiaohongshu/wechat-channels/wechat-official/bilibili；比例 3:4/1:1/3:4/47:20/16:9
是产品可编辑初值，未核实为平台强制像素要求。host/showSample/motion/最近库路径、安装/信任/授权演示状态不进入 workspace。

## 导入照片的可用状态

`createUnavailablePhoto({title,isOwnPhoto,originalName?,source,reason},{mutationId}?)` 同步创建照片 schema2：
`availability:'unavailable',assetHash:null`。source 必须是有限来源 `{source,originalId?,note?}`，reason 是非空文字；本人声明必须明确
boolean。照片目录仍是唯一真源，正常 read/list/update/trash/restore 均支持缺文件照片。`readPhoto/listPhotos/listPhotoTrash`
为 schema1 返回 `availability:'available'` 读取投影，不改 schemaVersion、元数据原字节或事务历史；queryMutation 保留旧历史返回形状。

`await resolvePhoto(photoId,{assetHash},token,{mutationId}?)` 在库锁之外用 [导入栅格校验](../image-validation/README.md)
完整解码已导入资产，再在短事务内重新校验 token 和资产 hash。只接受 schema2 unavailable；保留原 ID、标题、本人声明、来源、缺失原因和
deletedAt，包括仍在回收站的照片，不自动恢复或设默认。使用独立 resolve-photo 事务操作，mutationId 重试返回原历史结果。schema2
的 updatePhoto 只改描述/本人声明，不能借 assetHash 绕过完整解码。旧 createPhoto/updatePhoto 的 schema1
同步收件语义保持兼容；浏览器导入必须使用 unavailable→resolve 路径。

不可用照片不能设为正常生成默认项，createCoverRequest 明确拒绝它；不会等 null hash 在深层偶然失败。备份恢复不遍历
unavailable 的 null 资产，但对 available 校验真实原文件。schema4 恢复拒绝 photo2 元数据及 pending/history 中的任一
before/after photo2；pending 在恢复写入前拒绝。静态封面结果的 validateImage receipt 协议未放宽。

## 资料和缺失引用的软删除

`trashContentMaterial/restoreContentMaterial(contentId,materialId,token,options?)` 与
`trashCollectionMaterial/restoreCollectionMaterial` 保留真实资料 ID、资产与字段，只改变条目可选 deletedAt；缺字段或 null 为
active。`trashContentUnavailableReference/restoreContentUnavailableReference(contentId,referenceId,token,options?)` 与
Collection 对应方法对缺失引用提供同样状态。新内容变更升级到 content schema4；旧 removeMaterial 仍按原语义移除数组条目。正常读取保留完整数组，由
deletedAt 区分状态，无额外目录或照片副本。

补齐一个已回收引用保留其 deletedAt。引用与补齐后的真实 material 各自恢复；任意一方仍被回收，资料不能用于新
createCoverRequest。已回收 candidate 引用不能再设为当前选图、规格或发布封面；历史请求/发布快照仍按原 bytes/hash
读取，纠正文案保留原冻结封面的语义不变。

`createContent/updateContent` 另接受 `recordedDate/plannedDate`（严格 YYYY-MM-DD 或 null）、`preferredTemplateId`（ID 或
null）、`channelIds`（active 渠道 ID 数组）、`isExample`（boolean）。createdAt 仍为本文件对象建立时间。基础正文独立，不从渠道文案拼接。

`createCollection({title,body,dateRange?,channelIds?},options?)`、`readCollection(id)`、
`updateCollection(id,patch,token,options?)`、`listCollections/listCollectionTrash()`、
`trashCollection/restoreCollection(id,token,options?)`。dateRange 固定 `{start,end}`，两端日期或 null，已知起止不得倒置。
`setCollectionMembers(id,contentIds,token,options?)` 只接受未删除内容，不支持嵌套合集；成员不复制正文/候选/任务。active
合集成员必须先移出才能删除；恢复合集前先恢复其成员。

## 规格、旧批次与不可用引用

下列 `Content` 名称也有一组固定 `Collection` 对应方法；除明确列出的别名外不接受任意类型参数。

| 方法                                                                                      | 有限输入                                                                                                                                                                             |
|-------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `saveContentCoverVariant(id,input,token,options?)`                                        | `id?`（更新时指定）、`name/ratio/preferredTemplateId?/selectedCandidateId?`；新规格默认无选图；别名 `saveCoverVariant`                                                               |
| `removeContentCoverVariant(id,variantId,token,options?)`                                  | 被计划引用时拒绝；清除候选的该规格归属，保留资产                                                                                                                                     |
| `selectVariantCover(id,variantId,candidateId,token,options?)`                             | 改该规格选图并记录候选 accepted；主 selectedCover 独立；合集名为 selectCollectionVariantCover                                                                                        |
| `updateContentCandidate(id,candidateId,patch,token,options?)`                             | 仅 `variantId/favorite/displayNumber/note/provenance`；provenance 固定 null 或 `{source,originalId?,note?}`；别名 updateCandidate                                                    |
| `setCandidateFavorite(id,candidateId,boolean,token,options?)`                             | 内容候选收藏便利入口                                                                                                                                                                 |
| `addContentUnavailableReference(id,input,token,options?)`                                 | `{kind:'material'                                                                                                                                                                    |'candidate'|'template-image',originalId,reason,originalName?,provenance?}`，保存明确 unavailable，不造假 hash |
| `resolveContentUnavailableReference(id,referenceId,{assetHash,template?},token,options?)` | 明确补文件；candidate/material 沿用引用 ID 建真实对象；模板图只保存已补资产，须另行安装真实模板版本；保留原来源、原ID、原因与 available/assetHash/resolvedObjectId                   |
| `saveContentImportedCoverBatch(id,input,token,options?)`                                  | `candidateIds` 必填，另接 `displayNumber/date/templateGroupId/referenceCandidateIds/originalStatus/provenance`；候选必须属于本对象或其不可用候选引用；只追加历史批次，不创造运行任务 |

不可用候选 ID 可作为规格历史选图保留，但 select/发布解析必须能找到真实候选和资产，否则失败；不能作为真实生成输入。旧模板仅组
ID 的批次保持版本未知。Collection 另提供
`attachCollectionMaterial/removeCollectionMaterial/registerCollectionCandidate/selectCollectionCover`，输入和内容版本一致；没有为合集伪造
coverJobs。

## 独立渠道文案、时间精度与发布 v2

新计划 `savePublicationPlan(id,{id?,channelId,text,schedule,coverChoice?},token,options?)` 必须明确传
text（空字符串也是事实）；channelId 必须在配置中 active。coverChoice 为 null、`{variantId}` 或 `{candidateId}`；默认沿用该计划选择，新计划为
null；现代 `textMode:'explicit'` 计划的 null 表示这次不记录封面，不继承主 selectedCover；旧 `textMode:'body'` 或尚未规范化的旧计划保留主封面回退。规格选择在发布时解析到具体候选，不冻结可变规格引用代替具体图。更正未传 coverChoice 保留旧实际封面，明确 null 则不记录封面。

```js
{ precision:'date', date:'2026-10-18' }
{ precision:'local-minute', date:'2026-10-18', time:'19:00', timezone:null }
{ precision:'instant', at:'2026-10-18T11:00:00.000Z', timezone:'Asia/Shanghai' }
```

local-minute 的 timezone 也可为明确 IANA 名称；null 不套当前机器时区，date 不补午夜。兼容旧 `{scheduledAt,timezone}`
输入，规范化为 instant 并保存 `textMode:'body',text:null`，继续引用基础正文。原 schema4 计划原样保留至用户编辑；新式编辑后
`textMode:'explicit'`。兼容入口允许未登记旧渠道；快照渠道名缺证据时 nameStatus:'unknown'，不杜撰名称。

`recordPublication(id,{planId,schedule,url?},token,options?)` 与兼容 `{publishedAt,timezone}` 入口只登记 planned 项。快照
schema 2 固定基础正文原字节、正文/内容元信息知识状态、独立 `publicationText:{status:'known',text}`、渠道 ID
与当时名称、计划/发布精度、具体 cover/hash/template version/packageHash。`readPublication` 返回
snapshot/body/bodyBytes/cover/template，v2 另返回 publicationText。旧 v1 快照继续原字节/hash读取，不重写。

`correctPublication(id,publicationId,{reason,text,schedule,url?,coverChoice?},token,options?)` 追加新不可变快照和
corrected 事实，默认保留旧基础正文、旧渠道名称、旧具体封面；只有明确 coverChoice 才换图。
`retractPublication(id,publicationId,{reason},token,options?)` 追加 retracted 事实并使计划重新 planned；可重新登记发布。旧
publications[]、旧快照、原 hash 均不改。每个发布仅能追加一次终结事实，重复更正/撤销拒绝；publicationEvents
为固定有限字段，无通用事件接口。合集对应
`saveCollectionPublicationPlan/cancelCollectionPublicationPlan/recordCollectionPublication/readCollectionPublication/correctCollectionPublication/retractCollectionPublication`。

为导入提供两个有限入口 `recordHistoricalPublication` 与 `recordHistoricalCollectionPublication`，输入
`{planId,schedule,publicationText,cover,source}`（url/channelName 可选）：publicationText 为明确已知 string 或
null（unknown）；cover 必须显式 null 或 `{candidateId}`，后者只解析已经登记的具体候选，不读当前规格/主选图。source 为 null 或有限
provenance；历史渠道名称只有显式 channelName 才标 known，缺失不读取当前名称；旧选图时间无证据时 selectedAt:
null/selectedAtKnowledge:unknown。历史基础正文与标题/修订证据缺失时固定 `baseTextKnowledge/contentKnowledge:'unknown'`
，正文快照为空 bytes，读取 body:null；不会拿当前正文、当前文案或当前选图补成历史事实。该接口只保存给定证据，不实现浏览器备份读取、ID映射、任意路径读取或脚本执行。

## schema4 → 5 升级与验证边界

受控恢复流程使用完整固定身份；升级仅支持 schema 4 → 5，原无 options 的 1/2/3/4 升级 API 保持兼容：

```js
const pins = {
    expectedLibraryId: approvedLibraryId,
    expectedRootIdentity: {dev: approvedDev, ino: approvedIno}, // 十进制字符串
    expectedDescriptorHash: approvedSchema4DescriptorSHA256
};
backupLibrary(sourceRoot, newBackupDir, {...pins, allowSchema4: true});
// 恢复后的新目录必须重新取得该目录的 dev/ino，保留原 schema4 描述文件 hash。
const proof = inspectLibraryUpgrade(restoredRoot, restoredPins);
const upgraded = upgradeLibrary(restoredRoot, restoredPins);
```

两个 options 对象都封闭：缺字段、额外字段均拒绝；backup 的 `allowSchema4` 必须明确为 `true`。没有 options 的 backup
仍只接受 schema5；有完整 options 的 backup 仅接受 schema4/5。backup 不恢复 pending、不升级、不改业务文件，只使用协调锁并稳定复制。
升级在拿锁前后、恢复循环、模型初始化、原字节备份、描述文件及完成标记发布前后反复检查根 dev/ino、libraryId 和描述文件 hash。
schema4 原字节保留在 `系统（别动）/内容库.schema4.bak.json`；升级后的继续操作仍传原 schema4 hash，不能换成 schema5 hash。

`inspectLibraryUpgrade(root, pins)` 只读，不拿锁、不恢复、不写文件，返回
`{libraryId, schemaVersion, descriptorHash, upgradeComplete, upgradeRequired}`。`descriptorHash` 是当前描述文件 hash。
schema5 必须与原备份字节精确推导出的 schema5 描述文件一致、原备份 hash 匹配批准的 schema4 hash，并存在升级屏障；
只有 `完成.json` 内容及默认 workspace 元数据均合法时才返回 `upgradeComplete:true`。描述文件已发布、完成标记缺失时返回
`schemaVersion:5, upgradeComplete:false, upgradeRequired:true`，必须显式继续升级。相同 libraryId 的替换克隆、无原备份证明的
其他 schema5 库、原备份改变或完成后回退描述文件均拒绝。

这些是路径检查与操作边界复核，不是原子目录句柄保护；仍有系统调用之间的替换窗口和 inode 重用限制。身份发生冲突时，
清理不会穿过已改变的固定身份删除锁，可能保留需人工检查的锁或未完成文件；不得按时间递归清锁。

专用升级拿锁、恢复 pending、保留 `系统（别动）/内容库.schema4.bak.json` 原字节、持久建立 `事务/升级到5/` 旧 writer
屏障，再独占发布缺失的固定 workspace 配置与合集目录，最后发布 descriptor5。现存内容、历史 intent、模板版本、发布快照不重写。中断后显式重入；旧
schema4 writer 在 descriptor5 或 descriptor4 + 新屏障时都拒写，不能把描述文件回退当降级方案。

`model-v5.test.mjs` 使用真实旧提交 df55c5f 的 v4 模块、真实临时资产、六个升级阶段 SIGKILL、旧 writer
拒写、两渠道不同文案/规格、三个时间精度、不可用引用、收藏、合集、停用/软删、追加更正撤销及 schema4/schema5 backup
roundtrip。Windows/macOS 两宿主、Electron、browser-import、安装发行与远端生图仍须独立验收。
