# 固定模板 VI 与执行上下文验证（2026-10-21）

本记录只证明源码、资源字节和本地测试；未做真实生图、用户视觉验收、安装或跨平台原生运行。

| 命令 / 检查 | 结果 | 范围 |
| --- | --- | --- |
| `node plugin-src/scripts/import-colleague-resources.mjs '/Users/mac/Downloads/内容工作台学员版_代码交接包 2/封面工作台/内容工作台' --check` | 主线程执行，退出 0 | 真实交接包 163 个来源文件与当前导入资源一致；脚本同时核规范副本及索引 |
| `node plugin-src/scripts/import-colleague-resources.mjs plugin-src/resources/colleague-library/sources --check` | 退出 0 | 仓库自包含来源复核：5 组、127 原图、26 提示词、163 来源文件、5 VI + 3 风格 JSON 规范副本与索引 |
| `shasum -a 256 plugin-src/resources/colleague-library/catalog.json` | `cca95885158964de646c510fce2c78fc19adc1031f496d6fde7cd89726560f16` | 旧目录字节未变 |
| `node --test plugin-src/src/lib/file-library/test/template-context-documents.test.mjs` | 1/1 通过 | 固定旧版、定义与结构全文路径、来源名/hash、claim 仅图片 hash、请求字节不变、缺失/损坏拒绝、无结构旧模板兼容 |
| `node --test --test-name-pattern='five canonical VI' plugin-src/src/lib/library-seed/test/seed.test.mjs` | 1/1 通过 | 5 VI + 3 风格副本同源 hash、127 K 文件名/hash 索引、旧 catalog hash、生成器 `--check` |
| `npm run build:cover -- --auth disabled` | 退出 0 | 本机 darwin/arm64 实验插件源码装配；无安装验收 |
| 最终改动后重跑 `npm run build:cover -- --auth disabled` | 退出 0 | 最终 auth-disabled bundle；12 个源码/资源文件与 bundle 逐字节相同，cover-runtime Skill 仅 launcher 相对路径按打包层级改写 |
| `node --test --test-name-pattern='bundled codex exact' plugin-src/tests/cover/native-handoff-cli.test.mjs` | 1/1 通过（重建后） | bundle 的 cover context 可提供固定包路径与来源映射；首次运行使用旧 bundle，缺新字段而失败，重建后通过 |
| `node --test --test-name-pattern='execution Skills require' plugin-src/tests/native-handoff.test.mjs` | 1/1 通过 | 完整 context 保存/读完、VI 直接沿用、主图传入、批注原候选优先的技能合约 |
| `node --test plugin-src/tests/native-handoff.test.mjs` | 29/29 通过，退出 0 | 双宿主、模板/封面交接、长输入和技能合约 |
| `npm run test:file-library` | 440/440 通过，退出 0 | 文件库回归，含固定版本、只读文档、损坏拒绝和历史行为 |
| `npm run test:seeds` | 15/15 通过，退出 0 | 内置模板、同事资源、提示词及导入完整性 |
| `npm run typecheck:desktop` | 退出 0 | native 与 renderer TypeScript |
| `git diff --check` | 退出 0 | 当前改动空白错误检查 |

模板结构文档保留在固定版本的 immutable asset 中，规范副本用于产品目录查看。当前请求、claim 输入字段、版本及旧 catalog 未变。批注编辑仍以原候选为主输入，VI 只约束其风格。
