# Six-Layer Extraction Rules

Extract the handoff after evidence collection. Keep the output compact, but do
not drop information needed for the next session to act.

## 1. Task Layer (Required)

Extract the session goal, not the process.

Signals:

- the user's initial request
- repeated target language
- issue, project, document, or artifact being worked on

Format: one sentence, preferably under 30 Chinese characters when possible.

If missing, abort unless Status alone is enough to reconstruct the task.

## 2. Status Layer (Required)

Extract the current progress snapshot:

```markdown
- Done: [completed item]
- Pending: [unfinished item and why]
- Blocked: [blocker, if any]
```

Status should answer: if a fresh session starts now, what is the next concrete
move?

If missing, abort unless Task plus file evidence is enough to reconstruct it.

## 3. Decisions Layer

Extract decisions that should not be reopened without explicit user instruction.

Counts as a decision:

- user said `就这样`, `确定`, `可以`, `按这个来`
- a proposal was followed by implementation
- an A/B choice was made and later work depends on it

Does not count:

- model-only suggestions
- options still being compared
- stale decisions contradicted later

Format:

```markdown
- [decision] — reason: [why] — evidence: [label/path or JSONL clue]
```

## 4. Rejections Layer

Extract approaches that should not repeat.

Signals:

- user rejected a direction
- a command or approach failed and was abandoned
- a later decision explicitly superseded an earlier path

Format:

```markdown
- Do not [approach] — reason: [failure/rejection] — evidence: [label]
```

Rejections are high value. Include them even when the completion list is short.

## 5. Files Layer

List every file the next session needs to read or edit.

Include:

- files modified
- files read for decisions
- configs, logs, tests, docs, generated artifacts, skills, or project state files
- handoff files written in `--file` mode

For each file:

```markdown
- `path` — [read/modified/created/required] [current role/state]
```

Prefer absolute paths when the next session may start outside the project.

## 6. Intent Layer

Infer only when there is evidence.

Valid sources:

- repeated user corrections
- explicit constraints
- rejected outputs
- established project rules
- repeated workflow preferences

Format:

```markdown
- [inferred preference] — evidence: [specific behavior or file]
```

Always label inferred content. Do not present inferred preference as confirmed
instruction.

## Evidence Label Rule

Important claims should carry one of:

- `confirmed-file`
- `confirmed-jsonl`
- `visible-context`
- `inferred`
- `missing`

Do not over-label every sentence. Label decisions, rejections, file state,
blockers, and unusual constraints.

## Abort Rule

If Task and Status cannot be extracted from visible context, JSONL, or files,
respond:

> 当前会话内容较少，建议直接在新会话重新描述你的需求，不需要交接。
