# 助手产物固定分类归档验收

范围：用户选择按当前内容库固定分类。共享纯函数 `productionArchiveCategory(task)` 为核心、助手交接与界面提供同一分类：research→调研报告；analysis 且有关联账号→账号拆解；其他关联内容→内容项目；其余→创作知识。

受控目录为 `知识库/助手产物/<分类>/<taskId>/<attemptId>/<generation>/`。每个版本实际写入 `结果.md`、`结果.json`、`manifest.json`；原报告 HTML 和媒体仍保存在当前库的 CAS 资源目录，投影以经过校验的相对链接关联，不复制为可执行 HTML。manifest 绑定 libraryId、分类、任务、尝试、requestHash、receiptHash、resultHash、状态、全文文件 SHA256 与资源信息，不记录绝对库路径。

事实事务与投影分离：submitTask/acceptTask 成功后在同库锁内重新读取真实回执，生成投影。文件 fsync、暂存目录与 rename 完成发布；只有 submitted/accepted 的真实回执可归档。失败返回临时 archiveWarnings，原回执与知识 candidate 状态保全，不把归档失败报成提交失败。CLI 与桌面验收回执均保留警告。

已有版本的清单、文件或陌生条目不匹配时保留现场并 ready=false，不覆盖人工修改。待验收→已验收生成新版本。缺少关联资产时 ready=false；资源恢复后可重建。Markdown 明确要求人工整理另存或进入知识管理编辑。

手工入口只接收任务 UUID；worker 按当前库生成受控位置。main 再检查 ready、固定分类与路径、库根身份和逐级符号链接，之后仅请求系统打开目录；没有启动 AI 对话，也不在外部浏览器直接执行报告 HTML。

## 验证

2026-10-27：以下专项共 11 项全部通过：

- 插件核心 8 项：真实 submitted/accepted 全文与清单、知识仍为 candidate；关联 HTML 的真实 CAS 字节；回执/原稿不变；claimToken 不进入投影；幂等及删除重建；翻页不产生新版本；路径穿越和符号链接拒绝；人工编辑保全；投影发布故障不回滚并可恢复；失败后第二尝试独立归档；跨库隔离；四类目录；缺 CAS 后恢复；递归整库备份恢复。
- 桌面 3 项：worker 仅接收库绑定任务 ID，拒绝额外 path/attempt 字段与错分类；主程序路径检查拒绝目录祖先被换成 symlink；验收归档失败时仍返回 accepted+warning 且没有待恢复事务。

执行命令：`node --test plugin-src/src/lib/file-library/test/production-archive.test.mjs workbench/test/production-archive.test.mjs`。

`npm run typecheck --prefix workbench` 的 native 与 renderer 通过；新增 JS 语法检查及 `git diff --check` 通过。主线程另运行全套回归与统一构建；独立 UI 代理负责真实 Electron 界面探针。

上述故障注入和任务产物均为隔离测试，不证明真实外部助手执行、付费服务采集、系统文件管理器人工验收、最终安装包或其它 OS/架构通过。原契约不允许重试 submitted/accepted；两次尝试测试使用第一尝试 failed、第二尝试 submitted，没有更改该规则。
