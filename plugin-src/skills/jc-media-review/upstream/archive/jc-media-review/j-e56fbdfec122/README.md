# jc-media-review · 复盘助手

视频发布满 7 天、后台把 12 小时和 7 天数据采齐后，给这条视频写复盘。复盘只写一处：它在 `个人IP与内容/内容数据统计/视频项目/` 的视频项目文件夹，`内容.md`「最终复盘」一节（2026-09-30 起，锦成同意「复盘只写一处，就写在视频项目文件夹」）。

```
工作台显示「该复盘」 → 读视频项目文件夹里的 12 小时和 7 天数据（有后台草稿就在草稿上写）
→ TikHub 抓评论原话 → 从 07_运营沟通 摘会上结论（写明谁说的）
→ 写事实／会上说过的／初步观察／可能的原因（附对照）／还不能判断／下一篇怎么调，先给锦成看
→ 锦成说行了 → content_feedback.py write-review 写入，工作台显示「复盘过了」
```

铁律：不编造数据评论、不改原话、不向锦成要数；写原因必须附对照（同题对标或自己账号同类视频），比比例不比绝对数，只说到选题、开头、表达、制作、分发、转化哪一块，每条接一句下一条改什么；找不到对照就写「还不能判断」和缺哪个对照；不直接改 `内容.md`。第二大脑 `06_发布复盘/` 不再新建单篇，8 月的旧文件原样留着。

## 你可以直接这样说

- 「复盘 T017」
- 「这条该复盘了」「建立复盘文件」
- 「做轻复盘，给我候选动作」
- 「这篇数据很低，没什么可复盘的」（它会告诉你单篇数据不足是正常的）

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py ~/.claude/skills/jc-media-review
```

校验通过标准：validate_skill.py 输出 `"ok": true`。

## 安装位置

- 真源：`~/.claude/skills/jc-media-review/`
- Codex：`~/.codex/skills/jc-media-review`（symlink bridge，由 skills-sync 自动创建）
- NewMax：`~/.newmax/skills/jc-media-review`（同上）
- 项目源文件：`个人IP与内容/第二大脑/skills/jc-media-review/`

## Troubleshooting

- **创作文件还没通过发布前检查**：先用 jc-jiaocheng-video（口播、教程）或 jc-kepu-video（科普）走完写稿产线，再建复盘文件。
- **Codex / NewMax 会话看不到新 skill**：等 60 秒自动同步，或手动跑 `~/.claude/scripts/sync-skills-all.sh`；已开会话不热更新，新开会话生效。
- **校验失败**：看 validate_skill.py 输出的 failures 逐条修。
- **和 jc-publish-closeout 的分工**：closeout 管发布后的建档和 12 小时、7 天自动采数；本 skill 在 7 天数据齐了以后写复盘，写进同一个视频项目文件夹。
- **写入报「程序区已被人工修改」**：有人手改过 `内容.md` 程序区，先对照这条视频 `.system/evidence/review-history/` 里的备份合并，再写。
