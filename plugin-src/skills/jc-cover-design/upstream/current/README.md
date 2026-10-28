# jc-cover-design

面向口播视频、公众号和小红书的 3:4 中文封面设计 Skill。

默认工作流：

```text
内容诊断
→ 推荐方向＋实验方向
→ 检索完整成熟案例
→ 保留空间结构并改写内容
→ 标题、人物、主视觉一体化生成
→ 与案例并排审美验收
→ 中文、身份、比例和缩略图验收
```

支持：

- 多风格探索：一次生成多个真正不同的方向
- 单风格生产：复刻已选方向并继续精修
- 提示词模式：用户明确要求时只输出提示词
- 案例 few-shot：完整提示词和成品图是运行时主依据
- 身份安全：含其他真人的案例只做文字拆解，不与用户人脸同时输入
- 局部身份修复：无人物背景和抠图合成只作备用方案

## 运行时入口

- 核心流程：`SKILL.md`
- 内容路由：`references/content-routing.md`
- 完整案例：`references/examples.md`、`assets/examples/`
- 案例改写：`references/case-rewrite-policy.md`
- 共用视觉语法：`references/viral-cover-grammar.md`
- 风格参考索引：`references/reference-index.md`
- 审美验收：`references/aesthetic-qa.md`
- 人脸安全：`references/face-reference-policy.md`
- 具体风格：`references/style-XX-*.md`

原 14 个用户入口继续保留。内部将真正的视觉家族与人物位置、出镜方式、无人物模式分开处理。

## 参考图安全

含其他真人的完整案例不与用户人脸同时输入模型；先用 `view_image` 观察并转译成文字空间结构。遮挡人物导致构图残缺的图片不能作为构图锚点。真人封面默认整体生成，无人物背景和确定性抠图只用于身份修复。

## License

MIT，基于 `oh-my-cover-design` 改进，原始版权信息见 `LICENSE`。
