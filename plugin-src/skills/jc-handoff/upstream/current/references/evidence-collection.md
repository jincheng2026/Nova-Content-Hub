# Evidence Collection

The handoff is only as good as its evidence. Collect evidence before writing the
summary.

## Evidence Tiers

Use these labels in the handoff when confidence matters:

- `confirmed-file`: verified from a local file.
- `confirmed-jsonl`: verified from session JSONL or tool transcript.
- `visible-context`: visible in the current chat context only.
- `inferred`: inferred from user behavior or repeated constraints; must include source evidence.
- `missing`: expected evidence was unavailable or not checked.

## Collection Order

1. **Visible context**: current user request, recent assistant work, visible tool calls.
2. **Session index**: run `bash scripts/resolve-session.sh` when shell is available.
3. **JSONL slices**: inspect only relevant slices. Prefer `rg` searches and recent tail over reading huge logs.
4. **Touched files**: read files that were modified, discussed, or required for next steps.
5. **Project state files**: read only when directly relevant, such as `AGENTS.md`, `progress.md`, `PROJECT_LOG.md`, `CHANGELOG.md`, `CONTEXT.md`, ADRs, or registry/state files.

Do not read every project file for a handoff. The goal is enough evidence for
continuation, not a full audit.

`resolve-session.sh` defaults to the current process chain and current project
directory. It does not use a global latest JSONL fallback unless
`JC_HANDOFF_ALLOW_GLOBAL_JSONL_FALLBACK=1` is set, because an unrelated recent
session is worse evidence than no JSONL.

## JSONL Search Hints

Use narrow searches first:

```bash
rg -n "Edit|Write|apply_patch|exec_command|error|failed|不行|不要|确认|决定|TODO|blocked" "$JSONL"
tail -n 200 "$JSONL"
```

When a file path appears in JSONL, verify the current file state if the next
session will need it. If the file no longer exists, mark that as `missing`.

## Compacted Or Broken Sessions

If the current session was compacted, interrupted, or the user says the new
session has no memory:

- prepend a compacted-session warning
- rely more heavily on JSONL and files
- include evidence gaps explicitly
- avoid claiming complete coverage

Use:

> 本次会话可能经历过压缩或断流，以下交接已尽量从 JSONL 和文件系统补证，但仍可能不完整。

## External Model Mode

For `--external`, assume the target model cannot read local files. Provide:

1. a short copy-paste driver prompt
2. a self-contained context package

Local paths may appear as provenance, but the main context must be understandable
without direct filesystem access. When evidence is insufficient, instruct the
external model to ask the local agent for exact paths or snippets instead of
pretending it can inspect them.
