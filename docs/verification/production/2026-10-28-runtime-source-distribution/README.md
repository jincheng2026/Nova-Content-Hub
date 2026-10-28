# A15：运行时来源分发只读核验

日期：2026-10-28。源码基线 `30d15299dc2f0dbfd0a19a35ccae4cf139abb72e`；工作区其他并行修改不属于本调查。本目录仅提供证据和待实施建议，没有修改产品源、stage、commit、构建、联网或执行原方法脚本，没有读取库外 secret。检查器只读取仓库文件与现有生成目录，写入本目录报告。

结论：当前默认学员插件实际包含 4 张原作者人脸照片和 1 份个人默认配置，共 4,536,731 字节。源码原件应继续完整封存，运行时必须有独立分发选择与清单。入口写“只作证据”不能阻止原图暴露。A15 分发项当前尚未通过。

## 证据与确切范围

[inventory.json](inventory.json) 记录四方法与安装说明全部 621 文件的仓库路径、运行时路径、实际字节数、SHA256、原清单 SHA256、逐项一致性、配置引用位置，以及现有 runtime/marketplace 副本。621/621 与 `plugin-src/resources/method-sources.json` 的现有冻结记录一致。此结果是源码对账，不是新的包验收。

明确不应默认分发的路径均位于 `plugin-src/skills/jc-cover-design/upstream/current/`：

| 文件 | 字节 | SHA256 |
|---|---:|---|
| `assets/my-face-alt.JPG` | 199500 | `91315cb5c301c86a8accc03cb6b08305435b4e28e95e5a91c48f168f9017afa3` |
| `assets/my-face-neutral.JPG` | 637174 | `30f4f230a1ce49266785a9945c12d81db48629189df2a87785bd8b8ce880db37` |
| `assets/my-face-studio-default.JPG` | 2367565 | `0a3a716f69d5200c4cc6f7a127fc9c7a4720c3977e567e8d1760c7a17a9ac121` |
| `assets/my-face.png` | 1331268 | `045aa9b0351e64ec7f40a7f853206a6416f40b2772e0ef7db1cedc7a5565d54d` |
| `config.md` | 1224 | `d99fc8cb9dc8a85c0b87d54a69ead338b01b69ed35b5583a9e7dd7b679752ccb` |

判断依据不是仅凭名称：config 第2—5行明确将这四张作为默认/备选身份照片，第7行记录个人本轮偏好；本项目 `SKILL.md` 与 `references/method.md` 明确称其为作者照片/作者素材。通过本地查看确认四个文件都是实际真人摄影。人物姓名依据方法文档语境，不能从面部图像识别姓名。config 没有在本次读取中呈现 API key；这里排除的是个人默认身份/偏好，不能称其为泄露凭据。

现有 `plugin/runtime/auth-disabled/` 与 `plugin/marketplace/auth-disabled/darwin-arm64/nova-content-hub/` 均已存在上述五文件，10 个副本逐项与仓库 hash 相同。没有改动或清理这些生成目录，也不声称这些旧包对应最新源码。

## 方法引用与资源边界

- `jc-cover-design/SKILL.md:8` 要求完整读原方法，`references/method.md:3` 要求按模式读 config。原 `METHOD.md:16` 第一步要求 config；`references/face-reference-policy.md:6,48` 从 config 取默认身份、缺文件时回退；`references/科技姐聊AI.md:9,10` 仍把锦成人像与 config 当作本轮输入。这些是必须适配的行为引用，普通 Markdown 链接校验不会抓到全部反引号路径。
- `CHANGELOG.md:29,33` 是默认照片切换史，可以保留为历史证据，但运行入口不能把它当当前选图指令。
- `assets/examples/` 33 张、`assets/style-references-safe/` 8 张、两份 Codex 图标、完整风格与审美/结构规则，是原方法明确依赖的样例与资源。不能因为包含人物或目录含 safe 就自动判私人或判可合法分发；本调查未逐图核验来源/分发依据。原 `README.md` 与 `references/examples.md` 明确称完整案例是运行时依据，全部删掉会使原 few-shot 方法失效。应独立核对分发依据或以可分发完整样例替换，并保留对应引用/结构映射；不能把摘要当完整方法。
- `jc-review-page/upstream/current/assets/template.html` 是通用页面模板；四方法的 schema/脚本源码/规则与模板不能按“有 assets”批量删。原脚本继续保持 `executable:false`，保留源码不授权执行。
- `jc-kepu-video` 的 `refs-data/index.json` 加 520 份文本是参考语料，不是这四张个人身份照片。其分发依据本次未确认，不能以原包 MIT 或 artifact safe 直接宣布语料可分发。
- 另记录三份作者特定文本（精确 hash 见 JSON）：教程 `references/锦成的口气.md` 明确包含本人发布稿与亲手改句，科普 `references/rules.md` 第四节保存本人候选规则，封面 `references/科技姐聊AI.md` 有锦成身份提示词。这些应作作者证据/结构参照，不能默认灌入学员事实；是否随包提供全文须另有分发决定。本调查未把提及姓名的所有方法文档都判为秘密，也未访问其外部个人路径。

## 当前分发链和完整性风险

1. `scripts/method-sources.mjs:validateMethodSources` 在仓库核每个来源文件的 bytes/hash，拒绝未登记 upstream 文件。这是完整原件证据，应保留原清单和源码字节。
2. `scripts/build.mjs:buildCover` 用 `cp(source/skills,target/skills,releaseSourceFilter)` 全拷。`releaseSourceFilter` 只处理凭据/本地状态/测试目录等规则，并不排除个人肖像和 config。resources 还会复制完整 `method-sources.json`。
3. 同文件 `integrityPaths` 对所有 skill 资源递归枚举，并在最终目标逐项读文件计算 integrity。只在 cp 上过滤五文件会导致后续读缺文件失败；不能以跳过 hash 或减少整体校验来绕过。
4. `marketplace-builder.mjs:validateRuntime` 严格比较 integrity key 集与 `integrityPaths()`；`buildMarketplace` 对整份 runtime 建 snapshot、复制并比对，`package-files.json` 是目标包实际全集。不能在 marketplace 最后删图而保留旧 snapshot。
5. `workbench/scripts/dist.mjs` 将 marketplace 作为 extraResources 包入应用，封装后再次校验；`assistant-runtime.mts` 安装后按 package-files 做完整 snapshot 比对。因此必须从 runtime 生成阶段统一收敛，不能只在学员入口藏起来。
6. `artifact-safety.mjs:assertArtifactSafe` 用 method-sources 给不可执行 upstream 测试证据做 hash 例外，不能删除/放宽这个来源保护。它当前没有个人肖像分发门禁；“无凭据”与“允许公开分发人像”是两种结论。
7. `tests/four-methods-intake.test.mjs` 当前要求四方法每个原件都在 integrityPaths；该断言混合了原件留存和运行包分发，实施时须拆成仓库完整性与 runtime 明确子集两项，仓库621字节对账继续保留。

## 最小实施建议（未实施）

1. 新增单一、按规范化相对路径声明的运行时分发策略/清单；首批明确排除上述五文件。保留完整 `resources/method-sources.json` 和全部 upstream 仓库原件，不修改原始 hash，不在构建中删除来源。避免泛化 `my-face*` 以外的头像/案例名称推断，未分类文件也不能被宣传为“版权审核通过”。
2. `build.mjs` 的 skill copy 与 `integrityPaths()` 共用同一子集函数；resources 复制时将完整源清单替换为**目标子集的生成清单**，记录完整源清单 SHA256、原 versionId/treeSha256 与 included/omitted 状态。原 treeSha256 明确是 source tree，不能冒称目标 runtime tree。可以保留 `nova-method-sources` 兼容结构（files 仅列实际随包且字节未变者），加独立 distribution 元数据；原件完整验证仍在仓库执行。若新增另一格式，必须同步 artifact-safety 对测试证据的读取，不能允许坏清单静默降级。
3. 不要在 `upstream/current/config.md` 同名路径塞通用配置并沿用原 hash。增加独立 runtime-context 映射，适配入口明确：历史 config/原作者图片故意未分发，当前本人身份、比例、模型和偏好取冻结请求；需要人脸却未提供时等待本人输入，不回退到案例中的真人。不必改原 METHOD 字节，但原引用每个适用分支均须有明确映射，不能只放一句“注意隐私”。
4. 同步 `jc-cover-design/SKILL.md`、`references/method.md` 和共享 method-adaptation-contract 的“完整文件随包”表述，区分仓库完整来源与安装包运行子集。registry 的原始 `sourceVersion`/methodBody 保留；若新增运行时适配资源，将它登记到 dependencies 与 integrity，必要时版本化派生产物 provenance。当前 registry 未把上述五文件列为直接 dependencies，风险主要在原方法的行为读取。
5. marketplace 与 desktop 原有 snapshot/密钥检查继续严格；为最终 runtime/marketplace/安装包增加明确禁止路径及这四张人像内容 hash 检查，防止被改名复制。不得把 hash 门禁扩展为人脸识别或从公开样张推断私人身份。
6. 最小回归覆盖：仓库621原件仍逐字节通过；runtime五文件与其人像hash均缺席且不产生悬空必需依赖；原 METHOD/模板/规则和选定可分发案例仍齐全；config→当前请求映射有真实行为测试；伪造/缺失 included 文件、篡改清单、从 omitted 状态复活人像都拒绝；marketplace复制与安装缓存整包校验不降级。现有 `four-methods-intake`、`business-skills-complete`、`method-source-evidence`、`marketplace`、`artifact-safety` 测试需按职责调整后运行。

这五文件排除是明确最小修复，并不足以宣布 A15 全面通过。第三方案例/语料的分发依据、作者样本全文是否随包、学员权益和最终实际安装包检查仍须分别关闭。没有执行构建或测试，本报告仅陈述已完成的文件读取、hash对账和现存包观察。

## A15 最小分发修复实施回执（2026-10-28，后续阶段）

本节追加实施事实，不改写以上只读调查时的结论。实施基线为 `30d1529`，验证时 HEAD 与精确结果见 [implementation-verification.json](implementation-verification.json)；这是工作区实现及隔离 fixture 的证据，不是冻结安装包声明。

- 完整 `resources/method-sources.json` 与全部 upstream 原字节未改；完整来源仍为 58 版本 / 1,039 文件，四方法加安装说明为 621 文件。原 METHOD、模板、规则和脚本的来源 hash 不变，原脚本未执行。
- 新增明确五路径／五内容 hash 策略。技能 copy 与 integrity 枚举共用同一规范化选择；运行包是 1,034 原字节文件子集，四方法加安装说明为 616。目标 `method-sources.json` 兼容原格式，files 只列实际随包原字节；distribution 记录完整清单 SHA256、策略 SHA256、五项 omission 理由／hash／bytes，原 treeSha256/versionId 仍明确指源树。没有把改写的 config 冒充原件。
- `validateRuntimeDistribution` 在 buildCover 最终目标与 marketplace validateRuntime 中执行，desktop 原有 dist 继续复用后者。它从完整源与策略重新派生预期，拒绝旧全量清单、伪造／缺失／篡改子集、遗漏复活、未登记 upstream、五项精确路径及任意改名的五内容 hash。清单本身必须是快照绑定的普通文件。原完整 integrity key 比对、复制前后 snapshot 比对和 artifact-safety 凭据／不可执行测试证据保护均保留，artifact-safety 无改动。
- 独立 runtime-context JSON 与可运行纯 parser 按实际固定 cover request schema 1/2/3 读取本人 photo 与唯一匹配 own-photo；缺本人图进入 waiting-user，无人物分支显式选择。比例、像素、张数、格式和提示词均来自请求。当前请求无 model 字段，明确报告宿主真实工具能力，不继承原作者 GPT-Image 2 默认。薄入口逐项映射 METHOD config、人脸选择／缺图回退、科技姐身份引用、CHANGELOG 和安装说明的历史分支；不改原 METHOD 字节，不新增生图／助手生命周期协议。

RED：最初六项用例均按预期失败（旧 integrity 仍含私人原图、无共享分发 API、无请求映射）；新增清单符号链接用例也先复现缺少拒绝。GREEN：[主回归日志](implementation-tests.txt) 42 项，41 通过、1 项真实 native 集成未执行；[业务与凭据保护](safety-business-tests.txt) 19/19；[最新独立分发回归](distribution-tests.txt) 7/7（与主回归重叠）。覆盖市场复制和移动、完整包 manifest/cache snapshot，且重签 integrity 后的旧清单／原 METHOD 篡改与改名人像仍被拒绝。`git diff --check -- plugin-src` 无输出。

未运行实际 build、安装、原脚本、stage 或本任务 commit。现有生成目录／旧包仍保持原样，必须由集成主线程重新构建后检查 runtime、marketplace 和最终安装产物，不能宣布旧包通过新隐私策略。本次只关闭明确五项最小分发实现；其余完整案例／语料／作者样本的分发依据、真实双宿主、各目标平台、学员权益和签名／公证仍待独立证据。
