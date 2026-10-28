# 四个缺失原技能的全机查找记录

日期：2026-10-28
环境：macOS 26（用户已确认）
状态更新（2026-10-28）：已收到用户提供的 `jc-skills-4个.zip`，四个完整方法原件已按当前任务契约接入源码；尚未安装或完成宿主端到端验收。以下查找记录保留原时点事实。

## 查找范围与方法

- 先用 Spotlight `mdfind` 对所有已索引卷按文件名做精确及包含查询：`jc-zhuanxie`、`jc-review-page`、`jc-cover-design`、`jc-kepu-video`；并查询近似名 `jc-bendi-zhuanxie`。
- 再对 `/Users`、`/Volumes`、`/opt`、`/usr/local`、`/private/tmp`、`/private/var/folders` 做不跟随符号链接的文件名遍历，匹配上述名称、对应技能目录及 `.zip` 命名；跳过 `.git`、CoreSimulator 卷载载荷与 Time Machine 备份树。遍历只读文件系统元数据和候选目录文件名，没有读取无关文件内容，也没有解压归档。
- 遍历报告 260 个访问或遍历错误；可见示例包括 Photos Library 与多个受保护的 `~/Library` 子目录返回 `Operation not permitted`。对这些不可访问位置不声称已覆盖；未见到的内容不能据此视为不存在。

## 结果

| 技能 | 结果 |
|---|---|
| `jc-zhuanxie` | Spotlight 与可访问目录名搜索均无命中。 |
| `jc-review-page` | Spotlight 与可访问目录名搜索均无命中。 |
| `jc-cover-design` | Spotlight 与可访问目录名搜索均无命中。 |
| `jc-kepu-video` | 找到多个旧项目备份和临时副本中的同名目录；核对了 14 个目录，均没有根目录 `SKILL.md`，4 层以内的文件名清单只见 `references/compare-page.md`，不构成完整原包。未找到同名 zip。 |
| `jc-bendi-zhuanxie`（近似名） | Spotlight 与可访问目录名搜索均无命中；该名称不等同于 `jc-zhuanxie`。 |

任何现有替代实现都不等于这四个原包，也不代表原技能已经找回。

## 后续补齐

- [x] 向同事索取并接收 `jc-zhuanxie`、`jc-review-page`、`jc-cover-design`、`jc-kepu-video` 四个原包。
- [ ] 收齐后打包插件，并分别完成四项技能的正式安装。
- [ ] 分别回归对应 workflow 与 HTML，记录安装和回归结果。


## 四包接入更新（2026-10-28）

- 来源：`/Users/mac/Desktop/jc-skills-4个.zip`；SHA256 `b050faa629c7f201e7a7fd4a31c7aaa0bf826fbd3198edae8cac7891cbc9dd52`，16,037,833 bytes。
- `jc-zhuanxie` 6、`jc-review-page` 3、`jc-cover-design` 79、`jc-kepu-video` 532，共 620 份方法原件，加 ZIP 根安装说明共 621 份均保留字节与逐文件哈希。方法原件放各自 upstream/current，SKILL.md 仅改名 METHOD.md；根安装说明封存在 cover 方法 upstream/package，作为未选中的包级证据。完整清单见 `plugin-src/resources/method-sources.json`，封面 MIT LICENSE 原样保留。
- 薄入口与 references/method.md 映射当前固定 handoff、claim、等待/恢复、submit、CAS 与原页真源；原脚本 executable:false，不运行、不安装，不读取旧 secret、不上传媒体、不启动旧服务。
- 科普仅由用户显式选择；审稿不会把旧 localStorage 网页另设真源。封面设计由 writing 承载文字候选，实际制图需另有现有 cover 固定请求；generationExecutor 是后续说明，不是新自动路由。包中人物与示例仅来源证据，不成为新用户本人或默认 VI。
- `jc-qiepian-chupian/scripts/transcribe_chars.mjs` 不在此包中，转写的该外部字级切片分支仍未取得／未接入。完整转写方法收到不代表所有外部依赖齐全。
- runtimeStatus 仍为 contract-unverified。本次没有构建、安装、向宿主注册或进行两个宿主的成功／双等待恢复／终态／继续／切换验收；上述安装与回归事项继续待办。
