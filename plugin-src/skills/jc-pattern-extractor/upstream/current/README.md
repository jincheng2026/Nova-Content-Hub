# jc-pattern-extractor · 锦成规律提取助手

把内容 vault（默认 `个人IP与内容/第二大脑/`）里 02_内容素材 的对标素材整理成六字段汇总底稿，再提炼或增量更新 标题规律、开头规律、正文结构规律 三份文件。规律条目要求至少 2 条素材支撑，单条只进「单条观察」，全程可溯源到素材文件。

## 你可以直接这样说

- 「读取 02_内容素材，更新规律提取汇总」
- 「从这批素材里提炼标题规律和开头规律」
- 「我搜集了新内容，帮我更新内容规律」（增量模式：只处理新增素材）

## 安装

真源目录安装（Claude Code）：

```bash
cp -R skills/shengcai-pattern-extractor ~/.claude/skills/jc-pattern-extractor
```

Codex 侧走 symlink bridge（跨端 Skill 同步机制）：

```bash
ln -s ~/.claude/skills/jc-pattern-extractor ~/.codex/skills/jc-pattern-extractor
```

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py .
python3 ~/.claude/skills/jc-meta-skill/scripts/trigger_eval.py . --cases evals/trigger_cases.json --output reports/trigger-eval.json
python3 scripts/check_patterns.py ~/AIJinCheng/个人IP与内容/第二大脑
```

## 目录

- `SKILL.md`：主流程与硬规则
- `references/field-rules.md`：六字段细则、抖音标题口径、规律条目格式
- `scripts/check_patterns.py`：交付前自检（字段完整性、五要素、来源下限、禁用因果表述）
- `evals/trigger_cases.json`：触发边界用例

## Troubleshooting

- `check_patterns.py` 报「来源素材不足 2 条」：该条不够格做候选规律，移到「单条观察」区。
- 报「出现带 ID 的完整路径」：规律文件里只允许「素材编号《标题》（平台）」引用，完整路径只留在汇总。
- 抖音标题和描述分不开：用 TikHub `fetch_one_video` 的 `item_title` / `caption` 字段核实，参考 `references/field-rules.md`。
- 找不到 vault：skill 不猜路径，把包含 02_内容素材 的目录告诉它。
