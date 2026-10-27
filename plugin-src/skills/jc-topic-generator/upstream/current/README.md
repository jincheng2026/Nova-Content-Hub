# jc-topic-generator · 锦成选题助手

把第二大脑 vault 的选题流程固定成可重复调用的 skill：读定位、读 02_内容素材（含嵌入图片文字）、出 5—10 个候选选题、落盘到 `04_选题库/`（`00_选题总览.md` 状态总表 + 每题一个 Txxx 独立文件）。只做选题，不优化标题、不写正文。

## 你可以直接这样说

- 「请读取定位和 02_内容素材，生成候选选题写入选题库」（首次生成）
- 「我搜集了新内容，帮我生成新选题」（增量追加，自动找未处理素材并去重）

## 两种模式

| 模式 | 触发 | 行为 |
| --- | --- | --- |
| 首次 | 00_选题总览.md 不存在或首次生成 | 有效内容不足 10 条即停止并报缺口；足够则生成 5—10 个选题，建 Txxx 文件并创建选题总览 |
| 增量 | 「我搜集了新内容，帮我生成新选题」 | 对比「已读取素材」找出新内容，与已有选题去重后追加，不动已确认选题 |

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py ~/.claude/skills/jc-topic-generator
python3 ~/.claude/skills/jc-meta-skill/scripts/trigger_eval.py ~/.claude/skills/jc-topic-generator --cases evals/trigger_cases.json
```

## 安装

真源在项目内 `第二大脑/skills/jc-topic-generator/`。安装即复制到 `~/.claude/skills/jc-topic-generator/`；Codex / NewMax 侧由跨端 Skill 同步机制（`~/.claude/scripts/sync-skills-all.sh`）自动建 symlink，不手动维护副本。

## Troubleshooting

- **提示有效内容不足 10 条**：不是故障。回到关卡 2 往 `02_内容素材/` 补素材，每条需有标题、来源链接和可读正文。
- **增量模式说没有新内容**：检查新素材文件夹里是否有 `笔记信息.md`，以及是否已被记录在 00_选题总览.md 的「生成批次记录」里。
- **图片读取失败**：skill 会记录具体图片路径并如实报告，不会跳过或推测；确认图片文件存在后重跑即可。
- **Codex 侧找不到 skill**：确认 `~/.codex/skills/jc-topic-generator` symlink 存在；缺失时手动跑一次 `~/.claude/scripts/sync-skills-all.sh`。
