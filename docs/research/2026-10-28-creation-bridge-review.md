# 原创作页桌面桥关键审查

日期：2026-10-28。范围：`4ef7f65` 内核及当前未提交 creation controller / worker / frame adapter / React 容器，附带方法原件打包链。按指定范围只做 P0/P1 审查；未修改产品代码、未提交、未运行上游方法程序。审查期间主线程仍在实施，以下行号对应本次读取快照。

依据：`docs/research/2026-10-28-jincheng-rebuild-decisions.md`、`docs/implementation/jincheng-creation-adapter-architecture.md`、根 AGENTS。使用 code-review 的规范与需求双轴检查；本次受委派明确要求不再派发代理，因此在本审查内完成两轴。没有进行视觉验收，不能据此宣布原 UI 或平台安装通过。

结论：发现 5 项 P1，其中引导脚本语法错误已在审查期间由主线程修复并复核编译通过；其余 4 项需修复与专项回归后放行。未发现有证据支持的 P0。

## 1. [P1] 原片引用可把库内脚本交给系统执行

状态：待修复。规范轴：不可信原文件只读数据不能升级为系统执行权限。需求轴：架构 §3 要求原片走受控媒体资源通道。

证据：`workbench/src/main/creation-worker.mts:64–70` 只确认 href 与某条 `refs.video` 一致、最终路径在库内、是普通文件，随后返回 `localPath`。`workbench/src/main/desktop.mts:311` 对该路径直接 `shell.openPath(filename)`。原件 `jc-doc` 可包含任意相对 `video` 字段，库内并不代表媒体或受信程序。

最小复现：临时合成 T001 创作页，合法 ref 为 `{source_type:'说明',text:'原片',video:'original.cmd'}`；在同目录放一个仅含 echo 的 cmd。调用 `executeCreation(... action:'reference', payload:{href:'original.cmd'})` 返回成功，输出 `Non-media shell target accepted: original.cmd`。本审查没有调用 shell，也未执行该文件。Windows 的 cmd/bat、macOS 可执行 command 等可由系统关联启动，用户点“原片”不等于授权执行代码。

修法：使用受控媒体查看器或严格媒体类型/内容检查后的打开入口，拒绝脚本、可执行文件、快捷方式及伪装类型；保留现有路径与符号链接边界。回归应覆盖合法媒体和同目录 cmd/bat/command/url/lnk 的拒绝。

## 2. [P1] 另一 frame 的普通编辑会覆盖已落盘的未提交批注

状态：待修复。规范轴：正式人工输入不可因恢复/并发静默丢失。需求轴：架构 §4 要求 scoped 草稿、CAS 合并以及不覆盖另一窗口脏输入。

证据：`workbench/src/main/creation-frame-html.mts:12` 在调度时取 `storage=copy(snapshot.storage)`；随后每轮 CAS 虽读取最新 `current`，只合并 `current.records`，仍把旧的整份 `storage` 写回，且纯字段 modify 也带这份 storage。`:13` 仅更新本地镜像，没有按 key 记录修改与删除。原 app `plugin-src/resources/jincheng-creation/template/app.js:1723–1726` 明确把未按“保存”的选区批注存进 sessionStorage 的 `jc-cp-note-draft-${PID}`。

最小复现：用真实 bootstrap 在两个独立 VM frame 中运行，MessagePort 连接带 revision CAS 的同一模拟持久 store。A/B 从相同空快照打开；A 写 session 草稿并等待 durable ack；B 只修改正文。结果：

```text
A draft durable: {"local":{},"session":{"jc-note-draft":"作者未提交批注"}}
After B unrelated field modification: {"local":{},"session":{}}
```

修法：提交 storage 的 key 级操作而非全量旧镜像，CAS 冲突后在最新快照上重放；未变更 storage 的字段事务不得重写 storage。两窗口同时编辑同一业务草稿要保留各自版本或显式冲突，不能最后写入覆盖。补充跨 frame 更新通知与读取最新 stash；当前 `store.all()` 在 `:15` 仅返回自己的快照，也未恢复原 IDB 每次读取最新记录的语义。

## 3. [P1] 暂存失败后字段操作被永久出队，重读会丢掉仍显示的人工修改

状态：待修复。规范轴：失败与恢复不能丢弃未确认输入。需求轴：架构 §4 要求失败保留草稿、持久 ack 前禁止关闭/换库，并提供复制或明确放弃。

证据：`workbench/src/main/creation-frame-html.mts:12` 先 `operations.splice(0)`；五次写失败后只 reject batch，不回队、不保留失败 record；`snapshot.records` 仅在成功后更新。下一次其他字段成功即把 `lastError=''`。`:8` 超时文案却称“改动仍保留，请重试”。`workbench/src/renderer/creation-frame.tsx:38` 的“重新读取原页”只看 busy/pending/ready，失败后 pending 为零时仍可直接 setVersion，`:15` 销毁 frame；没有调用 JC_DESKTOP.flush 或提供复制/明确放弃流程。

最小复现：真实 bootstrap 的 `stash-write` 连续五次注入 disk failed；对 mine 的 modify reject。恢复服务，再改另一 note 字段；`store.all()` 与持久 records 均只有原 mine 和成功的 note，失败 mine 的 after 完全不存在。用户此时“重读原页”会丢掉界面里的新 mine。kit 自己的 storeError 可能继续显示错误，但它也无法从已经出队的 batch 重试该输入，错误文案不构成恢复能力。

修法：失败操作保持可重试的有序批次与本地脏快照，禁止后续无关成功清除尚未解决的错误；显式 retry 重放原 change_id/业务组。所有手动重载、卸载、换文档、换库走 drain/ack 握手；失败必须保留当前编辑或让用户复制/明确放弃。增加“持久写失败→恢复→重试→重开”的精确 after 验收。

## 4. [P1] 跨旧组采纳仍分两次落盘，崩溃后恢复可能拆开原组

状态：待修复。需求轴：架构 §4 明确要求 mine/decision/proposed 与旧 group 重绑在一个 modifyBatch 内持久化；原方法要求组全成或全不成。

证据：适配只替换 openIdb/withStore，`workbench/src/main/creation-frame-html.mts:39–40` 没有修改 `jcKit.edit` 的批次边界。原 `plugin-src/resources/jincheng-creation/kit/kit.js:374–380` 先 await 新 list 的 modify/refresh，再遍历旧组剩余成员重绑；bootstrap `:12` 只能合并同一个 microtask 的操作，无法跨前一次 durable ack 合并这两阶段。

最小复现：原 `edit` 函数在隔离 VM 中执行，初始 G1 为 `seg|mine + sug1|decision`；新采纳 G2 更新 `seg|mine + sug2|decision`；在第二阶段旧组重绑前注入失败。持久快照为：

```text
G2: seg|mine, sug2|decision
G1: sug1|decision
```

恢复后原 kit 会按这两个组提交。若 G2 正文冲突，G1 的“已采纳”决定仍能独立写入，破坏最初采纳动作的原子语义。模拟的第一阶段可整体提交；风险来自两阶段之间，不能靠把第一阶段的多格合并解决。

修法：对原 kit 增加局部 modifyBatch 接点，先在同一最新 stash 快照上算完新改动与旧组闭包，再一次 CAS 写入；不能改掉原编辑/采纳语义。注入该精确边界的退出后，必须只能恢复整组或完全未变的旧组。

## 5. [P1，已修复] 引导脚本语法错误使桌面保存适配完全不启动

初始 `workbench/src/main/creation-frame-html.mts` 的 clipboard.write 生成字符串多一个 `);`。把 bootstrap 原字符串送入 `vm.Script` 得到 `SyntaxError: Unexpected token ')'`；TypeScript 编译和字符串 contains 断言不会发现嵌入 JS 的语法错误。已即时通知主线程，主线程将其改为当前 `:23–28` 的正确对象结构；随后再次编译，输出 `Current bootstrap compiles after parent fix`。

建议保留生成后每个内联脚本的语法校验，并以真实 Electron frame 成功握手/编辑作为最终验证。这里只确认语法修复，不把它算作成功写回或视觉验收。

## 方法原件与打包附查

`validateMethodSources('plugin-src')` 实际通过，结果为 **53 个版本、418 个文件**。本次读取确认 manifest 校验原件字节数/SHA256、拒绝路径穿越和符号链接，并检查 upstream 下不存在未登记文件；`build.mjs` 完整枚举方法资源进入 integrity 清单；`artifact-safety.mjs` 对源 tests/fixtures 的例外需命中来源 hash，仍扫描凭据与本地状态。将嵌套入口改名 METHOD.md 保留内容字节的做法不要求回退，也不应简化成方法摘要。

未把主线程正在处理的 marketplace 嵌套 prefix 已知问题重复列为发现。没有运行上游归档 tests/scripts，也没有执行全量包构建、安装、全平台测试或真实 Electron probe；这些由主线程统一验收。本报告不证明整套方法的业务映射已全部通过，只记录本次检查到的字节归档与受控装配职责。
