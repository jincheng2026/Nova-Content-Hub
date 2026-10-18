# 原创内置模板的图片与最终提示词

本批次使用内置 imagegen 生成，未调用 CLI。9 张 v3 为真实生成结果，6 张 v2 沿用先前真实生成结果；旧批次共 15
张。所有最终图片已保存到项目中。样图不代表换主题或跨比例还原测试通过。

| 模板         | 图片                                              | 最终提示词                   |
|--------------|---------------------------------------------------|------------------------------|
| 观点金句     | [PNG](../../图库/AI参考/geometry-v3.png)     | [提示词](geometry-v3.md)     |
| 清单盘点     | [PNG](../../图库/AI参考/paper-v3.png)        | [提示词](paper-v3.md)        |
| 知识教程     | [PNG](../../图库/AI参考/notes-v3.png)        | [提示词](notes-v3.md)        |
| 对比评测     | [PNG](../../图库/AI参考/comparison-v3.png)   | [提示词](comparison-v3.md)   |
| AI概念解读   | [PNG](../../图库/AI参考/neon-v3.png)         | [提示词](neon-v3.md)         |
| 生活方式     | [PNG](../../图库/AI参考/magazine-v3.png)     | [提示词](magazine-v3.md)     |
| 人物访谈     | [PNG](../../图库/AI参考/interview-v2.png)    | [提示词](interview-v2.md)    |
| 生活场景     | [PNG](../../图库/AI参考/lifestyle-v2.png)    | [提示词](lifestyle-v2.md)    |
| 产品测评     | [PNG](../../图库/AI参考/product-v2.png)      | [提示词](product-v2.md)      |
| 资讯速读     | [PNG](../../图库/AI参考/news-v2.png)         | [提示词](news-v2.md)         |
| AI工具实测   | [PNG](../../图库/AI参考/ai-tool-v2.png)      | [提示词](ai-tool-v2.md)      |
| Agent工作流  | [PNG](../../图库/AI参考/agent-v2.png)        | [提示词](agent-v2.md)        |
| 科技人物拼贴 | [PNG](../../图库/AI参考/tech-collage-v3.png) | [提示词](tech-collage-v3.md) |
| 大头短标题   | [PNG](../../图库/AI参考/big-head-v3.png)     | [提示词](big-head-v3.md)     |
| 生活双图叙事 | [PNG](../../图库/AI参考/life-story-v3.png)   | [提示词](life-story-v3.md)   |

新增三张只展示人物拼贴、大头短标题、生活双图三种视觉类型，样图人物全为虚构。实际生图以用户明确选中的本人照为唯一身份依据；样图只提供风格与构图，不提供五官、发型或服装。没有本人照可做无人版，需要人物时先提示上传。所有文件的实际像素、字节数与
SHA256 均由 `generated-files.json` 核对；未进行换主题或本人照替换的生图验收。

## v4 组内第二张样张

每套追加 1 张同风格、不同构图的 PNG，整库共 30 张真实样张，每套 2 张。新文件使用 `<recipe>-group-v4.png` 与同名 `.md`
提示；逐图字节、像素和 SHA256 见 `generated-files.json`。原有 v2/v3 图片及其生成来源保持不变，旧完整定义保存在
`builtin-templates/legacy-v3.json`。SVG 仅为结构资产，独立展示，不计入样张。

生成时综合已选整组样张的共同配色、字体与信息层级，从组内布局差异产生指定数量候选；样张张数不等于成品张数。新组内图仍为
`accepted:false`，未据此宣称跨主题、本人替换或实际宿主生图已验收。

| 模板组       | 新增组内样张                                            | 最终提示词                         |
|--------------|---------------------------------------------------------|------------------------------------|
| 观点金句     | [PNG](../../图库/AI参考/geometry-group-v4.png)     | [提示词](geometry-group-v4.md)     |
| 清单盘点     | [PNG](../../图库/AI参考/paper-group-v4.png)        | [提示词](paper-group-v4.md)        |
| 知识教程     | [PNG](../../图库/AI参考/notes-group-v4.png)        | [提示词](notes-group-v4.md)        |
| 对比评测     | [PNG](../../图库/AI参考/comparison-group-v4.png)   | [提示词](comparison-group-v4.md)   |
| AI概念解读   | [PNG](../../图库/AI参考/neon-group-v4.png)         | [提示词](neon-group-v4.md)         |
| 生活方式     | [PNG](../../图库/AI参考/magazine-group-v4.png)     | [提示词](magazine-group-v4.md)     |
| 人物访谈     | [PNG](../../图库/AI参考/interview-group-v4.png)    | [提示词](interview-group-v4.md)    |
| 生活场景     | [PNG](../../图库/AI参考/lifestyle-group-v4.png)    | [提示词](lifestyle-group-v4.md)    |
| 产品测评     | [PNG](../../图库/AI参考/product-group-v4.png)      | [提示词](product-group-v4.md)      |
| 资讯速读     | [PNG](../../图库/AI参考/news-group-v4.png)         | [提示词](news-group-v4.md)         |
| AI工具实测   | [PNG](../../图库/AI参考/ai-tool-group-v4.png)      | [提示词](ai-tool-group-v4.md)      |
| Agent工作流  | [PNG](../../图库/AI参考/agent-group-v4.png)        | [提示词](agent-group-v4.md)        |
| 科技人物拼贴 | [PNG](../../图库/AI参考/tech-collage-group-v4.png) | [提示词](tech-collage-group-v4.md) |
| 大头短标题   | [PNG](../../图库/AI参考/big-head-group-v4.png)     | [提示词](big-head-group-v4.md)     |
| 生活双图叙事 | [PNG](../../图库/AI参考/life-story-group-v4.png)   | [提示词](life-story-group-v4.md)   |
