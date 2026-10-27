# jc-broll-judge · B-roll 画面判定

读锦成的视频逐字稿，逐句判定配什么画面，产出给剪辑直接可用的分镜标注表：

```
第0问 有真素材吗？→ 有就用真的
第1问 在禁区吗？（操作/证据/观点/可执行）→ 录屏、实拍截图、纯 A-roll
第2问 命中五类触发吗？（抽象机制/长逻辑链/铺垫叙事/知识科普/数字密集）→ AIGC B-roll
其余 → 字卡
```

判定规则来自 3 条参考视频的逐秒拉片（1 秒 1 帧全量＋214 个切镜点＋字幕对齐）和锦成自己 97 万播放爆款的反例检验，证据都在 `references/参考拉片台账.md`，每条规则可回查时间码。

铁律：证明、操作、可执行信息禁用 AIGC；AIGC 画面必须压数据字卡不裸奔；一条片子一套隐喻词典一个贯穿角色；AIGC 不进前 30 秒。

## 你可以直接这样说

- 「给《为什么你应该做AI自媒体？》出分镜标注」
- 「这篇逐字稿哪里用 AI 画面、哪里用录屏」
- 「AIGC 段的画面构想和字卡帮我列出来」

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py ~/.claude/skills/jc-broll-judge
```

校验通过标准：validate_skill.py 输出 `"ok": true`。

## 安装位置

- 真源：`~/.claude/skills/jc-broll-judge/`
- Codex：`~/.codex/skills/jc-broll-judge`（symlink bridge，skills-sync 自动创建）
- NewMax：`~/.newmax/skills/jc-broll-judge`（同上）
- 项目源文件：`个人IP与内容/第二大脑/skills/jc-broll-judge/`

## Troubleshooting

- **它不生成画面**：AIGC 画面的实际制作走生成工具/剪辑，本 skill 只出判定和构想规格。
- **判定和直觉冲突**：让它给出对应台账时间码的证据；证据不服可以推翻，用户拍板优先。
- **Codex / NewMax 看不到**：等 60 秒同步或跑 `~/.claude/scripts/sync-skills-all.sh`；新会话生效。
- **规则要迭代**：实发数据回来后，把被快进/划走段落的反馈回写 `references/参考拉片台账.md` 的未验证项。
