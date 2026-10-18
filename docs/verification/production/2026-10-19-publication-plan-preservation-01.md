# 更正发布记录保留原计划：文件核心回归

2026-10-19。环境 Node v24.20.0 / macOS arm64。仅在测试创建的临时文件库执行，没有修改安装版或原生验收库。

## 原生症状与可重复信号

主线程发现：计划 UTC 2026-10-22T18:57:06Z，实际发布先登记 18 日、再更正为 17 日；撤销实际发布后，待发布计划也错误变成 17 日。

回归直接调用真实 `createLibrary` 与内容/合集 record → correct → retract API。修复前两项均失败，计划的 `at` 实际为 `2026-10-17T18:59:45.000Z`，预期 `2026-10-22T18:57:06.000Z`。见 `2026-10-19-publication-plan-preservation-01.red.log`。

## 排序假设及定位

1. `terminal(correct)` 将更正实际发布用的 `correctedPlan` 写回业务计划。预测：首次登记不改原计划，更正后即改变，撤销只是保留错误值。
2. `makePublication` 原地修改计划。预测：首次登记即改变计划。
3. 撤销从替代快照回填计划。预测：更正完成时仍正确，只有撤销时改变。

首次登记后的断言通过，更正快照已错误写入实际日期；源码 `nextPlan = {...correctedPlan}` 证实第 1 项。第 2、3 项排除。`savePlan` 禁止编辑 published 计划。

## 最小修复与断言

`makePublication` 的更正路径从实际输入读取更正文案/封面，将旧快照的 `plan` 保留为原计划事实；`terminal` 仅更新业务计划的状态、当前发布引用与更新时间，不将实际日期、文案、封面写回计划。原/替代发布快照均继续不可变，不重写旧快照或 schema。

内容与合集各覆盖：原计划与实际发布时间不同；更正实际日期/文字/候选；已选主封面时，更正未指定封面保留旧实际封面，明确空文字与无封面则清空；撤销并重新打开文件库后原计划日期、textMode、文字、封面仍保留；原快照字节和 snapshotHash 不变，所有替代快照仍能读取。既有测试另覆盖冻结基础正文。

定向命令：`node --test --test-name-pattern='explicit no-cover plan does not inherit the selected cover|publication correction and retraction preserve intended plan' plugin-src/src/lib/file-library/test/model-v5.test.mjs`。两次修复后 4/4 通过，见 `2026-10-19-publication-plan-preservation-01.focused.log`。

完整 model-v5 命令：`node --test plugin-src/src/lib/file-library/test/model-v5.test.mjs`。首次计划保留修复 38/38 通过；补无图契约后最终 40/40 通过、0 跳过、退出 0，见 `2026-10-19-publication-plan-preservation-01.model-v5.log`。本次源文件、测试与文档 `git diff --check` 通过。

## 相邻契约：明确无图不继承主封面

发现界面“这次不记录封面”与旧核心 README 的 null 回退说明冲突。按本次明确的产品要求，以现代独立文字/封面计划为准：`textMode:'explicit'` 的 null 必须保存无图。旧 body/未规范化计划继续主封面回退。

新增内容/合集回归均先选主封面、验证旧计划回退，再保存 `{schedule,text:'',coverChoice:null}`。修复前 2/2 失败，返回非空主封面而非 null，日志 `2026-10-19-publication-plan-preservation-01.no-cover-red.log`。

修复前排序假设：1）makePublication 选择为空时无条件读取 selectedCover；2）savePlan 吞掉 null；3）readPublication 补回封面。保存结果确为 null 且写快照时 cover 已非空，证实第 1 项。只限制空选择的回退为更正冻结路径或旧计划；现代计划无图保持 null。更正未传封面沿用旧实际图，明确 null 清空的回归同时通过。核心 README 已同步，不改变旧快照。

## 边界

这份记录只证明真实文件核心回归；安装版、IPC/渲染、日历与总览实际操作由主线程继续验证。未运行全仓验证、打包、安装或宿主生图。

不自动修复旧版已经覆盖的业务计划或更正快照；即使存在旧快照，也不能据此静默猜测用户后来是否重新安排。已受影响记录需要单独核对并明确修正计划。
