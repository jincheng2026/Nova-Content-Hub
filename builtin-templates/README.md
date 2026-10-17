# 自媒体生图模板目录

本目录提供 15 套设计 v3：11 套通用自媒体，4 套 AI 内容。每套已有可选用的高清 PNG 主视觉、固定构图、可替换项和提示词变量；使用内置模板不需要先进行模板拆解。输入标题与比例即可准备生成，其余文字和事实没有材料时省略。

PNG 展示目标视觉；历史 SVG 保留为排版结构草图，不代表摄影、立体材质或 AI 还原结果。`aiTested:false` 与 `accepted:false` 继续如实记录：模板可直接选用，与某次生图是否还原合格是两件事。

## 场景与参考

| 分类 | ID | 场景 | PNG 构图识别点 |
| --- | --- | --- | --- |
| 通用 | builtin-geometry | 观点金句 | 钴蓝大字、黄色立体几何与真实投影 |
| 通用 | builtin-paper | 清单盘点 | 自然纸张肌理、胶带与三行空方框 |
| 通用 | builtin-notes | 知识教程 | 天蓝撕纸、灯泡、问题卡连接两张应用卡 |
| 通用 | builtin-comparison | 对比评测 | 深绿标题、明暗纸卡、同维度同行 |
| 通用 | builtin-magazine | 生活方式 | 宋体、陶土拱门、水面反光与日光 |
| 通用 | builtin-interview | 人物访谈 | 左上宋体、右下真实感虚构人物肖像 |
| 通用 | builtin-lifestyle | 生活场景 | 全幅咖啡桌、窗光、木纹与织物 |
| 通用 | builtin-product | 产品测评 | 黑字蓝标记、无品牌耳机与音箱产品视觉 |
| 通用 | builtin-news | 资讯速读 | 红黑报刊标题，事实／观点／待核实三列 |
| AI | builtin-neon | AI 概念解读 | 深蓝空间、青色玻璃带与紫色光纤 |
| AI | builtin-ai-tool | AI 工具实测 | 透明界面三列：输入、结果、限制 |
| AI | builtin-agent | Agent 工作流 | 输入、计划、执行、验收的横向立体链路 |
| AI | builtin-tech-collage | 科技人物拼贴 | 灰白棚拍、偏右人物、前景设备与任务卡、白撕纸黑字、黄条黑字和紫色细节 |
| 通用 | builtin-big-head | 大头短标题 | 蓝黄折纸、右侧大头近景与左侧三行短标题 |
| 通用 | builtin-life-story | 生活双图叙事 | 上下同一虚构人物的生活摄影、顶部橙色标题与中央薄绿辅助条 |

`img` 与 `shots[0]` 均指向 PNG，后续 `shots` 才是历史 SVG。`generatedReferences` 记录真实 imagegen 调用的图片、实际像素、提示词、日期、工具和未验收状态。

v3 为 geometry、paper、notes、comparison、neon、magazine 新增 6 张 PNG。另 6 张 interview、lifestyle、product、news、ai-tool、agent 沿用既有 v2 PNG，其路径、`templateVersion:2`、来源与提示词记录保持原值。新增 tech-collage、big-head、life-story 3 套人物型原创设计及 v3 PNG，每套另有两张独立生成的 v3 SVG 结构示意。目录定义版本保持 3，旧 12 套完整定义与历史资源保持不变；不表示沿用图片重新生成过。所有图片的实际尺寸和 SHA256 记录于 `../assets/ai-reference-prompts/generated-files.json`。

## 唯一内容源与生成

`catalog.json` 是当前 v3 目录唯一内容源。历史可信定义完整保存在：

- `legacy-v1.json`：原 6 套 v1；
- `legacy-v2-draft.json`：未附 PNG 时的 12 套 v2；
- `legacy-v2-complete.json`：已附 6 张 PNG 时的 12 套完整 v2。

```sh
node builtin-templates/generate.mjs
node builtin-templates/generate.mjs --check
node --test test/template-catalog.test.cjs test/privacy.test.cjs
```

生成器生成 `../原型/builtin-templates.js`，检查 15 套 v3、15 张 PNG 与完整记录，逐字检查全部 36 张历史 SVG，并生成或核对新增 6 张 SVG。旧 12 套的 `assets`、`samples`、`spec` 继续记录既有 v2 SVG 草图；新 3 套记录各自独立的 v3 SVG 构图，全部采用 900×1200 坐标；当前生图规则以 PNG 和 `fixed/anatomy/generation` 为准，不把旧草图的剪影、平面轮廓或折线流程强加给新视觉。

浏览器导出 `window.NCH_BUILTIN_TEMPLATES` 与 `window.NCH_BUILTIN_LEGACY`；Node 导出当前数组，并通过 `.legacy` 导出 30 个旧完整定义。同一 ID 可有多个合法完整历史定义；核心仍逐个完整匹配可信内容。旧任务保留原始请求和版本，用户显式更新模板时才切换定义；目录生成器不写用户数据。

## 设计元数据

保留现有模板字段、`assets/spec/samples/provenance/validation` 和以下设计说明：

| 字段 | 形态与用途 |
| --- | --- |
| audience / scenario / contentType | 内容分类、场景和内容类型 |
| useCases | 具体适用任务数组 |
| anatomy | `{region,role,rule,editable}` 分区规则 |
| generation.intent / subjectPolicy | 生成目标与人物、产品、概念画面的边界 |
| generation.textPolicy / referencePolicy | 文字逐字核对与参考图使用范围 |
| generation.promptTemplate | 含英文 `{variable}` 的可填提示词骨架 |
| generation.negative / qualityChecks | 禁止内容与验收问题 |
| generation.variables | `{key,label,required,example}` 变量数组 |
| generatedReferences | 真实 AI 调用记录，保留生成时版本 |
| supportedRatios / ratioValidation | 主参考及其他比例的验证边界 |

必填为 `title`、`ratio`。`topic` 可沿用标题，`subject` 可沿用主体规则；`supportingText`、`facts` 没有材料时省略，不补造事实。核心继续使用既有生成请求契约，将本次已填提示词转成执行说明。

随包人物样图全为虚构。新增人物模板默认以用户明确选中的本人照为唯一身份依据，不继承样图人物的五官、发型或服装；未选照片时可做无人版，任务需要人物但没有照片时提示上传。PNG仅参考风格与构图，本人照参考身份，服装遵循本人照或单独明确的服装参考。真实肖像、产品、新闻、引语和实测数据只使用有权且有依据的输入。AI 画面中的界面、图表与验收图标不证明真实工具已执行。1:1、16:9 仅提供重排建议，尚无这些比例的生图还原验收，不应直接裁切 3:4。

## 方法来源和许可

2026-10-17 联网核对 GitHub 原始文件及固定 commit `1567581c26ec29f4216c6e6835415bf30343b0e3`，借鉴方法而未复制图片、模板、美术资产、程序或完整提示词：

- [baoyu-xhs-images 原始 Skill](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-xhs-images/SKILL.md)：将内容类型、风格、配色和信息布局分别描述，参考图的用途单独记录。
- [baoyu-cover-image 原始 Skill](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-cover-image/SKILL.md)：区分封面的主体类型、渲染、文字密度与情绪。
- [上游 MIT 许可](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/LICENSE)；项目已有的完整许可见 [baoyu-MIT.txt](../plugin-src/references/licenses/baoyu-MIT.txt)。上游第三方素材仍需单独核对许可，MIT 不自动覆盖所有外部图片。

另只读研究本机 `Nova-Travel-Marketing-dashboard/plugin-src/skills/nova-travel-poster/references/海报/` 下的模板库、拆解、出图写法、检查文档，借鉴“设计规则、变化范围、来源、验收状态分别记录”的工作组织方法。该材料为专有许可；未复制其代码、图、文案、提示词或模板定义，也未访问真实旅游活动库。

我方 SVG、元数据与生成器标记 `project-original` 只表示原创来源，不等于授予 CC0、MIT 或其他开源许可；项目许可由权利人确定。人物身份、机构、真实平台规格与流量效果均无虚构背书。

## 验证范围

生成器检查稳定 ID、15 套分类、v3 版本、30 个完整历史定义、元数据形态、提示词变量、SVG 安全与历史字节、全部 PNG 签名及实际尺寸、3:4 比例、高清像素、提示词存在性，以及清单中的字节数和 SHA256。定向测试还核对预览顺序、旧 12 套定义摘要、六图沿用来源、新人物身份边界、新 SVG 可再生成结构、必填变量和 schema 对错误资源类型的拒绝。

文件校验与目录规则不等于 AI 还原验收；未执行真实主题逐张再生成验收、跨系统字体测试或 1:1/16:9 生图验收。应用构建、核心历史迁移和浏览器交互由主线程统一验证。

历史 [v2 原图联系表](evidence/source-contact-v2.png)、[v2 换标题联系表](evidence/reference-contact-v2.png) 与 `evidence/validation-v2.json` 仅证明当时的 SVG 排版检查，不用于宣称 v3 PNG 还原通过。
