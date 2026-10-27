# Output Templates

Use dynamic trimming. Omit empty sections. Keep the package action-oriented.

## Recovery Index

Include this at the top when evidence exists:

```markdown
## 恢复索引
- Previous session: `<SESSION_ID>` / missing
- JSONL: `<path>` / missing
- Project: `<path>`
- Evidence: visible-context / confirmed-jsonl / confirmed-file / missing
- First files to read:
  - `<path>` — [why]
```

If the session was compacted or evidence is incomplete, add one warning sentence.

## Standard Startup Package

Use this for chat output in `chat+file`, `chat`, and `file` modes. In
`chat+file` mode, include the written file path directly under the recovery
index.

```markdown
# 会话交接启动包

## 你需要知道的背景
[1-3 sentences]

## 当前状态
- Done: [...]
- Pending: [...]
- Blocked: [...]

## 关键决策
- [decision] — reason: [...] — evidence: [...]

## 不要再走的路
- Do not [...] — reason: [...] — evidence: [...]

## 相关文件
- `path` — [role/state]

## 已建立的知识资产
- [asset]: `path` — [when to use]

## 核心洞察
- [insight] — source/evidence: [...]

## 触发到引用关系
- When user asks [X] -> read [Y] for [Z]

## 用户偏好和约束
- [confirmed or inferred constraint] — evidence: [...]

## 下一步
1. [specific next action]

---
使用方式：复制以上全部内容，粘贴到新会话第一条消息。
```

For Coding / Technical sessions, usually omit knowledge assets, core insights,
and trigger routing unless they are truly needed.

## Default Chat+File Package

For local projects, this is the default unless the user explicitly requests
`--chat`, `只在聊天输出`, `不落盘`, or `--external`.

1. Choose the output path:
   - default: `docs/handoff-<topic-slug>-<MMDD>.md`
   - same topic: update the existing handoff instead of creating duplicates
   - user-provided path: use that path
2. Before writing, flush durable decisions to their real home when needed.
3. Move only clearly completed handoffs known from the current session to
   `docs/archive/`.
4. Write the file-backed package.
5. Output the startup package in chat and mention the file path.

The chat package and file package may share content, but the file is the durable
project artifact. The chat output is the immediate copy-paste startup.

## File-Backed Package

When `chat+file` is the default or `--file` is requested:

- default path: `docs/handoff-<topic-slug>-<MMDD>.md`
- same topic: update the existing handoff instead of creating duplicates
- header must include session id and JSONL path when available
- mention the written file path in the final response

Header:

```markdown
Previous session: <SESSION_ID>
JSONL: <path>
To review: inspect the JSONL path above or use the local agent-log workflow if available.
```

Recommended body:

```markdown
# Handoff: <topic>

## Context
[what was being worked on and why]

## Current State
- Done: [...]
- Pending: [...]
- Blocked: [...]

## Key Files
- `path` — [purpose/state]

## Decisions
- [decision] — evidence: [...]

## Rejections
- Do not [...] — reason/evidence: [...]

## Durable Docs Updated
- `path` — [decision moved here] / none

## Next Steps
1. [...]

## Suggested Skills
- [...]
```

## External Two-Piece Package

Use when the next reader cannot access local files.

Piece 1: driver prompt.

```markdown
你将接手一个已有项目。先阅读我接下来发送的主上下文文件。
不要假装能访问本地路径；需要证据时，向我索要具体文件片段或让本地 agent 查询。
读完后先复述当前目标、状态、下一步，再开始执行。
```

Piece 2: self-contained context. Include local paths only as provenance.

## Debug Chain

Include when the session involved debugging:

```markdown
## Debug Chain
- Session `<SESSION_ID>`:
  - Feedback loop: [test/log/repro]
  - Ruled out: [hypothesis] — evidence: [...]
  - Pending: [hypothesis]
  - Key discovery: [...]
  - Next probe: [...]
```

## Final Response After Writing

Keep it short:

```markdown
已生成交接包：`path`
证据来源：visible context + JSONL + files
仍有缺口：...
```
