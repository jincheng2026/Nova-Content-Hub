---
name: jc-handoff
description: "生成带证据的会话交接包：收集上下文与项目文件，产出本地交接文档和可复制的新会话启动包。触发词 /handoff「交接」「打包上下文」。"
---

# JC Handoff

Create a handoff that lets a fresh session continue work immediately. This is
not a chat summary. It is an evidence-backed startup package and, for local
projects, a durable handoff document by default.

## First Use And Client Compatibility

This Skill works from visible conversation context and project files on any
client that can read and write local files. `scripts/resolve-session.sh` adds
Claude-compatible JSONL evidence when that local session store exists. On
WorkBuddy, Codex, or another client without that store, continue with visible
context and verified files; label the session id and JSONL as `missing` instead
of guessing them. No setup step may block a useful handoff when those logs are
unavailable.

## Trigger Disambiguation

If the trigger word appears in discussion rather than as an instruction, ask:

> 你是要做会话交接，还是在讨论交接这个话题？

## Modes

- Default: for local projects, write `docs/handoff-<topic-slug>-<MMDD>.md` and also output a copy-paste startup package in chat.
- `--chat`, `只在聊天输出`, `不落盘`: output only a copy-paste startup package in chat.
- `--file`, `落盘`, `写到文件`: force or clarify file-backed mode; write `docs/handoff-<topic-slug>-<MMDD>.md` unless the user provides a path.
- `--quick`, `直接生成`, `不用确认`: skip extraction confirmation.
- `--focus XX`, `只打包关于 XX 的部分`, `重点是 XX`: limit extraction to the focus.
- `--external`, `给普通 GPT/Grok/外部模型`: produce a self-contained two-piece handoff that does not assume local file access.
- `--debug`: include a debug chain when the session involved bugfix or investigation work.

## Process

### Step 1: Set Scope And Mode

Identify the target reader, output mode, topic focus, and whether the handoff
needs local paths, self-contained prose, or both. If the session is inside a
local project and the user did not explicitly request chat-only or external
mode, use `chat+file` as the output mode.

### Step 2: Collect Evidence First

Read [references/evidence-collection.md](references/evidence-collection.md).
When shell access is available, run:

```bash
bash scripts/resolve-session.sh
```

Use the result to capture session id, JSONL path, project path, and evidence
availability. Do not invent a session id or JSONL path if unavailable.

### Step 3: Extract The Six Layers

Read [references/extraction-rules.md](references/extraction-rules.md) and extract:

| Layer | Required | Purpose |
|-------|----------|---------|
| Task | Yes | What this session is trying to accomplish |
| Status | Yes | What is done, pending, or blocked |
| Decisions | No | Confirmed choices and why they should stand |
| Rejections | No | Tried or discussed paths that should not repeat |
| Files | No | Specific files read, written, modified, or required |
| Intent | No | Inferred preferences and constraints, labeled as inferred |

Abort if both Task and Status are missing:

> 当前会话内容较少，建议直接在新会话重新描述你的需求，不需要交接。

### Step 4: Identify Session Type

Read [references/session-types.md](references/session-types.md). Use the type to
choose emphasis and length. For Knowledge Management, Strategy, Course Design,
Content Creation, and mixed high-context sessions, include durable assets,
core insights, and trigger-to-reference relationships.

### Step 5: Confirm Extraction Unless Skipped

Unless `--quick` is present, show a compact confirmation:

```markdown
我提取到的信息：
- 任务：[one line]
- 状态：[one line]
- 决策：[N items] / 无
- 否决：[N items] / 无
- 文件：[N files] / 无
- 意图：[one line] / 无明显信号
- 证据：[visible-context/jsonl/files/missing]

类型判定：[type]
输出模式：[chat+file/chat/file/external/debug]

确认无误我就生成启动包，或者告诉我要调整哪里。
```

### Step 6: Flush Durable Decisions

If this session produced decisions that outlive the immediate handoff, do not
bury them only inside `docs/handoff-...`. Before writing the handoff, update or
ask before updating the durable home:

- terminology or domain model changes -> `CONTEXT.md`
- architecture or design decisions -> `docs/adr/`
- pipeline, workflow, or agent behavior decisions -> the relevant `SKILL.md`,
  `AGENTS.md`, `CLAUDE.md`, or project protocol

When unsure, ask: would a future session need this even after the current task
is done? If yes, durable doc first; the handoff should reference that path.

### Step 7: Archive Completed Handoffs

When writing a new handoff file, check only the handoffs you already know about
from this session. If any are clearly completed, move them to `docs/archive/`.
Do not perform a broad handoff audit just to satisfy this step.

### Step 8: Generate The Handoff

Use [references/output-templates.md](references/output-templates.md). Always
include a recovery index when evidence exists:

- Previous session id
- JSONL path
- Key files to read first
- Evidence gaps or compacted-session warning

Guardrails: for local-reader handoffs, reference the current project's real
`AGENTS.md`, `CLAUDE.md`, or equivalent rules instead of assuming a developer's
home-directory paths. Expand only the few rules needed for continuation in
`--external` mode, where the reader has no local file access. Also separate
"pre-authorized actions" from "needs-decision items" in the startup package.

In `chat+file` mode, write or update the handoff file first, then output the
same startup package in chat with the file path at the top.

## Constraints

- Evidence before summary: prefer JSONL and files over model memory.
- Specific paths only: write `src/config/auth.ts`, not "the config file".
- Label confidence: `confirmed-jsonl`, `confirmed-file`, `visible-context`, `inferred`, or `missing`.
- Redact secrets. When possible, pipe generated text through `scripts/redact-handoff.py`.
- Do not duplicate stable rules already present in `AGENTS.md` or `CLAUDE.md`; reference them.
- Rejections are first-class. Preventing repeated mistakes is more valuable than recording activity.
- Keep output action-oriented. Every line should help the next session start.
