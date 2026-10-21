# 未提交改动检查与本地提交（2026-10-21）

范围：`qoder/review` 分支原有已暂存、已修改和未跟踪文件，起点 `3bedeb8`。这是源码与本机实验构建检查，不是安装包发行或生产验收。未升级版本、安装应用、推送远端或使用真实内容库。

## 检查与补修

- 完整交接：浏览器与桌面、Codex 与 WorkBuddy、模板与封面、普通生成与原图批注的入口和镜像；保留用户完整要求、多行批注、照片及明确选择的资料，长链接使用完整复制/预览。
- 模板：导入成功后按回执中的模板 ID 进入学习；内置模板沿用同事现有 VI。核对 5 组、127 张来源图、163 个来源文件、5 份 VI 与 3 份风格 JSON 规范副本。旧 catalog SHA256 仍为 `cca95885158964de646c510fce2c78fc19adc1031f496d6fde7cd89726560f16`。
- 版面与分页：检查固定卡片尺寸、长标题/空样张及悬停/焦点状态；分页选项在圆角内裁切。既有合成 UI 证据见[模板导入与分页记录](../production/2026-10-21-template-import-pagination/evidence.json)。
- 审查发现并补修旧导入恢复缺口：仅对历史任务显示恢复卡，保留原来源/目标校验，切换绑定前清理旧编辑器；无已接受任务时重新核验并重试原目标。
- 审查发现并补修批注合成提示词超限：按完整最终提示词检查 10000 字预算，在保存备注、挂载原图或生成前阻止超限；不截断原文，确认预览与实际请求逐字一致。
- 未跟踪文件是上述功能所需的源码、规范副本、探针及验证材料。历史失败现场保留并说明，见[内容库管理记录](../production/2026-10-21-desktop-library-manager.md)。构建与缓存产物仍由现有 ignore 规则排除。
- `.gitattributes` 保留参与 SHA256 校验的原始文档/规范副本字节；仅对这些来源文档和原样捕获的日志放宽尾部空白检查，不改写来源或删除失败记录。

## 本轮验证

| 检查 | 结果与范围 |
| --- | --- |
| `npm run check` | 通过；镜像同步、语法及模板生成一致性 |
| `npm test` | 150/150 通过；浏览器原型 |
| `node --test plugin-src/tests/bridge.test.mjs plugin-src/tests/native-handoff.test.mjs` | 39/39 通过；双宿主交接与输入合约 |
| `npm run test:file-library` | 440/440 通过；含固定版本模板上下文与异常拒绝 |
| `npm run test:seeds` | 15/15 通过；内置模板及同事资源字节 |
| `node plugin-src/scripts/import-colleague-resources.mjs plugin-src/resources/colleague-library/sources --check` | 通过；来源、规范副本、索引一致 |
| `node workbench/scripts/legacy-import-recovery-ui-probe.mjs`、`node workbench/scripts/cover-gallery-ui-probe.mjs` | 执行代理先复现再修复，通过旧导入恢复与封面批注预算检查；独立临时数据及模拟 IPC |
| `npm run typecheck --prefix workbench` | 执行代理通过 native 与 renderer 类型检查 |
| `npm run build:desktop -- --auth both` | 通过；darwin/arm64，含类型检查与两套自包含插件市场；`productionReady=false`。保留 Vite 的 bundle 大于 500 kB 提示，本次未引入依赖或扩大至拆包优化 |
| `node --test plugin-src/tests/cover/native-handoff-cli.test.mjs` | 9/9 通过；新构建的双宿主随包 CLI，含重试/切换后的照片、资料和完整要求 |
| `npm test --prefix workbench` | 316/316 通过，未跳过；含桌面绑定、丢失回执恢复、权限拒绝、旧库、原生负载及工作空间回归 |
| `npm run probe:desktop` | 重跑退出 0；required/disabled 两套独立外置副本的 import/reopen 均通过，覆盖真实 sandbox/preload/IPC、utility process + sharp、回执丢失后的页面恢复、来源移除后身份与后续编辑保留，以及缺少发布配置/资源清单的启动拒绝；首轮等待超时及修正依据见内容库管理记录 |

本轮对变更文本做私钥、常见 provider key、AWS key、Bearer token 形态扫描，未发现疑似匹配；这是有限模式扫描，不等同于完整安全审计。提交前另检查暂存差异及空白错误。

未验证真实助手接收与生图、系统文件对话框人工操作、安装后系统信息、Intel Mac 或 Windows 原生运行；`required` 实验构建的探针不表示已接入可信权益或开放业务权限。
