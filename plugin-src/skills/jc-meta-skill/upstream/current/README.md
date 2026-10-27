# jc-meta-skill

把模糊材料、工作流、SOP、旧 Skill 或提示词，整理成架构清晰、行为可靠、边界明确、可以验证的 Agent Skill。

这是锦成本地维护的元 Skill。当前没有公开仓库、远程安装地址或公开安装证明。

## 能做什么

- 判断一个任务是否值得做成 Skill。
- 收集用户、重复任务、输入、输出、排除项、权限、事实来源和成功标准。
- 研究已有方案，记录 `keep / adapt / reject / invent`，避免照搬。
- 选择最轻的有效架构，不用目录数量冒充质量。
- 把提示词写成明确动作、条件、顺序、判断标准、停止条件和失败处理。
- 区分硬约束、推荐默认和允许自主判断的部分。
- 编写应触发、不应触发和容易误判的相邻案例。
- 运行单元测试、触发评测、Skill IR 导出和包校验。
- 在获得明确授权后，执行安全发布、回滚和安装验证。

## 主流程

1. 判断是否应该成为 Skill。
2. 收集意图和边界。
3. 研究已有方案。
4. 设计 Skill 架构。
5. 编写行为提示词。
6. 检查泛化程度。
7. 编写触发案例。
8. 完成包结构和接口。
9. 运行校验。
10. 输出证据边界和交接说明。

## 文件怎么分

```text
jc-meta-skill/
├── SKILL.md
├── README.md
├── LICENSE
├── manifest.json
├── agents/interface.yaml
├── references/
├── scripts/
├── evals/
└── reports/
```

- 根 `SKILL.md`：触发边界、关键判断、主流程、输出合同。
- `references/`：长方法、判断规则、政策和按需读取的资料。
- `scripts/`：可重复、确定性、容易出错的动作。
- `evals/`：触发、近邻、输出和回归案例。
- `reports/`：研究、Skill IR、评测和交付证据。

没有实际用途的目录和模板不创建。嵌套示例使用 `SKILL.example.md` 或 `SKILL.fixture.md`，不能再放一个可被发现的根 `SKILL.md`。

## 提示词标准

合格的提示词必须说明：

- Agent 最终要完成什么工作。
- 依赖哪些输入和事实来源。
- 按什么顺序执行。
- 遇到什么条件做什么动作。
- 哪些是硬约束，哪些是默认选择，哪些允许自主判断。
- 什么时候自主执行，什么时候询问，什么时候停止。
- 信息不足、事实无法验证、工具不可用、权限不足时如何处理。
- 如何验收结果，以及失败后如何恢复。

「更高级」「尽量完整」「更专业」等无法检查的表达不能作为要求。示例只能消除歧义，不能替代规则。

## 你可以直接这样说

- 「把这套 SOP 和脚本整理成一个可复用的 Agent Skill。」
- 「帮我设计这个 Skill 的目录结构，判断内容分别放在哪里。」
- 「重写这个 Skill 的行为提示词，补清停止条件、失败处理和验收标准。」
- 「审计这个 Skill 的架构和提示词，先不要改文件。」
- 「补齐应触发、不应触发和容易误判的案例。」
- 「先检查是否具备安全发布条件，不要执行发布。」

## 本地验证

三端入口：

```bash
realpath ~/.claude/skills/jc-meta-skill
realpath ~/.codex/skills/jc-meta-skill
realpath ~/.newmax/skills/jc-meta-skill
```

质量检查：

```bash
cd ~/.codex/skills/jc-meta-skill
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/trigger_eval.py . \
  --cases evals/trigger_cases.json \
  --output reports/trigger-eval.json
python3 scripts/export_skill_ir.py . \
  --output reports/skill-ir.json
python3 scripts/validate_skill.py .
```

只有获得明确发布授权后，才能运行正式发布命令。审计和 `dry-run` 不得写入远程仓库。

## Troubleshooting

- 没有触发：检查 `description` 是否覆盖用户说法，再补正例并重跑触发评测。
- 误触发：补排除项、否定表达和近邻案例，不要只提高阈值。
- 包校验失败：先修复第一条失败，再从单元测试开始完整重跑。
- 工具不可用：使用已声明的安全回退；没有回退时保留现场并说明缺口。
- 权限不足：停止写入或发布，明确说明缺少哪项授权。
- 三端不一致：检查软链真源，再比较三端 `SKILL.md` 的 SHA-256。

## 证据边界

本地测试和校验只能证明当前包结构、接口、规则和案例通过已有检查，不能证明它比其他元 Skill 生成的结果更好。没有真实任务对比时，效果结论必须标记为 `missing evidence`。

维护者：锦成。
