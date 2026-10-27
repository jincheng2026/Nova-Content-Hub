# 2026-10-28：10916 文档写后读取超时修复

验收环境：darwin-arm64，Node.js v24.20.0；源码为 `52d36f56d293d9604e548190ceb1a8a41e9b6f8d` 上本次未提交变更。仅验证源码有限 operation 与数据保全；最终 Electron 安装包、真实 UI 复测及其他平台需引用主线程最终验收。

## 副本与问题复现

真实交付源 `/Users/mac/Desktop/自媒体工作台-0.5.0-交付/第二大脑` 未写入。本次从 GUI 已初始化验收 fixture 再复制独立副本：

- GUI fixture：`/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-jincheng-final-OTOC5Z/第二大脑`，本代理不写该 fixture。
- 独立性能副本：`/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-write-list-profile-kz6B54`。
- 副本逻辑 Vault ID：`59cc0cb3-a2af-49ad-8fa8-937d11ee3b55`；新物理身份 `dev=16777231, ino=83878320`，runtime 绑定按该副本更新，未绕过身份校验。
- 规模：10916 文档、47 条 T 内容、56 个账号、32 份报告。

GUI 原问题：T029 逐句 note 和 T044 包装预改/选用均成功落盘，随后返回列表的 `list` 用时 15172ms，超过原 15000ms 读取预算。不是包装写入丢失。

同一独立副本以实际 `saveKitChanges → execute(list) → executeProduction(productionRead) → readCreationDocument` 复现并 CPU profile：保存 note 1008ms，写后 list 10741ms，其中资源阶段 9464ms；productionRead 10533ms；warm list 5055ms，其中资源阶段 4380ms。资源阶段没有实际 `mutate`，却重读/分类全部原位文件，并因无关 creation 页 hash 进入 excluded inventory fingerprint，额外执行 raw readProduction/listPrompts。profile 累计样本中 read 21.30 秒、management 6.55 秒；并非每次重新导入 32 份报告。

## 针对性变更与保护

1. bridge 初次打开仍完成资源初始化。之后纯内容 list/read 仅同步内容，读取快照与原有锁照常恢复 pending；真正读取/修改资源前照常同步资源。
2. 资源签名每次基于当前快照、当前来源绑定/身份/可用性、增删文件、资源 hash 与关联 sidecar 建立，不是 TTL 缓存。稳定输入跳过全库正文重分类；raw production 仍执行当前资产校验。
3. 仅已分类为 excluded 的 canonical creation 页可忽略作者正文 hash；页面改变时定点读取并核验 hash，同时检查管理块和 `type/kind: report/research-report` frontmatter。任何显式资源声明继续参加完整 hash 与分类。excluded inventory 中的 hash 同步更新。
4. 报告实际引用的本地 CSS/JS、账号图片加入各自 sourceEntry 的依赖 hash，避免全局输入已变而对象仍跳过重投影。账号图片导入前后核对 hash；linked report sidecar 在当前签名中保留，但不误分类为报告正文。
5. 保持 HTML 输出策略版本 4，输入签名单列版本；未修改 15 秒 deadline、身份约束、CAS、pending journal 或创作字段语义。

## 最终实测

同一副本先 prime handle；明确打开阶段的耗时与有限读取分列。下列操作保持 47/56/32 数据完整。

| 操作 | T029 note（最终实现） | T044 包装（普通首轮） | T044 包装（最终有限并发） |
| --- | ---: | ---: | ---: |
| 当前页读取（写前） | 543ms | 414ms | 679ms |
| 实际保存 | 833ms | 458ms | 705ms |
| 写后首次 list | 1164ms | 928ms | 1147ms |
| productionRead | 1128ms | 753ms | 1121ms |
| 当前页读取（写后） | 539ms | 436ms | 796ms |

最终 T029 的资源阶段为 254ms，没有 rawProduction/listPrompts 额外调用；warm list 627ms。

有限并发为单个 `nice -n 10` 子进程，12 轮读取/压缩/同步暂存写入，累计读取 22412388 字节，持续 6796ms，覆盖保存、list 和 productionRead。未模拟无限 I/O 饱和，也不以此替代真实安装包并发验收。普通首轮和最后边界修复后的最终并发均保全全部 segment.mine、其他 pubslot.final、jc-doc JSON 外 HTML 字节；candidate.text、decision=选用、所选 slot.final 均准确写入并读回。

打开阶段保留实际初始化/旧状态转换；私有副本曾临时运行未交付策略版本的中间实现，因此该副本转换时的 18469ms prime 不作为正常有限读取指标，也不宣称冷初始化全部低于 15 秒。

## 验证与证据

```sh
node --test plugin-src/src/lib/vault/test/resource-read-performance.test.mjs
node --test plugin-src/src/lib/vault/test/resources.test.mjs plugin-src/src/lib/vault/test/resource-read-performance.test.mjs plugin-src/src/lib/vault/test/current-source.test.mjs plugin-src/src/lib/vault/test/vault.test.mjs plugin-src/src/lib/vault/test/pending-index.test.mjs
node --test plugin-src/src/lib/vault/test/pending-index.test.mjs plugin-src/src/lib/vault/test/working-draft.test.mjs plugin-src/src/lib/creation-document/test/*.test.mjs plugin-src/src/lib/publication-runtime/test/runtime.test.mjs workbench/test/worker.test.mjs workbench/test/production-worker-client.test.mjs workbench/test/vault-review-regressions.test.mjs
npm run typecheck:native --prefix workbench
node --check plugin-src/src/lib/vault/resources.mjs
node --check plugin-src/src/lib/vault/bridge.mjs
```

最初两项性能回归先见红（内容读取仍调用资源投影；稳定输入仍打开无关资料正文），实现后转绿。专项还覆盖同大小同 mtime 的内外部资源修改、新增/删除、来源绑定变化/根替换、runtime asset 损坏必须 CORRUPT、纯内容 list 恢复未完成资源事务、jc-doc 显式管理块及 frontmatter 报告转换、linked CSS 内容更新和账号图片依赖更新。最终性能/边界专项 **10/10 通过**；资源/current-source/Vault/pending 组合 **84/84 通过**；pending/working-draft/creation/publication/native 迭代组合 **74/74 通过**。最后增补 frontmatter 声明检查由 10 项专项覆盖；native typecheck、两文件语法检查与 diff whitespace 检查通过。

本次会话原始证据：`/tmp/nova-write-list-before.log`、`/tmp/nova-write-list-before.cpuprofile`、`/tmp/nova-write-list-final-note.log`、`/tmp/nova-write-list-packaging-normal.log`、`/tmp/nova-write-list-packaging-final.log`；脚本 `/tmp/nova-write-list-profile.mjs` 与 `/tmp/nova-write-list-packaging-profile.mjs`；测试日志 `/tmp/nova-resource-perf-red.log`、`/tmp/nova-resource-perf-guards-final10.log`、`/tmp/nova-resource-final-regression.log`、`/tmp/nova-write-list-targeted.log`、`/tmp/nova-write-list-final-typecheck.log`。这些临时文件供当前会话复核，程序不依赖它们。
