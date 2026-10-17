# 本地文件库：内容 CRUD 首个单元

纯 Node ESM、零新增依赖，供后续 Electron **主进程**和 CLI 共用。已包含内容、资产、照片、提示词、模板版本、候选封面、人工计划和人工发布快照；尚未接入 renderer、真实生成任务或外部发布。这不是完整 P1，也不是 Electron 发行验收。Node 20.11+。

```js
import { createLibrary, openLibrary, upgradeLibrary, LibraryError } from './file-library/index.mjs';

// 传绝对本地路径，父目录必须存在；库根本身和库内路径不允许符号链接。
const library = createLibrary('/Users/me/Documents/自媒体内容库');
const content = library.createContent({ title: '一篇文章', body: '# 正文\n' });
const edited = library.updateContent(content.id, { title: '新标题' }, content.editToken);
const trashed = library.trashContent(edited.id, edited.editToken);
library.restoreContent(trashed.id, trashed.editToken);
const reopened = openLibrary('/Users/me/Documents/自媒体内容库');
```

## 接口与返回

所有函数同步执行，会抛出 `LibraryError`；Electron 应在主进程合适的执行上下文调用，不能向 renderer 暴露通用文件或 shell 权限。

| 接口 | 含义 |
| --- | --- |
| `createLibrary(root)` | 只接受不存在或为空的目录；不接管已有非空目录 |
| `openLibrary(root)` | 校验身份、路径、内容，先恢复未完成事务；整库移动后以新路径打开 |
| `upgradeLibrary(root)` | 显式将旧 schema 1/2 库升级为 schema 3，支持中断后重入；已经是 schema 3 时幂等打开 |
| `library.info` | 冻结的打开时身份快照：`format/schemaVersion/libraryId/createdAt/root/durability`；root 为祖先路径解析后的真实位置，操作会重新核对磁盘身份 |
| `listContents()` / `listTrash()` | 按 ID 排序的当前内容 / 已删除内容数组 |
| `readContent(id)` | 读取内容；可读取回收站中的内容 |
| `createContent({title, body}, options?)` | 创建稳定 UUID v4 内容 ID |
| `updateContent(id, {title?, body?}, expectedToken, options?)` | 非空补丁，只接受这两个字段；不能编辑已删除内容 |
| `trashContent(id, expectedToken, options?)` | 设置 `deletedAt`，不搬目录、不删正文 |
| `restoreContent(id, expectedToken, options?)` | 清除 `deletedAt`；重复删除/恢复报 `INVALID_STATE` |
| `queryMutation(mutationId)` | 先恢复后返回 `{mutationId, status: 'committed', content}`；未知 ID 返回 `null` |

内容返回：`format/schemaVersion/id/title/revision/createdAt/updatedAt/deletedAt/body/editToken`。变更结果另带 `mutationId`。标题保留调用方原字符串，必须非全空白且不超过 500 个 JS 字符；正文可为空。目录名只使用内部生成的 ID，标题不成为路径。

`editToken = SHA256(SHA256(元信息原字节) || SHA256(正文原字节))`，其中两段内部哈希是各 32 字节。它包含正文和元信息的原始字节，外部 Markdown 编辑或仅 JSON 格式变化都会让旧 token 失效。单纯改标题会保留正文原字节，包括 CRLF；`body` 返回 UTF-8 字符串。

`options` 只接受 `{mutationId: UUIDv4}`。调用前由调用方生成并保留 ID，可以解决提交后进程退出/响应丢失的不确定性。同一 ID、同一请求重复调用返回**该次提交的历史快照**，不会再提交；请求不同则报错。旧 token 的幂等重试也可返回原提交结果，不会覆盖其后的编辑。未提供时由库生成 ID，失败后可从异常的 `mutationId` 获取。

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

根描述文件 `内容库.json` 的 `schemaVersion` 现在是 **3**。旧内容元信息 schema 1 仍可读写；首次使用资料/候选/计划/发布功能的那条内容才更新为 schema 2。新事务意图 schema 2 仅允许 content/prompt/photo/template 四种内部类型；旧 schema 1 意图严格映射为 content，共用相同捕获/安装/恢复引擎，历史原字节不重写。

每次读取/变更都拿全库 `mkdir` 锁，锁内重读身份并先恢复事务。仅同机且 `kill(pid, 0)` 明确返回 `ESRCH` 的持有者可回收；活进程、PID 复用、权限未知、异机持有者一律不按年龄抢锁。回收只删除精确旧 token；`unlink` 失败（包含 `ENOENT`）立即停止，只有删除成功者才尝试非递归 `rmdir`。释放也只删除自己的 token。空锁保留并报诊断，不能靠超时猜测它是否安全。

意图日志先写入明确命名的 staging 目录，完整写入并刷盘后，才以目录 rename 原子发布为正式 UUID 事务；发布前绝不动权威文件。中断留下的 staging 保留且不参与恢复，调用方可用相同 mutationId 重试；**正式事务中的坏意图仍拒绝恢复**。日志不接受路径指令：目标只能由已校验的有限 kind 与对象 ID 推导为固定文件集（content/prompt 各两个文件，photo/template 各一个文件），并检查产品格式、版本、字节哈希、revision 和状态转换。每次恢复先检查该 kind 的**全部**目标；遇到既非 before 又非 after 的第三种字节，保留日志/文件，停止自动写入。

替换时先将目标 `rename` 捕获到事务目录，重新读取捕获字节与 before 对比；不同则保留捕获现场并报冲突。新字节先写入同卷临时文件并刷盘，再以 `link` **独占**安装到目标。出现 `EEXIST` 时保留双方，不回退到覆盖式 rename。所有目标 after 字节确认一致后，将完成判据写入 `.COMMITTED-<uuid>` 临时文件，刷盘后以 `link` 原子发布 `COMMITTED`；部分临时判据不影响重开，恢复可重写。回读确认后，以同卷目录 rename 将事务移至 `已提交` 并同步两侧父目录，才返回成功。历史日志的 before 字节永久保留；当前没有物理 purge 或自动历史清理。

恢复只扫描 `待恢复`。其中已存在有效 `COMMITTED` 的事务**只归档**，不重放正文，也不要求当前正文仍等于历史 after：提交后的外部编辑是新的事实。归档失败的异常带 `outcome: 'committed'` 和 mutationId；后续操作必须先完成恢复与目录同步，才能启动另一笔变更。两处发现相同 mutationId 会报冲突，不任选一处覆盖。

冷启动和普通读取不读取 `已提交` 中的 intent/正文历史字节。`queryMutation` 及指定 mutationId 的重试按 ID 定位，完整验证该笔意图、字节哈希和完成标志，仍返回原历史快照。归档历史的损坏在访问该笔回执时拒绝，不把普通正文读取当作全历史审计。

## 旧库的显式升级

`openLibrary` 遇到 schema 1/2 只抛 `UPGRADE_REQUIRED`，不会建目录、备份、恢复或写入旧库。由调用方明确调用 `upgradeLibrary(root)`：

1. 拿同一全库锁并重新校验身份，将根描述文件**原字节**经 staging 持久发布到 `系统（别动）/内容库.schema1.bak.json`。已有备份必须一致。
2. 建立 `待恢复` / `已提交` 两个目录作为旧版读写屏障。旧 schema 1 实现见到这些非 UUID 目录会拒绝继续。
3. 预检旧事务根、待恢复、已提交三处的全部事务：身份、字节哈希、完成标志、重复 ID、唯一未完成事务及其当前文件状态。异常停止并保留现场。
4. 完成事务原样移入已提交；唯一未完成事务移入待恢复、恢复并归档。旧 staging 移入待恢复保留且不执行。每次移动同步父目录。
5. 确认没有遗留旧事务或未解决 pending 后，最后原子发布只将 schemaVersion 改为 2 的根描述文件，保留其他字段。

升级中断可再次显式调用同一函数继续；schema 3 调用幂等。`内容库.schema1.bak.json` **仅是根描述文件备份，不是整库备份，也不提供安全降级**。schema 1→2 完成后，继续执行专用 2→3 升级：先恢复旧 pending，再持久备份 schema 2 描述文件；在事务根创建 `升级到3/` 屏障，旧 schema 2 的恢复器会拒写；建立新增业务目录；最后原子发布 descriptor 3 并保存完成标记。各阶段均可显式重入。两个描述文件备份都不代表整库备份，不能以换回 descriptor 的方式降级。没有引入通用迁移平台。

## 错误与诊断

| `error.code` | 含义 |
| --- | --- |
| `INVALID_INPUT` | 字段、ID、路径形态或 token 不合法；mutationId 请求不匹配 |
| `CONFLICT` | 读取后被另一调用方/外部编辑器修改，或创建 ID 冲突 |
| `INVALID_STATE` | 重复删除/恢复，或编辑回收站内容 |
| `FORMAT_UNSUPPORTED` | 非本产品、未知或较新 schema，禁止写入 |
| `UPGRADE_REQUIRED` | 旧 schema 1/2 库，需要调用方显式升级，普通打开没有修改 |
| `UNSAFE_PATH` | 符号链接或非预期文件/目录类型 |
| `NOT_EMPTY` | 新建目标已有数据，拒绝接管 |
| `BUSY` | 活锁、异机锁、无法证实死亡，或回收时锁变化 |
| `LOCK_UNCERTAIN` | 空锁/异常锁，需诊断，未自动清除 |
| `CORRUPT` | 坏 JSON、缺权威文件、非法身份、损坏日志等 |
| `RECOVERY_CONFLICT` | 不符合日志前后状态的外部字节，或捕获/安装竞争 |
| `IO_ERROR` | 底层写入、权限、刷盘或文件系统能力失败；`cause` 保留原错误 |

变更失败附 `mutationId`；正式意图发布后 `pendingRecovery: true` 表示**可能已经发生部分提交**，不能向用户声称“完全没动”。发布前失败则为 `false`，只留下未执行的 staging。提交已完成但释放锁失败时附 `outcome: 'committed'`、`contentId` 和生成的 `mutationId`，避免把成功创建当成失败后重新创建。保存此 ID，锁诊断处理后查询结果。坏的已发布日志仍阻止恢复，应保留整个库、事务和临时文件供诊断；本单元没有修复/强行解锁按钮。不要通过删日志、删锁或重建正文来“恢复”。

## 验证与承诺边界

```sh
node --test file-library/test/*.test.mjs
```

测试使用真实临时目录，覆盖重开/整库移动、独立进程 stale token、真实活锁与死进程、空锁及回收/释放竞争、外部编辑、删除恢复历史、坏 JSON/缺正文/较新格式/路径逃逸、SIGKILL 后恢复、第三种字节保留、捕获/安装竞争、故障注入和幂等回执。`__testing.setHook` 只在 `NODE_ENV=test` 可设置，不属于业务对象能力。

Mac / POSIX 使用文件与目录 `fsync`、同卷 `rename` 和硬链接，`info.durability` 为 `process-crash/file-and-directory-fsync`。Windows 路径保留文件 `fsync` 与原子发布；Node 无法刷盘目录时只对明确的平台错误 `EISDIR/EPERM/EINVAL/ENOTSUP/ENOSYS` 继续，`EIO/ENOSPC/EACCES` 等仍失败，能力声明为 `process-crash/file-fsync`。两个声明只描述实现机制，不是断电硬件持久化保证；Windows 必须通过真实机测试才能验收。

入口允许 canonicalize 调用方选择的祖先路径，例如 macOS 系统 `/tmp`、`/var` 别名；库根本身不能是 link。打开后固定真实 root，库内目录与文件逐段 `lstat`，在平台支持时读/建文件带 `O_NOFOLLOW`，拒绝静态 symlink。Node 内置 API 不提供完整的 dirfd/openat 路径锚定：**不承诺抵御恶意进程持续替换祖先目录**。库应放在用户独占控制的本地目录。

普通外部编辑器与本模块不共享锁。捕获/独占安装避免检查到安装期间静默覆盖竞争字节，但编辑器持有旧文件描述符时仍可写入捕获文件；日志 before 快照保留原字节。提交后外部编辑仍是新的磁盘事实，读取会计算新 token。出现冲突时优先保留证据，不保证自动合并或不中断读取。

定向 I/O 测试覆盖 30 次编辑后冷启动与连续 read：已提交历史内容读取次数为 0；query 只读取目标事务的 intent 和 COMMITTED。列表仍读取全部当前内容，待恢复目录仍需枚举 staging；大规模内容列表、海量 staging、高频编辑与商业性能验收尚未完成，不将本次减少历史 I/O 等同于大库整体性能达标。

已验证范围仅当前 Mac 开发机临时目录、文件导入和进程崩溃，不等于断电/磁盘硬件持久化测试。Windows、网络盘、云同步盘、恶意路径替换、Electron IPC/UI、WorkBuddy/Codex 接入、安装发行、大库性能及真实生图/任务回流等剩余 P1 闭环尚未验收。

## 照片、提示词和资产接口

以下业务变更继续使用 `options = {mutationId?}`，更新、删除、恢复均提交读取时的 `editToken`。每种记录都有独立 ID、revision、时间和 deletedAt；正文仅在独立 Markdown 中。库内无通用路径或 registry 写接口。提示词保存在 `提示词/<id>/提示词.json` 与 `正文.md`，照片保存在 `我的照片/<id>/照片.json`，模板元信息保存在 `模板/<id>/模板.json`。

| 方法 | 输入与返回 |
| --- | --- |
| `importAsset(sourcePath, {purpose})` | 明确选择绝对普通文件路径；返回 `{assetHash, bytes, detectedType, decoded:false, purpose, originalName}` |
| `readAsset(assetHash)` | 重新校验 SHA256，返回 `{assetHash, bytes, detectedType, decoded:false, data:Buffer}`，不返回任意文件路径 |
| `createPhoto({title,assetHash,isOwnPhoto,originalName?}, options?)` | `isOwnPhoto` 必须明确为 boolean，这是用户声明，不是身份识别结果 |
| `updatePhoto(id, patch, token, options?)` | patch 只接受上列业务字段 |
| `readPhoto(id)` / `listPhotos()` / `listPhotoTrash()` | 返回照片元信息、assetHash、本人声明与 editToken |
| `trashPhoto(id, token, options?)` / `restorePhoto(...)` | 只软删记录，不删被历史引用的资产 |
| `createPrompt({title,body,category?,when?,summary?,tags?,provenance?,builtinKey?}, options?)` | 返回公共字段及 prompt 业务字段，正文只在 `正文.md` |
| `updatePrompt(id, patch, token, options?)` | 同上业务字段；外部编辑 Markdown 会使旧 token 失效 |
| `readPrompt(id)` / `listPrompts()` / `listPromptTrash()` | 正常与回收站视图 |
| `trashPrompt(id, token, options?)` / `restorePrompt(...)` | 软删/恢复；builtinKey 在同一库内唯一，含回收站，重复 key 报 CONFLICT，不覆盖或复活 |

purpose 为 `photo/material/template-reference/template-structure/generated-cover`。单文件最大 64 MiB，以 64 KiB 分块复制并计算 SHA256，源文件读前/后身份和时间戳不一致则停止。完整暂存刷盘后以独占 link 安装到 `资产/sha256/<前两位>/<完整hash>`；同 hash 已存在必须字节一致才复用。调用方文件名不参与库内路径，原名和角色只留在引用中。

类型只由字节决定，与源扩展名无关。支持 PNG/JPEG/WebP/GIF、PDF、UTF-8 文本；可明确解析为 JSON 的对象/数组规范识别为 application/json，Markdown/CSV/普通文本统一为 text/plain。SVG 仅在 template-structure 用途导入，仅作为原始结构说明，不执行；photo/template-reference/generated-cover 要求 raster 图片。`decoded:false` 明确表示只检查类型特征和完整原字节，未做像素解码、图片质量或人像识别。真实生成回流仍需后续真实解码和质量验收。

资产先安装，引用后通过单对象事务提交；失败最多留下未引用资产/暂存，不宣称逻辑对象创建成功。首版不提供物理 GC，不删除历史 bytes。

## 模板不可变版本

| 方法 | 说明 |
| --- | --- |
| `createTemplate({name,definition,resources,derivedFrom?}, options?)` | 新 UUID 模板，初始版本 1；derivedFrom 为 `{id,version}` |
| `addTemplateVersion(id,{version,definition,resources},token,options?)` | 新正整数版本，不覆盖旧版本；提交后成为 currentVersion |
| `selectTemplateVersion(id,version,token,options?)` | 只切换当前版本引用 |
| `readTemplate(id,version?)` | 返回元信息及直接字段 `name/version/packageHash/definition/resources`，省略 version 时读取 currentVersion |
| `listTemplates()` / `listTemplateTrash()` | 返回元信息与 versions[]，不将缺失或损坏的已登记元信息当空模板 |
| `trashTemplate(id,token,options?)` / `restoreTemplate(...)` | 隐藏/恢复元信息，不删除版本或历史资产 |
| `installBuiltinTemplate({id,name,version,definition,resources},options?)` | 专用稳定 builtin-* ID 安装；同 ID/version/packageHash 幂等，不同 hash 冲突；不覆盖、复活或改写旧版本 |

每个 `模板/<id>/版本/<version>/定义.json` 包只包含 `{definition,resources}`，资源映射为 `源标识 → {assetHash,bytes,detectedType,role}`。role 只允许 style/structure：style 只接受 PNG/JPEG/GIF/WebP；structure 接受这些图片、SVG、text/plain、application/json。PDF 可作普通资料，不能伪装为模板视觉样张。创建/读取/切换版本、绑定候选、登记发布均重新验证包 hash 及样张资产的存在、hash、bytes 和 canonical type。

definition 按调用方的有限 JSON 数据原样保存，包括旧 v3 来源、accepted、aiTested，不擅自提升验收结论。内置模板不能通过 addTemplateVersion 原地编辑；可显式创建 derivedFrom 克隆，内置新版本仅通过专用安装接口增添。

新模板先在父目录 staging 中完整刷盘未登记 marker，再原子发布正式 ID 目录，随后安装版本包，最后提交模板元信息。marker 严格绑定 ID/version/mutationId/packageHash。列表只跳过有效未登记 marker 下的孤儿包和明确 staging；缺元信息却无 marker 或 marker 损坏会拒绝。元信息存在时优先校验元信息；清 marker 失败不否定已提交结果。失败可留下诊断孤儿，稳定内置 ID 可以用同包重试，不覆盖不同包。

## 内容资料、封面与人工发布

| 方法 | 说明 |
| --- | --- |
| `attachContentMaterial(id,{assetHash,originalName,role?},token,options?)` | 新建 materials[] 项，返回内容记录；条目 id 即 materialId |
| `removeContentMaterial(id,materialId,token,options?)` | 移除引用，保留原资产与历史 |
| `registerContentCandidate(id,{assetHash,requestId,attemptId,template?,source?,originalName?},token,options?)` | 登记 candidates[] 项，条目 id 即 candidateId，accepted 初始 false；template 为 `{id,version}` |
| `selectContentCover(id,candidateId,token,options?)` | 用户显式选定，设置 selectedCover 并记录该候选的人工接受时间 |
| `savePublicationPlan(id,{id?,channelId,scheduledAt,timezone},token,options?)` | 无 id 时新建稳定 plan ID，有 id 时改期；同内容可多渠道、多次计划 |
| `cancelPublicationPlan(id,planId,token,options?)` | 只可取消 planned 项；已发布计划不可改、不可取消 |
| `recordPublication(id,{planId,publishedAt,timezone,url?},token,options?)` | 仅人工登记；先安装不可变快照，再在同一内容事务中更新计划与 publications[] |
| `readPublication(id,publicationId)` | 返回 `{snapshot,body,bodyBytes:Buffer,cover,template}`；校验快照 hash、正文原 bytes 及固定资产/模板引用 |

时间必须 UTC ISO Z，入库规范为毫秒 ISO；timezone 使用 IANA 名称，channelId 使用稳定字母/数字/点/下划线/短横线标识。发布 URL 仅 HTTP(S) 且拒绝内嵌用户名/密码。

发布快照在 `内容/<id>/发布快照/<publicationId>/` 中包含 `快照.json` 和原字节 `正文.md`；固定标题/修订、计划、发布时间、封面 assetHash 和模板版本/packageHash。后续改稿、换封面、删除照片/模板记录均不改历史。快照先安装、引用后提交，故障可能留无引用快照，不产生假发布事实。它不调用外部平台，不代表已执行自动发布或实际生图。

扩展元信息在业务层校验每个条目、ID 唯一性、当前模板版本、候选/selectedCover 的内容归属、计划/发布对应关系；伪造选择、null/重复条目会拒读和拒写。事务校验禁止 content schema 2 倒退到 1；trash/restore 只允许 revision/updatedAt/deletedAt 变化，不能夹带正文或其他业务字段变化。
