# GitHub Skills 借鉴与许可

核对日期：2026-10-17。以下为检索后读取的上游固定提交；本项目保留自有三个 Skill 名称、协议、授权与路径边界，以中文重写适合本产品的工作步骤，未整包安装或执行上游脚本。

| 上游固定版本 | 采用部分 | 本项目取舍 |
|---|---|---|
| [JimLiu/baoyu-skills · baoyu-cover-image](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-cover-image/SKILL.md) | 分维度描述封面、明确参考作用、保留生成提示和修订候选 | 由模板快照提供参数，省去重复确认和 EXTEND.md 初始化；不搬其供应商脚本、自动重试、默认水印和固定构图比例 |
| [openai/skills · imagegen](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.system/imagegen/SKILL.md) | 区分新生成与编辑、标明输入角色、检查真实输出、围绕偏差迭代 | 由实际宿主提供工具；不安装其 API CLI，不自动索取密钥；参考不会自动变成编辑目标 |
| [anthropics/skills · canvas-design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/canvas-design/SKILL.md) | 先说明视觉意图，再检查构图、边界与文字可读性 | 服从用户模板和准确标题；不照搬自由艺术创作、特定输出格式、随意下载字体的做法 |

也核对了同一 Anthropic 提交的 [brand-guidelines](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/brand-guidelines/SKILL.md)。它包含该公司的指定颜色和字体，未移植这些品牌值；自媒体模板应决定自己的视觉约束。

2026-10-17 自媒体场景扩展另核对同一固定提交的 [baoyu-infographic](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-infographic/SKILL.md) 与 [baoyu-xhs-images](https://github.com/JimLiu/baoyu-skills/blob/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-xhs-images/SKILL.md)：采用“信息结构与视觉风格分开”的组织方法，用于自媒体类型、区域关系和 AI 流程表达。不移植其中未经本项目验证的流量、平台安全区或尺寸推荐；也不安装其初始化和供应商脚本。许可沿用该仓库 MIT。

## 许可与来源声明

- baoyu-cover-image：MIT，Copyright (c) 2026 Jim Liu。许可原文：[baoyu-MIT.txt](licenses/baoyu-MIT.txt)。
- OpenAI imagegen：Apache-2.0。许可原文：[openai-Apache-2.0.txt](licenses/openai-Apache-2.0.txt)。
- Anthropic canvas-design：Apache-2.0。许可原文：[anthropic-Apache-2.0.txt](licenses/anthropic-Apache-2.0.txt)。

本项目对这些方法进行了上述取舍与重写；没有复制原始 Skill 正文、示例图片、字体资产或执行脚本。这些来源不为本产品背书，各许可证仅适用于相应上游材料。构建会把本说明和许可随每个独立 Skill 一起打包。
