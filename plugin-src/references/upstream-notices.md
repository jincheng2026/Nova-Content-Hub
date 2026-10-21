# GitHub Skills 借鉴与许可

核对日期：2026-10-17。以下为检索后读取的上游固定提交；本项目保留自有三个 Skill 名称、协议、授权与路径边界，以中文重写适合本产品的工作步骤，未整包安装或执行上游脚本。

| 上游固定版本                                                                                                                                                      | 采用部分                                                   | 本项目取舍                                                                                              |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| [JimLiu/baoyu-skills · baoyu-cover-image](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-cover-image/SKILL.md) | 分维度描述封面、明确参考作用、保留生成提示和修订候选       | 由模板快照提供参数，省去重复确认和 EXTEND.md 初始化；不搬其供应商脚本、自动重试、默认水印和固定构图比例 |
| [openai/skills · imagegen](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.system/imagegen/SKILL.md)                       | 区分新生成与编辑、标明输入角色、检查真实输出、围绕偏差迭代 | 由实际宿主提供工具；不安装其 API CLI，不自动索取密钥；参考不会自动变成编辑目标                          |
| [anthropics/skills · canvas-design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/canvas-design/SKILL.md)             | 先说明视觉意图，再检查构图、边界与文字可读性               | 服从用户模板和准确标题；不照搬自由艺术创作、特定输出格式、随意下载字体的做法                            |

也核对了同一 Anthropic
提交的 [brand-guidelines](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/brand-guidelines/SKILL.md)
。它包含该公司的指定颜色和字体，未移植这些品牌值；自媒体模板应决定自己的视觉约束。

2026-10-17
自媒体场景扩展另核对同一固定提交的 [baoyu-infographic](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-infographic/SKILL.md)
与 [baoyu-xhs-images](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-xhs-images/SKILL.md)
：采用“信息结构与视觉风格分开”的组织方法，用于自媒体类型、区域关系和 AI
流程表达。不移植其中未经本项目验证的流量、平台安全区或尺寸推荐；也不安装其初始化和供应商脚本。许可沿用该仓库 MIT。

## huashu-design 方法吸收

2026-10-19 核对记录见仓库研究文档；本轮采用固定提交 [alchaincyf/huashu-design · 798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7](https://github.com/alchaincyf/huashu-design/tree/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7) 的公开方法，针对本产品重写为 [封面设计检查](cover-design-review.md)。

| 固定来源 | 本产品采用 | 取舍 |
| --- | --- | --- |
| [方向探索](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/references/directions.md) | 目标与真实参考先行，候选差异来自构图关系 | 用户已选参数直接沿用，数量服从请求 |
| [风格库](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/references/design-styles.md) | 按输出媒介分析可观察的布局、文字与色彩角色 | HTML 风格不作为已验收封面模板 |
| [品牌资产协议](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/references/brand-asset-protocol.md) | 真实素材有来源，品牌约束单独记录 | 样张中的品牌与人物身份不自动继承 |
| [检查说明](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/README.md) | 分开记录客观失败与审美选择 | 技术校验与助手自评均不能代替用户验收 |

该固定版本采用 [MIT](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/LICENSE)。本轮只重写方法，没有复制其代码、Skill 正文或实质性文档片段；后续若复制这些内容，应随附该版本完整版权与许可文本。该许可不自动覆盖上游引用的品牌、字体或第三方图片。本产品继续使用既有宿主能力，不引入其可选云调用、素材下载、CDN、代理设置或偏好写入机制；数据流背景见上游 [SECURITY.md](https://github.com/alchaincyf/huashu-design/blob/798c4235ebff03d5c45e3c8affdf5e9d18f9dfa7/SECURITY.md)。

## gbro 与本地 cover-vi 的方法吸收

2026-10-21 完整核对 [pyang5166/gbro-cover-design 固定提交 8d1a0a5](https://github.com/pyang5166/gbro-cover-design/tree/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6)，研究记录见仓库 `docs/research/2026-10-21-gbro-cover-design.md`。仅重写其空间接触关系、前中后景、标题层级与缺项集中询问的方法，纳入 [封面设计检查](cover-design-review.md)。该上游为 MIT；未复制正文、代码、风格文件或样图，不安装其配置，不将默认 3:4、正脸照、固定问答轮数或约 10% 边距变为本项目全局要求。实际比例、人物、标题、数量继续服从固定请求。

用户提供的本地交接包 `cover-vi` 是独立来源；吸收逐图证据、适用分支、例外、置信度与失败边界的研究组织方法，未执行其脚本或复制其 `study.json` 真源模型。本项目沿用固定请求、规则证据和用户人工验收；同事的历史拆解资料与本次 AI 提交结果分别标识，不互相冒充。

## 许可与来源声明

2026-10-21 另核对 [pyang5166/gbro-cover-design 固定提交 8d1a0a5487e9ee6539b2b0a471b58469aadfedd6](https://github.com/pyang5166/gbro-cover-design/tree/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6)。本项目只吸收“内容关系先于构图、固定与变量分层、标题逐字核对”的方法并按既有请求重写；未复制其示例、风格文件或脚本，也不沿用固定 3:4、默认本人脸或三轮问卷。若未来实质复制其材料，应保留该固定版本的 MIT 版权与许可文本。

- baoyu-cover-image：MIT，Copyright (c) 2026 Jim Liu。许可原文：[baoyu-MIT.txt](licenses/baoyu-MIT.txt)。
- OpenAI imagegen：Apache-2.0。许可原文：[openai-Apache-2.0.txt](licenses/openai-Apache-2.0.txt)。
- Anthropic canvas-design：Apache-2.0。许可原文：[anthropic-Apache-2.0.txt](licenses/anthropic-Apache-2.0.txt)。

本项目对这些方法进行了上述取舍与重写；没有复制原始 Skill 正文、示例图片、字体资产或执行脚本。这些来源不为本产品背书，各许可证仅适用于相应上游材料。构建会把本说明和许可随每个独立
Skill 一起打包。
