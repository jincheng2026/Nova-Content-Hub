# 四个完整业务方法源码接入

2026-10-28。本轮按当前任务授权接入方法源码与路由，不构建、不安装、不提交 Git、不改全局 Skills、不运行原脚本，不上传媒体、不读取外部 secret、不安装依赖或启动 Python 服务。

来源 ZIP：`/Users/mac/Desktop/jc-skills-4个.zip`，16,037,833 bytes，SHA256 `b050faa629c7f201e7a7fd4a31c7aaa0bf826fbd3198edae8cac7891cbc9dd52`。使用已安全解压目录 `nova-skill-review-dzakfdyr/jc-skills-4个`，再次验证 ZIP hash 与所有原件字节。

## 文件范围

- 新四目录 `plugin-src/skills/jc-{zhuanxie,review-page,cover-design,kepu-video}/`，每项为薄 SKILL、references/method.md 和完整 upstream/current。方法源文件数为 6/3/79/532，总620；根安装说明另封存在 `jc-cover-design/upstream/package/安装说明.md`，以未选中包级version登记。全部621份字节、长度和hash均与ZIP一致，见 `zip-byte-verification.json`。
- 原 SKILL.md 仅改名 METHOD.md，避免嵌套激活；其余来源字节原样。源脚本文件模式644、executable:false，不执行。封面 MIT LICENSE 和全部原署名保留。
- 更新 `business-skills.json`、`method-sources.json`、两个方法执行／适配契约及 `production-methods-provenance.md`；更新缺包文档 `docs/research/2026-10-28-missing-original-skills.md`，保留历史查找事实。
- 新 `plugin-src/tests/four-methods-intake.test.mjs`。未改本轮 P0/P1 产品页面。

## 当前映射和限制

- 四项 registry.executor 均为现有 writing 承载。转写显式请求可选完整方法，普通转写默认仍是 jc-benchmark-intake；普通写稿默认仍是原兼容方法。所有方法 runtimeStatus=contract-unverified、executable:false。
- 转写 raw/corrected/segments 映射当前 originalText/correctedText/segments/corrections 与媒体hash，manifest/validation与精度／缺段保留完整可读证据；不自造现有schema外字段。原 provider、fallback、secret路径和dry-run不执行。外部 `jc-qiepian-chupian/scripts/transcribe_chars.mjs` 未在包中，独立字级切片分支未接入。
- 科普只由用户显式选择，叙事、框架、本人逐段口述和真实确认保留；不把一般概念解释变成视频制作。
- 审稿回到同一 jc-doc 真源、受控建议／读回和CAS；没有等价adapter就只交可读候选和缺口，旧localStorage页不成为另一个真源。
- 封面 writing 只承载设计、提示词、候选与人工确认。`generationExecutor` 与 `generationHandoff` 仅说明后续既有cover交接，当前代码不自动路由；实际生成需另一份固定cover请求，使用原cover执行与submit回执。writing任务不能直接制图或冒称cover已交回。
- 包中config、人像与案例只作来源证据，不成为新用户本人、默认VI／比例／张数。config.md已通过现有artifact credential/local-state gate；未读取任何外部秘密文件。
- 两个宿主成功、双等待及恢复、终态、继续、切换及跨平台体验均未在本轮验证；完整原件、静态校验通过不代表正式支持或已安装。

## 验证

- 先运行四方法6项回归，全部因路由／原件未接入而失败，见 `red.txt`；随后接入。
- `node --test plugin-src/tests/four-methods-intake.test.mjs plugin-src/tests/business-skills.test.mjs plugin-src/tests/business-skills-complete.test.mjs plugin-src/tests/method-source-evidence.test.mjs workbench/test/artifact-safety.test.mjs`：35/35通过，见 `green.txt`。
- 原件独立 ZIP 字节比较：621/621，含原始方法独立冻结hash、所有附件和根说明。现有 validateMethodSources / validateSkills、完整性覆盖、POSIX/Windows路径引用、方法权限边界和四树artifact safety均通过。
- registry为99,873 bytes，保留运行时256KiB上限；完整文件hash集中在来源manifest，registry不重复620个资产条目。`git diff --check`通过。
- 按任务范围未运行源码包中的任何安装器／转写器／页面服务，也未做宿主真实方法forward-testing；这些缺口由contract-unverified状态明确保留。

## 后续保存注意

原封面包 `.gitignore` 的字节也保留，它会忽略其 `config.md` 和 `assets/my-face.png` 两份来源证据。主线程已知：保存本次文件时只对这两条完整路径精确 `git add -f`，不用全仓 add。缺少它们会被现有来源manifest验证拒绝。


## 封面来源引用精度续修

按Astra复审，jc-cover-design:F的26条references原先误标external-or-missing-reference。原因是来源审计使用解析后的绝对路径与未规范化的/var临时根比较，且未去Markdown尖括号；这不代表包内文件缺失。现在按from父目录进行POSIX路径解析，去目标外层尖括号，与该version已登记sourcePath逐项比对，26/26均真实随包，状态改为bundled。没有改任何原件、文件hash或tree hash。新增实际解析回归先失败后通过，最终整组结果见reference-status-green.txt。四包范围仍缺jc-qiepian-chupian/scripts/transcribe_chars.mjs外部分支；其他业务库／工具／运行环境的权限与验收缺口沿原contract-unverified记录，不扩大为已支持。
