# gbro-cover-design 只读研究与可选择优化方案

日期：2026-10-21。研究范围：用户指定仓库全部受版本控制文件、全部 10 份风格模板和 8 组提示词，逐张查看 8 张样图；对照本项目 0.3.34 的五个 Skills、公共视觉指南及模板/封面任务核心。这里只提出方案，未安装上游 Skill、调用图像生成、修改产品代码/配置/用户库、运行测试或构建。

## 1. 结论与证据边界

这个仓库最有价值的是“把构图说清楚”的提示词写法：明确手与道具的关系、主体比例、前中后景、标题位置，并以分风格模板和成品示例帮助表达。Nova Content Hub 当前已具备多数对应方法和更严格的执行、证据、版本、人工验收契约；建议先挑选少量需要补强的文字示例，不整包移植，也不重建另一套模板系统。

已核对的上游事实：

- 固定提交 `8d1a0a5487e9ee6539b2b0a471b58469aadfedd6`，提交时间 `2026-07-15T21:36:52+08:00`，提交说明为版权持有人修正；从 GitHub 只读 clone 到 `/tmp/nch-gbro-research-20261021` 后以 `git rev-parse HEAD`、`git log -1`、`git ls-tree -r` 核对。[固定提交](https://github.com/pyang5166/gbro-cover-design/commit/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6)。
- 只有一个 `gbro-cover-design` Skill；没有名为 VI 拆解、验收还原、目录归档的独立 Skill，也没有执行脚本、输出 JSON schema、模型调用器、任务服务或测试。所谓固定/变量是每份风格 Markdown 的设计栏目。完整文件树见下节。[SKILL.md](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L8)
- 交付物是中文生图提示词，由用户另行提交给图像模型；README 明确不需要 API key，Skill 明确不直接调用模型。[SKILL.md](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L23)
- 本地对照版本为 `package.json=0.3.34`、HEAD `a566c620061324763da42697d39987f9199eea46`。以下“已有”均指该源码的声明/实现，未代表已安装包或真实宿主视觉验收。[package.json](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/package.json:4)

### 与用户交接包 cover-vi 的来源区别

用户交接包里的 `cover-vi` 是另一份本地 Skill。补充只读核对其关键段落可见：它要求逐张原图观察、先看后归纳、每条规则包含适用范围/证据/例外/边界，写 `study.json` 再导出 `VI拆解.md`，并有引用、频次和网页对照检查流程；范围止于研究，不自动生图。其脚本和文件指令本次未执行。相关依据：[研究边界](</Users/mac/Downloads/内容工作台学员版_代码交接包 2/封面工作台/内容工作台/.codex/skills/cover-vi/SKILL.md:12>)、[逐图观察、证据与导出](</Users/mac/Downloads/内容工作台学员版_代码交接包 2/封面工作台/内容工作台/.codex/skills/cover-vi/SKILL.md:37>)、[完成门槛与复用边界](</Users/mac/Downloads/内容工作台学员版_代码交接包 2/封面工作台/内容工作台/.codex/skills/cover-vi/SKILL.md:81>)。

因此，讨论“拆解研究质量”应以该本地 cover-vi 与 Nova 当前的证据契约比较；gbro 仅作为封面提示词与风格例子的补充知识。不能把两者混称同一个开源仓库的能力，也不能把本地交接包的导出/归档脚本当成 gbro 所有。

## 2. 完整文件树与逐文件核对

固定提交共有 24 个受版本控制文件。`config.md` 与 `assets/my-face.*` 只是运行时约定，不在提交中。

```text
.gitignore
LICENSE
README.md
SKILL.md
assets/.gitkeep
assets/examples/01-让AI做我老板.webp
assets/examples/02-下一代Agent来了.webp
assets/examples/03-3个Skills一个运营部.webp
assets/examples/04-别再自己操作电脑了.webp
assets/examples/05-我真不该做这期视频.webp
assets/examples/06-一键制作拼贴动画.webp
assets/examples/07-养Agent晚了还有救吗.webp
assets/examples/08-AI生视频不是模型.webp
references/examples.md
references/style-01-深色渐变风.md
references/style-02-纯色扁平风.md
references/style-03-产品主视觉风.md
references/style-04-对比卡片风.md
references/style-05-极简留白风.md
references/style-06-海报拼贴风.md
references/style-07-人物侧置留白风.md
references/style-08-背影构图风.md
references/style-09-局部出镜风.md
references/style-10-正面对视风.md
```

[固定文件树](https://github.com/pyang5166/gbro-cover-design/tree/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6)；[未提交配置约定](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/.gitignore#L1)。已完整读取 904 行 Markdown/许可文本，包括 README 92、SKILL 151、LICENSE 22、示例 209 和风格模板合计 430 行。

### 主 Skill 的输入、流程和输出

| 环节 | 上游实际约定 | 适用边界 |
| --- | --- | --- |
| 初始化 | 检查 Skill 目录内 config.md；首次询问默认正脸照和常用多图模型，将配置写回 Skill 目录。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L16) | 本项目已有照片库与选图，不能把用户照片写进可升级的插件缓存。 |
| 读内容与选方向 | 读文章，推荐 1–2 种风格并给理由，提出 1–3 个 4–8 字标题候选。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L41) | 只适用于尚未确定方向的创作前阶段；固定 handoff 后不能改标题。 |
| 参考图 | 图 1 固定人脸，图 2 起为产品/UI 等；无脸照可改用人物描述。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L58) | Nova 以 role/hash 定位，不能靠序号猜角色，也不能用样图人物代替用户。 |
| 视觉选项 | 集中询问表情、背景、字体、字色；未答交给模型；背影跳表情。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L69) | 可借用只问缺项，不应强制每次三轮。 |
| 组织提示 | 按需读所选风格模板，再读最接近的完整示例；突出姿势、主体和空间关系。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L113) | 应保留当前模板组已读取的证据，并限制 few-shot 的影响范围。 |
| 通用输出 | 固定 3:4；关键元素约 10% 边距；标题加引号；提醒逐字复核。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L128) | 比例服从当前请求；边距服从模板。这里只有文字建议，没有机器校验。 |
| 字体补充 | 可选超粗方正中文标题、黄色关键词块与白色其他标题。 [依据](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L141) | 这是特定视觉方向；不是所有模板的全局品牌或字体标准。 |

上游没有明确的文件输出名、实际生成 prompt 的机器回执、图片数量/像素/文件哈希校验、失败重试身份、验收状态或版本迁移；不能从“产出了提示词”推导“图片已生成或模板已验收”。上面的流程事实均来自唯一 SKILL 和完整文件树。

### 十种风格逐项核对

所有风格都声明 3:4、以人物为中心的参考角色、约 10% 安全边距；各模板同时有可替换项和填空式自然语言提示。下表仅提炼差异，不把提示中的比例当成测量或生成保证。

| 风格 | 具体设计关系 | 必须适配或补足 |
| --- | --- | --- |
| [深色渐变风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-01-%E6%B7%B1%E8%89%B2%E6%B8%90%E5%8F%98%E9%A3%8E.md#L1) | 深色背景，人物前、大字后，少量前景物件；详细叙事动作。 | 适合有明确主体的模板分支；不强加高饱和与半身人物。 |
| [纯色扁平风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-02-%E7%BA%AF%E8%89%B2%E6%89%81%E5%B9%B3%E9%A3%8E.md#L1) | 纯色背景、近大远小道具；主体饱和度高于背景。 | 近景道具与动态模糊不能损伤文字、产品细节。 |
| [产品主视觉风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-03-%E4%BA%A7%E5%93%81%E4%B8%BB%E8%A7%86%E8%A7%89%E9%A3%8E.md#L1) | 产品/截图约 60–70%，人物小而引导；图 2 必需。 | 先核对用户真实素材；无截图时不能凭空生成真实产品证据。 |
| [对比卡片风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-04-%E5%AF%B9%E6%AF%94%E5%8D%A1%E7%89%87%E9%A3%8E.md#L1) | 双卡片一亮一暗、一大一小，用两手和透视表达前后对比。 | 对比文字和结论必须来自资料，不能自动把 B 描绘为失败。 |
| [极简留白风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-05-%E6%9E%81%E7%AE%80%E7%95%99%E7%99%BD%E9%A3%8E.md#L1) | 留白超过 60%，人物约 20–25%；少元素、轻字重。 | 不能再叠全局超粗爆款字样；留白数值仅是该风格选择。 |
| [海报拼贴风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-06-%E6%B5%B7%E6%8A%A5%E6%8B%BC%E8%B4%B4%E9%A3%8E.md#L1) | 前中后景分层，明确遮挡关系；建议额外素材。 | 只使用本次选中的素材，数量与内容不可自由扩张。 |
| [人物侧置留白风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-07-%E4%BA%BA%E7%89%A9%E4%BE%A7%E7%BD%AE%E7%95%99%E7%99%BD%E9%A3%8E.md#L1) | 人物占宽约 25–35%，对侧约 60–70% 供标题。 | 是构图分支，不是固定人物身份；长标题需真实检查。 |
| [背影构图风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-08-%E8%83%8C%E5%BD%B1%E6%9E%84%E5%9B%BE%E9%A3%8E.md#L1) | 背对镜头、目标在前方、标题宽松；跳过表情。 | 模板正文并未实际引用图 1，不能据此承诺面部一致性。 |
| [局部出镜风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-09-%E5%B1%80%E9%83%A8%E5%87%BA%E9%95%9C%E9%A3%8E.md#L1) | 手/半脸/侧脸只占边缘约 15–25%；产品为主。 | 正脸照不提供手部外观证据，不能自动作为手部一致性依据。 |
| [正面对视风](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-10-%E6%AD%A3%E9%9D%A2%E5%AF%B9%E8%A7%86%E9%A3%8E.md#L1) | 人物直视镜头，文字上下夹住脸，不挡眼嘴。 | 标题拆分必须保留准确文字，不自动改文案。 |

### 8 组文字示例与 8 张成品图

文字示例是作者声明的“按成品逆向还原”提示，用于学习描述具体程度；不是存有生成参数的实验记录。文字示例的标题依次为：双面特工、再见了 Figma、角色一致、动画自由、Claude 鞭子、MYTHOS、前端设计、养虾必备。它们与 `assets/examples/` 的 8 张文件名/画面标题不同，仓库未提供一一配对 manifest、生成工具、种子、时间、真实输入照或验收记录。

[文字示例声明及全文](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L1)；[README 成品图列表](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/README.md#L13)。

| 文字示例 | 可借鉴的表达方法 | 核对来源 |
| --- | --- | --- |
| 双面特工 | 大主体在上、头和双臂在下，四字形成框架。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L7) |
| 再见了 Figma | 把手部动作、斜向道具与另一物件的去向说清楚。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L33) |
| 角色一致 | 托举关系与前中后景、主副标题分级。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L56) |
| 动画自由 | 分别说明两个素材的位置、比例和手势指向。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L82) |
| Claude 鞭子 | 动作弧线、被作用对象、少量主题符号。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L109) |
| MYTHOS | 画面中两个主体互看，底部通栏标题与遮挡。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L135) |
| 前端设计 | 截图作主体，人物引导，局部元素运动方向。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L160) |
| 养虾必备 | 将抽象主题变成可见动作，标题两行错位。 | [对应段落](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L187) |

以下样图均已逐张打开查看；尺寸用 macOS `sips -g pixelWidth -g pixelHeight assets/examples/*.webp` 读取，未修改图片。视觉描述是本次观察，不是作者附带的解释。

| 文件 | 实际像素/比例 | 可见构图观察 |
| --- | --- | --- |
| [01-让AI做我老板.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/01-%E8%AE%A9AI%E5%81%9A%E6%88%91%E8%80%81%E6%9D%BF.webp) | 1024×1536，2:3 | 顶部巨大白字；下方人物持左右两张卡，近景亮卡与远景旧纸对比。 |
| [02-下一代Agent来了.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/02-%E4%B8%8B%E4%B8%80%E4%BB%A3Agent%E6%9D%A5%E4%BA%86.webp) | 1086×1448，3:4 | 白标题与黄底关键词；左侧产品界面、右下人物手指引导。 |
| [03-3个Skills一个运营部.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/03-3%E4%B8%AASkills%E4%B8%80%E4%B8%AA%E8%BF%90%E8%90%A5%E9%83%A8.webp) | 1086×1448，3:4 | 标题以加号/等号组织，人物在机器人队列前；黄块突出数字。 |
| [04-别再自己操作电脑了.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/04-%E5%88%AB%E5%86%8D%E8%87%AA%E5%B7%B1%E6%93%8D%E4%BD%9C%E7%94%B5%E8%84%91%E4%BA%86.webp) | 1086×1448，3:4 | 上方人物持放大镜，下方小场景分布任务与箭头标签。 |
| [05-我真不该做这期视频.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/05-%E6%88%91%E7%9C%9F%E4%B8%8D%E8%AF%A5%E5%81%9A%E8%BF%99%E6%9C%9F%E8%A7%86%E9%A2%91.webp) | 1086×1448，3:4 | 顶部两段大标题，人物捂脸，手机界面在人物后方。 |
| [06-一键制作拼贴动画.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/06-%E4%B8%80%E9%94%AE%E5%88%B6%E4%BD%9C%E6%8B%BC%E8%B4%B4%E5%8A%A8%E7%94%BB.webp) | 1086×1448，3:4 | 撕纸边缘、撞色；人物持两张对比卡，近景卡片更大。 |
| [07-养Agent晚了还有救吗.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/07-%E5%85%BBAgent%E6%99%9A%E4%BA%86%E8%BF%98%E6%9C%89%E6%95%91%E5%90%97.webp) | 1086×1448，3:4 | 暖色桌面场景，夸张头身比例；旁边显示器与上方问题标题。 |
| [08-AI生视频不是模型.webp](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/assets/examples/08-AI%E7%94%9F%E8%A7%86%E9%A2%91%E4%B8%8D%E6%98%AF%E6%A8%A1%E5%9E%8B.webp) | 1086×1448，3:4 | 左上标题、右侧人物，下方微缩摄影棚与可见操作动作。 |

### 需要保留的反例与未知

- 第一张样图的实际比例是 2:3，与主 Skill 的固定 3:4 声明不同；因此这组示例不能作为 3:4 输出合规的证明。其余七张是严格 3:4。
- 通用规范说不要发光特效，但文字示例出现发光铅笔、发光窗口、发光卡片/霓虹符号；对比卡片模板也允许亮/发光前景。可以保留特定模板选择，不能把互相冲突的文字一起拼入系统规则。
- 通用规范说只写正向描述，但纯色与极简模板含否定限制。真正应该保留的是清楚的约束，不必把“只用正向描述”做强制协议。
- 全部成品图可见同一外观人物，不等于仓库提供了本人照或授权证明。不能从外观相似推导真实身份、生成稳定率或素材复用许可。
- 部分样图的标题、卡片或肢体贴近/越出边界；本次没有逐元素测量，不报告“全部满足 10%”。这也不是任何平台官方安全区规范。

来源：[通用约定](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L128)、[发光道具](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L33)、[霓虹示例](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md#L187)、[否定限制](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-02-%E7%BA%AF%E8%89%B2%E6%89%81%E5%B9%B3%E9%A3%8E.md#L35)；样图链接见上表。

## 3. 与本项目 0.3.34 的契约对照

| 能力 | 本地已有事实 | 对上游方法的结论 |
| --- | --- | --- |
| VI/模板拆解 | template-study 已要求逐图事实、固定/变量、规则回指和未知；公共指南还要求记录组内反例。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/skills/nova-content-template-study/SKILL.md:17) | 已有，不新增同义 Skill。 |
| 细致构图 | 公共 cover-design-review 已规定镜头、动作、接触点、遮挡、准确文字和人物身份；先全组再选分支。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/references/cover-design-review.md:15) | 有增量的是好例子和完成尺度，不是新工作流。 |
| 模板资料结构 | anatomy 与 generation 已可容纳区域、角色、可变项、提示骨架、变量及质量清单。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/schemas/template-design.schema.json:29) | 可放重写后的风格卡，不需要先加全局分类字段。 |
| 真实执行入口 | template-execution、cover-execution 从固定 handoff context 逐个读输入，再 claim/submit；宿主和任务匹配。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/skills/nova-content-cover-execution/SKILL.md:13) | 不能将 upstream 的自由会话初始化置于执行后。 |
| 整组学习与首图还原 | 模板请求绑定模板版本/packageHash、整组有序 styleAssetHashes；restore 指定第一张来源与 PNG。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/template-jobs.mjs:73) | 上游按需加载一个风格不能替代学习整组输入。 |
| 规则提交 | 规则回执严格仅含 fixed/variable/evidence；每条规则须 sourceAssetHash、ruleType、ruleIndex、observation。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/template-jobs.mjs:274) | 上游“固定/变量”栏目可参考，但要按实际原图重写且补真实证据。 |
| 人工验收 | 提交报告为 pending-human-review；用户接受时校验 request/result/sourceVersion/sourcePackageHash，保存新版本。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/template-jobs.mjs:361) | 不能把生成提示、自评相似、产出图直接当 accepted/aiTested。 |
| 人物/素材角色 | 封面请求 styleAssetHashes、photo、materials 独立；本人照必须 isOwnPhoto、ID/hash 一致，photo 可 null。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/cover-jobs.mjs:193) | 图1固定人脸的约定应转为角色映射，不建立全局默认脸照。 |
| 数量/比例/格式 | count 1–20，png/jpeg/webp；exact 精确像素、ratio-minimum 严格同比例且两维达到最小值；输出去重与 hash 核验。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/cover-jobs.mjs:580) | 固定3:4与自然语言安全区绝不能覆盖现有请求。 |
| 归档 | 模板按 模板/ID/学习任务/请求/尝试；封面按 内容/ID/封面任务/请求/尝试；收件按回执hash保存。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/cover-jobs.mjs:95) | 继续由核心处理；不上移为 ~/.claude/skills 中的手工目录。 |
| 生成原始文件 | 真实执行 Skill 要求原字节、全部标识和元数据保留，复制 SHA256 对齐，不能裁剪/重编码凑规格。 [本地证据](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/skills/nova-content-cover-execution/SKILL.md:29) | 示例文件不是本次输出，不能复用入库或修改后当新图。 |

补充：旧的 `nova-content-template-study` / `restore` / `cover` 三个业务 Skill 仍保留原型 `executable:false` 的停止说明；真实桌面使用两个 `*-execution` 的 handoff 路线。不能为了采用上游流程删掉这些边界，也不能把模板导入格式 `varies/sourceIndex` 与真实任务提交的 `variable/sourceAssetHash` 混用。[旧导入入口](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/skills/nova-content-template-study/SKILL.md:6)、[真实提交格式](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/skills/nova-content-template-execution/SKILL.md:20)。

模板产物归档已保存 `回执.json`、`规则证据.json`、`还原.png`、`结果.json`、`校验报告.json`；封面保存回执、图片与报告。现有回执没有“实际展开后的完整生成 prompt”字段；业务指南要求保存提示和参考关系，这与核心结构化归档能证明的范围需要分开。不能靠给现有严格回执偷偷加字段解决。[模板归档](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/template-jobs.mjs:344)、[封面归档](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/src/lib/file-library/cover-jobs.mjs:643)、[提示记录要求](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/references/visual-workflow.md:34)。

## 4. 可逐项选择的优化方案（均未实施）

本节为建议，不是上游或当前产品已经实现的能力。每项可单独选择；不默认全做。

| 选项 | 用户能得到什么 | 最小实施范围与适配 | 第一项验证 | 建议 |
| --- | --- | --- | --- | --- |
| A. 构图描述前后对照 | 看出“高级感”如何变为手势、道具、标题、空间关系 | 在现有 cover-design-review 补 2–3 组原创短例，保持全部既有字段；不复制原文/样图 | 同一已有 handoff 输入，检查提示能逐项指向实际素材，固定内容没有被示例带跑 | 优先，改动小 |
| B. 已有模板的构图分支 | 同一风格能产出有意义的不同候选 | 在已验收模板允许范围内写清产品主导/侧置标题/对比叙事分支；复用 anatomy/generation；不能一次塞十种陌生风格 | 用短标题、长标题各检查布局，检查分支有真实样图依据；真实出图仅在用户选定后执行 | 按当前模板需要选 |
| C. 缺项集中收集 | 还没选定创作参数时，一次看清待补内容 | 仅创作前提供推荐和缺项；已固定 handoff 不再跑三轮，不自动缩短标题 | 对“输入齐全”“只有产品图缺失”“无人封面”三类检查是否只问必要项 | 可选，不能增加审批步骤 |
| D. 参考角色说明 | 用户明白哪张管脸、哪张管布局、哪张必须保留产品信息 | 在已有回显中更明确 role/hash→工具参考序号的对应；只使用当前选中图片；不给任务加新的身份来源 | 调换样张、本人照和产品图输入顺序，文字角色仍准确；无人请求没有人物提示 | 方法已有，先查实际痛点 |
| E. 原创 few-shot 示例库 | 助手得到具体写法而不被单一人像风格支配 | 使用本项目原创/获准材料制作少量配对示例；每例注明适用模板与哪些只借方法；先读全组再择例 | 至少包含无人、长标题、浅色极简三类反例，防止统一变成黄黑粗字 | 有实际生成退化时再加 |
| F. 反例与冲突检查 | 避免“全组固定”规则实为单图特点；避免比例/光效/字体互相打架 | 沿用已存在的证据与未知说明；把本研究发现作为审查用例，不把上游样图放进产品库 | 固定规则遇反例应标分支或降为变量；3:4 请求不能被 2:3 示例覆盖 | 优先验证现有执行质量 |
| G. 提示词与真实样图成对留证 | 能追溯某张候选究竟用了哪些提示与输入 | 若要成为可审计能力，需要另行设计版本化结果扩展与工具事实记录；先保留人工说明，现有严格 receipt 不加字段 | requestHash、完整 prompt、tool、reference 映射、output hash 可追溯，旧回执兼容且不伪造真实调用事实 | 独立中等改造，不借本次直接实施 |
| H. 真人科技封面新方向 | 若用户确实喜欢上游效果，可获得相似信息表达的新原创模板 | 独立做未经验收的原创模板草稿，使用获准本人照；不预装上游人物、品牌截图或默认“狗哥”品牌 | 本人身份、准确文案、手部、缩略图可读与首图还原分别检查，再由用户接受新版本 | 需用户选择审美方向 |

不建议的选项：安装整个上游 Skill；改成每次三轮问答；全局固定 3:4/10% 安全区/真人/黄黑字；把输出目录放在插件缓存；强制追加第三方品牌；扩充新代理、新宿主或收费生图路径。它们既不能补足已具备的任务能力，也会改变用户已选模板和输入边界。

### 建议的试用顺序与停止条件

1. 先选择 A 或 F，只提高现有指南的可操作性，复用现有 handoff 与人工验收。
2. 用户希望更多表现方式时再选 B/E/H；每次从一个明确模板分支开始，不把全部十种风格当作已学会的模板。
3. 若实际痛点是“结果无法追溯完整 prompt”，单独选 G；必须覆盖写入、读取、校验、备份恢复、旧版本兼容和 UI 查看，不只是文档承诺。
4. 每项验证都区分提示质量、文件技术校验、真实生图结果、人工模板验收；没有证据的层不写通过。任何上游固定值与本次请求冲突时，沿用固定请求并记录差异。

## 5. 许可、来源与复用边界

上游 LICENSE 是 MIT，声明 `Copyright (c) 2026 狗哥笔记`，并保留 `oh-my-cover-design`、`Copyright (c) 2026 feitangyuan (MIT)` 的衍生来源。分发代码或实质性文档内容时，应保留完整版权及许可文本。[固定版本许可](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/LICENSE#L1)

本轮没有把上游 Skill 正文、模板正文或示例图片导入产品；研究中的短摘要与链接只用于比较。后续如果选择直接复制模板文字，应把该固定 LICENSE 的两条来源声明一起纳入本项目现有 notices/许可证分发流程，不能只写“灵感来源”。当前项目已有这一流程与边界。[本地来源与分发说明](/Users/mac/.codex/worktrees/a-group-release/Nova-Content-Hub/plugin-src/references/upstream-notices.md:34)。

研究判断：MIT 文件没有单独列明示例中肖像、第三方 UI/品牌标识、字体的具体授权范围或素材来源。不能据此将这些素材认定为可随产品分发；“保持五官一致”也是提示目标，不是能力保证。最小做法是保留方法来源链接，用本项目原创文字、用户明确选定的本人照和获准素材重新制作，且仍须用户验收。此处记录仓库可见证据缺口，没有替任何权利人作授权判断。

## 6. 本次已做与未做

已做：GitHub 源仓库访问、固定提交与完整树核对；所有文本全文阅读；8 张 WebP 原图逐张查看和像素读取；五个本地 Skills、公共视觉指南、设计 schema、模板/封面核心契约与相关测试名称的静态对照；文档本地链接核对。

未做：执行上游脚本或 Skill、安装依赖/插件、生成或编辑图片、访问用户内容库、调用真实 handoff、运行任何产品测试/构建、做浏览器/Electron/安装包验收。文档建议没有实施，示例不代表模板已经还原成功。当前结论用于挑选优化方向，真实效果和兼容性须在选定范围实施后另行验证。
