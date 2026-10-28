# 四个缺失原技能的全机查找记录

日期：2026-10-28
环境：macOS 26（用户已确认）
状态：未找回四个完整原包；待同事补齐。

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

- [ ] 向同事索取并接收 `jc-zhuanxie`、`jc-review-page`、`jc-cover-design`、`jc-kepu-video` 四个原包。
- [ ] 收齐后打包插件，并分别完成四项技能的正式安装。
- [ ] 分别回归对应 workflow 与 HTML，记录安装和回归结果。
