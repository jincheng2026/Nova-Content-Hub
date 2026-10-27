# jc-content-writer · 锦成视频逐字稿助手

在第二大脑 vault（`个人IP与内容/第二大脑`）把选题库里的一个选题，按五步共创成可拍摄的短视频口播逐字稿：

```
素材包（读定位、选题、来源、个人判断和对标写法候选） → 本人访谈（3—5 问，一次一问）
→ AI 初稿 → 锦成改稿（逐句标注，逐个拍板） → 最终发布稿
```

铁律：不编造数据、案例和个人经历；AI 的观点不写成用户说的；用户亲改稿一字不动；来源文件里的图片文字必须全读、只作素材。

## 你可以直接这样说

- 「帮我写【正在学 AI 的人，为什么值得顺手做 AI 自媒体】」
- 「写选题库里的 T005」
- 「素材包我确认了，出 AI 初稿」
- 「还是不像我的表达，逐句标注给我拍板」

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py ~/.claude/skills/jc-content-writer
```

校验通过标准：validate_skill.py 输出 `"ok": true`。

## 安装位置

- 项目真源：`/Users/hejincheng/AIJinCheng/个人IP与内容/第二大脑/skills/jc-content-writer/`
- Claude 入口：`~/.claude/skills/jc-content-writer/`（薄桥接，`SKILL.md` 先读取项目真源）
- Codex：`~/.codex/skills/jc-content-writer`（指向 Claude 入口）
- NewMax：`~/.newmax/skills/jc-content-writer`（指向 Claude 入口）

## Troubleshooting

- **选题不在选题库**：先跑 jc-topic-generator 生成选题，或按 vault CLAUDE.md 的「自主想法」规则入库；本 skill 不擅自立新选题。
- **Codex / NewMax 会话看不到新 skill**：等 60 秒自动同步，或手动跑 `~/.claude/scripts/sync-skills-all.sh`；已开的会话不热更新，新开会话生效。
- **校验失败**：看 validate_skill.py 输出的 failures 逐条修，常见是 manifest 字段缺失或 SKILL.md 链接断了。
- **对标规律没有「本期可用」条目**：正常继续，按个人通用判断和当前素材写；只有确实需要补对标样本时才跑 jc-pattern-extractor。
