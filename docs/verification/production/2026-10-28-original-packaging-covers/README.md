# 原页包装封面 A1 验证

日期：2026-10-28。范围为当前开发源码；未构建、安装或真实生图。所有写入仅发生在自动创建的临时 fixture 库，没有更改用户原库。

## 行为与来源

- 封面 schema 3 从受控包装快照取得 title、coverText、description 和独立当前稿；renderer 仅交回四项包装选择身份。标题与封面文字必须可用，description 缺项保持空值与来源 issue，不从旧通用包装补齐。
- exact / ratio-minimum 均保留；schema 1/2 沿既有语义读取。所有新字段纳入 inputHash/requestHash，历史包校验身份、字段 hash、inputHash 及正文快照，活源改变或原 HTML 被移除后仍可读取已提交历史。
- inspect、find 恢复、create、attempt、claim、提交前后、worker/native handoff 使用同一来源检查；Vault 锁先于 runtime 锁，异步图片解码在锁外进行。已有故障 hook 的 coverAfterDecode 阶段改源后，最终提交被拒绝且候选未登记。
- MD/TXT 当前稿不因选择包装 HTML 被替换。单一包装页仍由用户明确选择，正文保留精确 UTF-8 文本，包括 CRLF、空行和缩进。
- A0 `readVaultPackaging` 的直接读取证据是纯读。桌面 worker 的 readCoverPackaging 通过既有 verifiedBoundReader，允许正常的恢复/投影维护；两者不能混同为同一种无写读取。

## 验证

先失败再通过的专项覆盖：缺失来源接口、绕过原页输入、丢失 create 响应后的 find 恢复、schema 3 未知键拒绝；另覆盖真实解码后改源、独立 Markdown 当前稿、worker 活源与历史读取边界、UI flush 顺序/失败、只读渲染与候选显式选择。

- `node --test plugin-src/src/lib/file-library/test/cover-original-packaging.test.mjs`：7/7 通过。
- `node --test workbench/test/cover-original-packaging.test.mjs`：6/6 通过。
- `node --test plugin-src/src/lib/file-library/test/cover-jobs.test.mjs`：82/82 通过（既有 schema 1/2、claim/commit/recovery 等回归；schema 3 最后补强未改变其分支）。

- `node --test workbench/test/covers.test.mjs`：42/42 通过。
- `node --test plugin-src/tests/native-handoff.test.mjs plugin-src/tests/cover/native-handoff-cli.test.mjs`：55/55 通过。
- `npm run typecheck`（workbench）：native + renderer 均通过；最后仅原页文本换行样式微调后，renderer 类型检查与界面专项再次通过。
- `git diff --check`：通过。

实际桌面 UI、真实图片生成、安装包与各平台/架构运行均待主线程后续验收；本记录不宣称宿主端到端生图已验证。

## 设计规则核对

- Cover-01：同一个模板/图片执行链；原页已采用包装只读展示，候选和请求身份保留。
- Reading-02：采用标题全文换行展示；封面文字、简介、当前稿均可展开读全文，四项精确来源文本均保留作者换行，并允许长文本断行。
- Controls-01：不可用/缺项阻止生成；错误可见，明确选择包装页后继续。
- Surface-03：复用现有 composer、details、选择控件，不另建工作流界面。
- Acceptance-02：已有实际组件渲染回归；真实桌面可见性及交互由主线程 probe 单独留证。

## 串行集成点

主线程 C 负责 readCoverPackaging IPC/白名单/controller/preload 总注册，以及将 CoverPanel.flush 接到详情已保存保护。B 在本 A1 后独占 file-library，补顶层 readSelectedCoverSnapshot，供最终资产冻结实际人工选用图片；该 helper 不由 A1 并行实现。
