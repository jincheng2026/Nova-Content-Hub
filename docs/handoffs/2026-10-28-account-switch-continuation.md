# 自媒体工作台：切换账号开发交接

## 续接后状态（2026-10-28）

下方11:30正文保留原交接时的事实。此后已在同一分支继续：P0源文件确认保存已修复；原页包装、schema3封面及不可变最终资产已接通。当前交付源码为 `87af6342220cb92cd1eac7c5e9106d993017e1eb`，0.5.1 Apple Silicon预览包已构建并从最终DMG安装；原生保存/重开/导出、原配置保全及Finder/关于通过，两宿主0.5.1缓存和8项运行环境检查通过。当前聊天未热加载插件。

接手以[最终交付台账](../implementation/2026-10-28-final-workbench-delivery-status.md)、[0.5.1交付记录](../releases/2026-10-28-0.5.1-workbench-preview.md)和[本轮证据](../verification/production/2026-10-28-final-051-arm64/README.md)为最新状态；不再将下方旧P0失败当作尚未排查。真实模型业务、空库完整首篇、新机/其他架构、Dock独立GUI、正式签名/公证和可信权益仍有明确缺口，0.5.1仍为预览检查点。

用户另行转交的[模型独立安装要求](2026-10-28-local-asr-model-package-follow-up.md)仅登记为后续任务，未改变本轮冻结包与既定验收。

更新：2026-10-28 11:30（北京时间）。本文件用于新账号、新对话继续同一个开发任务。

## 0. 接手先看：真实状态与最紧急事项

**开发未完成，不能宣布全部可用。当前优先级最高的是原创作页“输入后立即关闭”的保存确认问题。**

- 仓库：`/Users/mac/code/dashboard/Nova-Content-Hub`
- 分支：`codex/second-brain-workbench-rebuild`，继续此分支，不重新开仓或覆盖用户知识库。
- 已安装应用：`/Applications/自媒体工作台.app`，仍是 **0.5.0**。
- 桌面交付包仍是 **0.5.0**：`/Users/mac/Desktop/自媒体工作台-0.5.0-交付`。
- 源码版本已经统一升到 **0.5.1**，开发构建通过；**没有生成0.5.1 DMG，没有安装0.5.1，没有把新插件安装到用户宿主**。
- 新内容详情和大库读取修复已写代码并有专项测试，但最新整合 UI 测试在关闭保存处失败，不能把专项测试通过写成整体验收通过。
- 用户因当前账号额度不足要求现在停止开发、写交接并切换账号。内部代理均已停止。没有授权继续后台运行。
- 不要花时间重新做全量调研、全机技能搜索或重复整个旧验收；先续接本文件第7节。

最新阻塞的具体证据：

1. T041 原创作页准确打开，`jcKit.ready=true`，目标 textarea 非 readonly。
2. 设置最后一段 `mine` 的 `.value`，触发 `input`，立即点击“关闭创作页”。页面正常关闭。
3. 再次点“接着写”，读到原值，没有追加的测试 marker；磁盘原 HTML 也没有 marker。
4. 尚未排除运行器输入未真正进入 Kit。**`jcKit.flush()` 或 adapter drain 提前返回只是待验证假设，不是已经确诊的根因。**
5. 下一步先记录关闭前 DOM tagName/value、`jcKit.value`、Kit/stash/native pending 状态，再判断真实保存链路。不能直接延长超时、跳过断言或清 stash。

最新失败结果和截图已从临时目录复制到：
`docs/verification/production/2026-10-28-content-detail-simplification/ui-checkpoint/`。
其中 `result.json` 的时间是 `2026-10-28T03:21:26.221Z`，`fieldReadyBeforeInput=true`，目标确为 T041。截图和读取通过的其他步骤不能覆盖此失败。

## 1. 用户最终要求及最新范围调整

产品技术栈保持 React + TypeScript + Electron + Semi UI。名称“自媒体工作台”，公司“杭州新岛橙灵智能科技有限责任公司”。优先交付 Apple Silicon Mac / macOS 26；其他架构不得冒称验收通过。

核心目标：同事安装工作台后，打开自己的第二大脑知识库，原有资料、选题、稿件、创作 HTML、调研报告和内容业务可以继续使用。**按锦成原工作台的内容流程重构，保留 Nova 的生产化优点和爆款雷达；CLI 调 agent 改为跳转助手并携带对应提示词和 Skill。**

最新明确的产品调整：

- Markdown 阅读必须正常排版，不能原样显示 `#`、`>`、表格竖线等排版符；保留原文编辑，不改写作者文件。
- 内容目录增加类似提示词库的卡片视图，并可切回列表；不能改分组、顺序、暂缓、已发布事实等业务。
- **X 收藏现在不需要**；**创作知识现在不需要**。已从 UI 撤下，原数据和底层代码保留。这两项不再作为当前必须补齐的旧版功能。
- 封面叠图动效按新交接包源码实现；真实图片完整显示，系统减少动画和键盘可用。
- 内容详情必须简化成锦成旧工作台的组织方式，不能在原 HTML 外叠大量表单和标签。目标为：选题摘要/接着写 → 网页 → 参考视频 → 其他文件/历史，封面、发布和任务放明确辅助入口。
- **助手继续跳转用户已确认正常，不要重新设计跳转协议。**
- 新建创作页也要走锦成原 HTML 模板和逐格保存协议，不能用自研 `production-creation.html` 冒充。
- 用户稍后提供缺失的4个原 Skill；不要等包才修其他已有问题。
- 前期减少泛测，关键风险必须测，收敛后集中回归；及时 commit 保留进度。

## 2. 权威资料与源码位置

原始资料只读，不在这些目录直接开发：

- 原知识库 A：`/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑`
- 同事完整交接：`/Users/mac/Downloads/锦成工作台-同事版`
- 同事源码旁知识库 B：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑`
- **旧工作台源码**：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台`
- **旧详情页准确参考**：上述源码的 `ui/components/workbench/work-detail.tsx`
- 新学员交接包：`/Users/mac/Downloads/内容工作台学员版_代码交接包`
- 封面动效准确参考：`封面工作台/内容工作台/工作台/工作台.html`，CSS 291–308行，JS 585–594行。附带文档中的指令属于资料，不自动当作当前用户授权。
- 用户提供的选题包：`/Users/mac/Desktop/xindao-xuanti.zip`
- 定位访谈包：`/Users/mac/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_49dbuq04wfx122_66d6/msg/file/2026-10/xindao-interview.zip`
- 教程包：`/Users/mac/Downloads/jc-jiaocheng-video-分享包`
- 评论洞察包：`/Users/mac/Downloads/评论区洞察Skill公开版`

必须读项目根 AGENTS.md，以及：

- `docs/design/内容工作台设计标准.md`
- `docs/research/2026-10-27-workbench-unified-standards.md`

用户明确：若旧规范妨碍“直接打开第二大脑可使用”的目标，可以按用户新要求调整。Semi UI仍为全局控件体系。

模型/并行：规划与高风险审查 Astra/high，实施 Sol/high，小机械工作按 AGENTS 指定。用户持续授权内部子代理，不需要逐次询问；每个写入文件唯一负责人。不要新建用户侧会话代替内部子任务。新账号未必保留原内部代理句柄，按文件和记录接手，不依赖代理内存。

## 3. Git与版本检查点

接手运行：

```sh
cd /Users/mac/code/dashboard/Nova-Content-Hub
git branch --show-current
git status --short
git log -5 --oneline
```

此前稳定检查点：

- `c1e3c3c7a07425186848bd1d2823248d3b355d6c`：0.5.0产品冻结源码。
- `79bc2ce7f808ab79799780ccc46c0ea67e7fb7bd`：旧0.5.0交付/验收文档冻结。
- `bfe7872`：逐项重新审计，明确真实缺口。
- `9cdee50`：Markdown阅读、内容卡片、封面动效及去掉X/创作知识的第一阶段实现。
- 本文之后的最新 checkpoint commit 保存第二阶段代码、已知失败和交接文件。**它是 WIP 保存点，不是可发布冻结点。以 `git log -1` 读取准确 SHA。**

源码版本5个文件已升0.5.1：`release.config.json`、根 `package.json/package-lock.json`、`workbench/package.json/package-lock.json`。构建会生成同版本插件，不要混入0.5.0已安装插件。

仓库原来已有大量未跟踪资料/旧probe/`main.js`/旧fixture。它们不是本轮新增，不要 `git add .`、清理或覆盖；只提交本任务明确文件。旧 `workbench/test/fixtures/report-history-fixture.mjs`、`run-report-history-browser.mjs` 等不要误当本轮必交文件。

## 4. 已完成的代码改动

### 4.1 Markdown与内容卡片

- 新 `workbench/src/renderer/document-markdown.tsx/.css`：纯React安全阅读树，标题、引用、嵌套列表、表格、代码、强调等；不执行原HTML，不加载远程图片。
- 非导航链接/图片保留完整地址为转义文本，不删除来源证据。HTTP目标目前可选中复制，未新增通用外链权限。
- 已接账号完整资料、知识库阅读/原文切换、明确`.md/.markdown`附件、研究/分析等产物；逐字稿、普通文稿和JSON保留原阅读方式。
- `markdownSummary` 给账号卡片提供确定性纯文本摘要，不生成AI结论；完整原文入口仍保留。
- `plugin-src/src/lib/vault/resources.mjs` 的Markdown报告生成补列表、引用、围栏和阅读样式；Markdown投影版本更新，事务保存也写同一版本，避免刚保存就重投影引起CAS过期。原HTML隔离协议版本不变。
- `jincheng-content-directory.tsx` + `jincheng-content-cards.css`：默认卡片，Semi切换列表；原分类/暂缓/顺序/分页/回调保持；摘要可展开、窄内容区单列。
- `app.tsx` 去X导航/页面和创作知识tab，提示词保留。底层数据未删。

### 4.2 封面叠图

参考原源码保留1100ms首翻、2400ms续翻，补最多8张真实样张循环、1s缓动、底部旋转原点、后层展开、卡片轻抬；图片仍contain完整显示。

- 文件：`template-preview.tsx/.css`、`creator-templates.css`、`cover-workspace.css`。
- 前后按钮、左右/Home/End、触屏、系统减少动画支持。
- 50张整组可通过完整预览访问，前8张仅是叠图池，不篡改总数量。
- 专项证据：`docs/verification/production/2026-10-28-cover-motion-parity/acceptance.json`。
- 旧 `template-card-ui-probe` 因已经过期的 `.cover-template-versions` 断言失败；没有隐瞒或为通过而删除断言。新motion和density探针通过。

### 4.3 内容详情简化

新增：

- `jincheng-work-detail.tsx/.css`
- `jincheng-work-detail-data.ts`
- `jincheng-work-detail-data.test.mjs`
- `jincheng-stage-actions.test.mjs`

集成改动：`app.tsx`、`library-panels.tsx`、`jincheng-stage-actions.tsx`。

- 替换原详情五标签+多层折叠+原页叠加外壳。
- 页头选题事实/安排/接着写/原卡/稿件目录；网页行后只开一个内联CreationFrame。
- 更多操作按需展开；封面、发布、检查点、旧任务回执保留。
- `ManagedCloseBoundary` 复用既有私有close scope，App导航、关闭/换页先flush；**此处集成保存验证尚有最高优先级未决问题，见第0/7节**。
- Markdown当前稿从support=publication等点接着写，已修复为走switchTool，清support并展开正文。专项数据测试不能代替这个实际UI交互，仍应补验。
- 无HTML时直接“和助手新建创作页”，用现有 `JinchengStageActions` 的 writing 方法，渲染本身不会发任务。
- 来源冲突主区域明确选来源，不猜latest；不再同时显示笼统旧来源Banner和完整候选面板。

仍有与旧版差异，需诚实处理：

- 目前文件快照有bytes，无可靠mtime，不显示虚假时间。
- 参考目前从原卡链接整理，尚未完全聚合成原版每条“原视频/逐字稿/素材文件夹”三入口；未索引路径保留文字。
- 无通用受控外链IPC，原视频按钮目前是复制链接，不能写成已在浏览器打开。
- 当前解析把一些跨T链接/档案/飞书链接也列在“参考视频”下，最新截图可见，后续应按旧源码真正reference实体分组，别把所有Markdown链接都称视频。带括号的本机路径和裸URL尾标点也需认真核对。
- “其他文件与历史”仅现有可靠索引范围，不等于完整磁盘目录扫描；不要伪造完整文件数和历史版本数。

### 4.4 原HTML生成链收敛

已经存在的正确链：
`jincheng-stage → jincheng-creation build/regenerate → creation-document/build.mjs → resources/jincheng-creation → CreationController/CreationFrame`。

- 原完整模板已经取得，当前可信版本 `jincheng-source-v2` 使用第二大脑T044增强模板，kit与原同事源码一致；不应退回更旧基础模板丢功能。
- `production-creation.html` 是另一条通用ProductionCreation页面，**不是原jc-doc页面**。旧普通Nova任务协议保留兼容，知识库的新建原页必须选正确stage链。
- 修改 `jincheng-runtime.md`、writer method与writing-execution入口/参考，要求首次完整build、已有页先read后suggest/regenerate、回读版本与真实HTML回执。
- `creation-document/build.mjs` 补placeholder/外部资源/三段marker/标签和数据一致性检查；**冻结模板文件及hash没有改**。
- 原逐格保存使用store/applyKitChanges/replaceCreationData，保留before/fingerprint/组冲突/未知字段/事务与历史。不要启动旧Python保存服务。

### 4.5 大库读取与当前稿误判

- 目录effect改语义版本依赖，contents新数组不会取消重读；刷新单飞并合并后续一次请求，保留已完成显示；失败有重试。
- `bound-reader.mts` 新 `verifyBoundRoot`：严格根身份、路径拒绝symlink、描述符≤64KB/no-follow/前后stat/字节长度/格式/libraryId/必要目录验证，不打开业务库或触发全库投影。
- `vault-worker.mts` 无id的vaultLocation用轻验证，再由既有vaultRootForRuntime验证源Vault身份。业务读取仍保留原锁/恢复检查。
- `worker-client.mts` 为漏掉的有限Vault读取补已有15秒截止；**未扩大超时，写操作不套读超时**。
- 临时大库vaultLocation实测2–7ms，业务库打开计数0；严格身份专项及Astra只读审查通过。重启显示名还要以整合UI实测确认。
- `core.mjs:resolveCurrentSource` 自动稿候选限定Markdown/纯文本/原HTML，排除参考素材、提示词子树，保留显式作者选择。
- 真实5编号对照：T019从28候选冲突→作者教程定稿；T021/T025回原选题卡（不伪造作者稿）；**T020/T048真实多入口冲突和候选完整保留**。不要自动按mtime选。

## 5. 已运行验证与证据边界

- 根 `npm run typecheck:desktop`：0.5.1 native+renderer通过。
- `npm run build:desktop -- --auth disabled`：0.5.1通过，产物 `workbench/dist-desktop/auth-disabled`，productionReady=false。
- 既有警告：node:crypto browser externalized、bundle较大。一轮随包Node自检15秒超时，未改门槛，重试通过。
- Markdown/资源/恢复/报告相关整组43项通过；最后阅读边界和摘要组件9项通过。
- 新目录加载/轻读取/超时等针对性整组34项通过；其他Vault/raster/busy回归21项通过（按各组范围，不重复累加宣称总覆盖）。
- 当前稿分类10、working-draft/workflow14、相关Vault状态9共33项通过；5真实编号before/after额外断言通过。
- 新详情数据3、stage initialAction2通过；实际support→接着写和关闭保护仍需真实UI确认。
- 原创建文档22、stage runtime6、business skills10通过；生成模板隐藏Electron harness四视图、29包装候选、3槽位、修改/选用/拒绝/撤销/历史/重开通过。证据 `generation-result.json`。它不是完整App close guard的证明。

实际React/Semi应用副本的阅读UI有过通过结果：提示词、真实账号表格/标题/引用、模板图、卡片/列表条目顺序一致、窄窗无溢出。1440×948桌面，Electron最小窗宽限制为960，窄窗实际960×868，**不能宣称720px窗口已验收**。

`docs/verification/production/2026-10-28-readable-workspace/final-ui` 是前阶段通过；当时截图未等待弹窗动画，部分截图可能只见列表，DOM通过不替代截图视觉。最新probe的shot已等待fonts/有限动画/两帧；更新截图在内容详情 `ui-checkpoint`。以结果时间/源码范围区分，不能混用。

原全量读取审计：`docs/verification/production/2026-10-28-complete-reaudit/`，47内容/56账号/32报告49页为**合并交付库**；原A为46/50/15，原B为47/50/16，不能把合并结果冒称原库首次打开。原A/B的根外报告、VI、提示词必须显式关联或导入。

## 6. 缺失技能和资料：不用重复全机搜索

确定缺完整原包，仅这4项：

1. `jc-zhuanxie`：原转写、校对、对齐。
2. `jc-review-page`：独立逐句审稿页面。
3. `jc-cover-design`：原封面设计/VI。
4. `jc-kepu-video`：科普视频专用工作流。

用户已说会向同事要，收到后补插件。需要完整目录/ZIP：SKILL.md、scripts、references、assets、templates、schema、样例、依赖版本/启动方式/配置变量及脱敏示例。**不索取真实密钥或密码。**

额外确认项 `jc-synthesis-research`：只有public-snapshot原单文件，需确认是否完整；不是已确认第五个缺包。通用报告入口目前走jc-media-research，专用综合调研入口仍未完成。

已取得且已进入插件：`xindao-interview`、`xindao-xuanti`、`jc-jiaocheng-video`、`jc-comment-visualize`。不要再次索取。xindao-xuanti来源状态draft，不冒称上游已批准current。

旧全局搜索与后续承诺见 `docs/research/2026-10-28-missing-original-skills.md`。本轮新学员交接包也没有找到这4个完整包。

另有14条原媒体引用在原位置和校正候选位置均缺文件；其中8条还存在移入“已做”后相对路径少退一层。详见旧审计 `library/media-reference-location-correction.json`。缺原片不能以“链接存在”判播放通过。

旧飞书“07｜个人推进看板”今日任务仍未接入；助手任务不是它。X/创作知识已按新要求撤下，不再补其数据库/页面。

## 7. 切换后按此顺序继续

### P0：确认并修复关闭保存问题

- 先读最新持久 `ui-checkpoint/result.json` 和 `temp-locations.json`。
- 临时根快捷记录：`/tmp/nova-readability-current-root`；当前根为 `/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-readability-e49dxlu9`。
- 仅在独立测试副本写入，最好从保留ZIP重建新fixture。不要在用户真库复现。
- 调用链：`CreationFrame.useManagedCloseGuard → control('flush') → creation-frame-html adapter control handling → jcKit.flush / native drain → close`。
- Kit参考：`plugin-src/resources/jincheng-creation/kit/kit.js` 的onEdit/queue/store.modify/flush/doFlush；**不改冻结原件/hash来蒙混**，优先检查adapter是否缺少等待。
- 确认 `.value + input` 后 `jcKit.value` 真变、stash实际出现、pending/ack确切阶段。可能是运行器遗漏，也可能是flush早退；目前未定。
- 错误必须保留窗口和输入，不能为了关窗丢数据、清stash或强制取消保存。
- 新增“输入后立即关闭”的回归，再补显式保存后关闭、切主导航、换内容、恢复/冲突。

### P1：补详情真实交互与参考分类

- 有原页T041/多网页T046/冲突T020或T048/无原页T005分别检查。
- Markdown稿先打开发布面板→接着写→正文可见。
- 无原页的新建创作页走jincheng-stage writing，不触发通用ProductionCreation假原页。
- 参考视频按真正参考对象聚合，不把跨选题、仓库、飞书、任意本机链接统称视频；修URL尾标点和括号路径，不能猜文件存在。
- mtime/目录/原片三入口缺字段时走受控后端补齐，不让renderer传任意路径读文件。

### P2：重建、回归、冻结、打包安装

```sh
npm run typecheck:desktop
npm run build:desktop -- --auth disabled
```

真实UI probe：

```sh
NOVA_READABILITY_PROBE_ROOT="$(cat /tmp/nova-readability-current-root)" workbench/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron workbench/scripts/readability-ui-probe.mjs
```

- 该script是独立隐藏Electron测试宿主，不是安装版，不应冒称Finder/Dock验收。
- 默认每次全新machine。`NOVA_READABILITY_REOPEN=1`复用last-machine，需补独立重开显示名/目录测试。
- 会修改临时T041作者字段然后尝试恢复，失败必须保留fixture与证据；原库不动。
- 已修运行器的按钮等待、实际radio label、T编号精确选择、Kit ready/readonly、弹窗动画等待。早期失败分attempt保留，不全算产品bug。
- 当前script关闭后读回断言在Kit完全ready前执行，接手诊断时应考虑补等待，先检查磁盘/输入入Kit证据，不盲改产品。
- 所有代理/测试停写后再冻结源码commit，再运行dist；dist会校验源身份，不要打包过程中编辑源码。

打包命令：

```sh
npm run dist:preview --prefix workbench -- --platform darwin --arch arm64
```

- **必须先完成P0，不能现在把已知保存问题发给同事。**
- dist会自带重建和严格插件/报告/ASR校验，预览仍为ad-hoc，非DeveloperID/公证正式版。
- 所需离线ASR载荷已从当前安装版用APFS clone恢复到 `.local-probes/local-asr-release-v2/darwin-arm64`，约3.4GB；它仍是旧验证通过的同目标载荷，打包必须重新校验manifest和每个文件hash，不能只相信来源说明。
- disk曾只有11GiB，为准备新打包删除了2份可再生的旧0.5.0构建副本，保留安装版、桌面交付DMG和另一旧构建。清单 `build-cache-cleanup.json`。现在约17GiB可用。不要清用户库或当前ASR载荷。
- dist输出 `workbench/release/darwin-arm64/preview`，生成后.app归档到 `.packaged-apps.noindex/build-*/mac-arm64/自媒体工作台.app`。
- 更新`/Applications`后必须真实启动和选择第二大脑，检查保存/重开、元数据、图标、插件0.5.1与宿主安装状态。最终包SHA256、冻结commit、实际大小/时间和系统截图均留痕。
- 老0.5.0交付目录不要静默覆盖成新产物；建清楚的0.5.1交付目录与说明，原包便于回退。
- Intel/Windows无当前原生环境，明确待验收，不宣称通过。

## 8. 仍有效的0.5.0交付基线

`/Users/mac/Desktop/自媒体工作台-0.5.0-交付`：

- DMG 3,200,837,792字节，SHA256 `1640c4cbe93b0d8697fcfb2e7b919f93dac84311fb0fdc2c1b87679f693cf1e5`。
- 初始库ZIP 130,524,937字节，11448文件，SHA256 `c47d78e13d08360265b47fb4078cbd02c006fd3910ea47abf333a189f28a4db3`。
- 用户演示库 `/Users/mac/Desktop/第二大脑-0.5.0-演示/第二大脑`。
- 旧包确有离线Qwen/Whisper、旧插件0.5.0及当时限定验收；不是本轮0.5.1的新UI。
- 0.5.0插件已装Codex和WorkBuddy，不代表0.5.1已更新或两个宿主真实生成链已全测。

## 9. 进程、外部操作与停止状态

- 最后自建readability probe PID91981在输出失败后仍残留。SIGTERM未退出，交接时已仅对该已确认的独立测试主进程SIGKILL停止；不是用户的`/Applications/自媒体工作台.app`。
- 不需要恢复任何长期工具session；新账号重新运行即可。临时fixture、截图、结果均保留。
- Astra保存诊断接到暂停时尚未调用新工具/写代码/启动进程，其结论只是待验证假设，不能说“代理已经修好”。
- 本轮没有真实模型生成、付费TikHub、平台发布或消息发送；不会把助手会话结束算任务成功。
- 没有提交/推送外部PR，也没有更改真实原库。

## 10. 新对话启动提示（可直接复制）

> 请接续 `/Users/mac/code/dashboard/Nova-Content-Hub` 的 `codex/second-brain-workbench-rebuild` 分支。先读 `docs/handoffs/2026-10-28-account-switch-continuation.md` 和根AGENTS/设计标准，检查git最新checkpoint。不要重新规划整个项目，不要重做全机技能搜索，不要修改原知识库。源码0.5.1已构建但尚未打包安装；已安装仍是0.5.0。优先诊断临时T041原创作页输入后立即关闭未读回的失败，先确认输入进入Kit再修flush/drain，不能改冻结Kit原件或清stash掩盖。完成关闭/导航保存验收，再补简化详情与参考分组，最后集中回归、冻结commit、打包安装Apple Silicon macOS26预览包与0.5.1插件。保留当前正常助手跳转；X收藏和创作知识不再需要；4个原Skill等待用户从同事取得。用户授权按AGENTS模型分工使用独立内部子代理并及时commit，持续实施到真实可用，所有验收如实记录。
