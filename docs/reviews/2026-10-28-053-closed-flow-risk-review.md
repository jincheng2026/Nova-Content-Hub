# 0.5.3 已冻结闭环定向风险审查

日期：2026-10-28。范围：当前未提交的 method-adapters / jincheng-creation / vault workflow、publication-runtime / knowledge-sink、cover-design bridge / cover jobs / final-assets designSource。只读审查源码；仅对临时新建 Vault 做隔离故障注入，没有操作真实内容库、设置、助手缓存、网络或模型。

## 结论

初审发现 1 个确定 P2，现已通过下述修复复核关闭。未发现确定 P0/P1，定向复核未发现本次修复引入的新阻断。发布沉淀与封面设计桥接在初审覆盖范围内未发现新增阻断；此结论不等于真实助手、跨平台安装或视觉验收通过。未审仍由其他代理修改的 ASR 接线、codec、intake 模块。

## P2：科普完整稿的配套文档失败后，原请求不能恢复

- 位置：`plugin-src/src/commands/jincheng-creation.mjs:70-75`，以及 `plugin-src/src/lib/method-adapters/runtime.mjs:62-67`。
- 触发条件：叙事、框架、各段和通读都已按准确版本确认；执行科普 `build` 时 HTML 与 `complete-draft` 已提交，随后写入 `科普过程-<readthroughId>/` 下的配套文件遇到 I/O 错误或进程中断。
- 实际行为：`buildCreationPage` 的回执已经成功，阶段产物也已记录，但 `writeKepuCompanions` 位于独立写入步骤。原 mutationId 重试先命中 `vault.content.creationDocuments.length`，抛 `ALREADY_EXISTS`，无法走到补齐步骤；`regenerate` 也不调用配套文件写入。因此任务既不能拿到完整结果，也无法通过原请求修复缺失的准确说法、逐字稿/参考和改稿日志。
- 隔离复现：`/tmp/nova-risk-review-kepu-recovery.mjs`，使用项目现有科普集成测试 fixture 与真实 checkpoint/CLI 路径，在首个 `叙事与框架.md` 的 `fs.renameSync` 注入一次 EIO。临时 Vault 已清理。命令：`node --experimental-strip-types /tmp/nova-risk-review-kepu-recovery.mjs`。

实际输出：

```text
first build error: EIO
same mutation retry: ALREADY_EXISTS
complete-draft recorded: true
companions exist: false
```

建议：为整项 build 建立可恢复、绑定冻结输入的提交记录；在“已有页”检查前识别同一 build 请求，恢复已提交 HTML 与阶段记录，并按原冻结通读版本补齐配套文档。恢复必须校验已有字节，不能覆盖作者修改，也不能改采新的通读版本。增加首个及中途配套文件失败后，同 mutationId 恢复为完整成功且不重复阶段记录的回归测试。

## 核对证据与边界

已检查真实实现中的：review 的来源选择、作者判定及原 mutation 重放；科普依赖决定、逐段 scope 与实际 HTML 参考编译；publication sink 的正式来源与固定目标、资产 hash、WAL/CAS、目标身份及状态读取；cover design 的最新同篇确认、冻结比例/本人照片与包装来源、提交前失效校验及最终资产 provenance 传递。

已读取现有完整回归结果与关键测试源码：

- `/tmp/nova-method-adapters-final-tests.log`：32/32，通过。
- `/tmp/nova-053-publication-root-review.log`：37/37，通过，含真实不可写目录、并发重试、固定目标恢复。
- `/tmp/nova-cover-design-tests.log`：147/147，通过。
- 本轮额外执行上述故障注入；未把先前测试通过解释为本轮重新运行，也未进行无变化全量复跑。

## 修复复核：P2 已关闭

同日只针对本发现复核冻结后的 `jincheng-creation.mjs`、`jincheng-workflow.mjs`、`method-adapters/runtime.mjs`，未重新审查全分支。

修复将完整稿 build 的 task、输入、原稿字节、上游候选及确认决定保存在固定 intent；已有 HTML 通过原构建回执重放，并检查当前字节，`complete-draft` 使用固定 artifactId。HTML 提交但阶段记录失败时，当前源切换仅在 intent 与构建回执均匹配后放行恢复。配套文档先检查整组已有字节，再补缺失文件，作者手改会阻止恢复。以上路径已覆盖原先 `ALREADY_EXISTS` 导致无法补齐的断点，未见此修复新增确定的关键风险。

证据：

- 已读取 `/tmp/nova-kepu-recovery-final.log`：7/7，包含首个及中途配套文件失败、阶段记录失败，以及原稿／确认／配套文件／候选变更拒绝。
- 已读取 `/tmp/nova-kepu-recovery-regression.log`：5/5，覆盖普通写稿、教程、科普与审稿既有路径。
- 本次实际最小重跑：`node --experimental-strip-types --test --test-name-pattern='EIO at (叙事与框架.md|创作过程.json)' workbench/test/kepu-build-recovery.test.mjs`，2/2 通过，0 失败。两项均验证四个配套文件完整及 hash、HTML 不变、单一阶段记录、相同回执重放、输入冲突和作者手改保护。
