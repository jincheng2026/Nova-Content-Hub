---
name: jc-meta-skill
description: |
  Create or improve agent skills; design architecture and executable prompts; evaluate, govern, or safely publish. Excludes one-off answers, ordinary docs, translations, and non-skill packages.
metadata:
  author: Jincheng
  version: "3.0.0"
---

# JC Meta Skill

Turn recurring work into the smallest reliable, testable agent skill package.

## Routing And Authority

- Route by the frontmatter `description`. Do not create a skill for a one-off answer, ordinary document, translation, explanation, or brainstorming request.
- Once selected, `jc-meta-skill` owns skill authoring, architecture, prompt design, evaluation, packaging, and release preparation. Do not invoke another creator, discovery, or publisher unless the user explicitly requests comparison or this package is unavailable.
- Match the requested action. Audit-only requests stay read-only; create, refactor, or package requests may write; publication requires explicit authorization.
- Keep one discoverable root `SKILL.md`. Embedded examples use `SKILL.example.md` or `SKILL.fixture.md`.
- In this package, personal identity is owner-only: keep only Jincheng / 锦成 / JC. Do not store any other person's name, handle, profile URL, personally named project, or attribution in current files or reports.

## Core Decisions

1. Decide whether the recurring job deserves a skill. If not, answer directly and create no package.
2. Capture users, repeated job, inputs, outputs, exclusions, permissions, fact sources, success criteria, target hosts, and publication intent. Ask only when missing information changes the package boundary or creates material risk.
3. Research prior art before new or substantial designs. Use [Prior-Art Research](references/prior-art-research.md) and synthesize `keep / adapt / reject / invent` without executing untrusted code. For this package's own reports, retain mechanisms and evidence limits without retaining third-party personal identifiers.
4. Choose the lightest valid mode and architecture with [Skill Architecture Design](references/skill-architecture-design.md). Create only resources that reduce ambiguity, repeated effort, route risk, or evidence risk.
5. Write behavior instructions with [Prompt Design](references/prompt-design.md). Use actions, conditions, order, decision criteria, stop conditions, failure handling, and testable acceptance criteria—not decorative personas or vague quality language.
6. Apply the [Generalization Gate](#generalization-gate), then write trigger cases before expanding the package.
7. Build the package and interface, run the earned checks, and report facts separately from inference and `missing evidence`.

## Resource Placement

- Root `SKILL.md`: trigger boundary, essential decisions, main workflow, safe defaults, and output contract.
- `references/`: judgment methods, policies, schemas, and long examples loaded only when relevant.
- `scripts/`: deterministic, repetitive, or brittle operations that are easier to test as code.
- `evals/`: should-trigger, should-not-trigger, near-neighbor, execution, and regression cases when risk justifies them.
- `reports/`: generated evidence, research lineage, Skill IR, evaluation results, and handoff records.

Do not create ceremonial directories, duplicate README/SKILL prose, or generic configurability without a real variation. See [Resource Boundaries](references/resource-boundaries.md).

## Prompt Rules

- Start with the job the agent must complete, not an inflated role description.
- Separate hard constraints, recommended defaults, and permitted judgment.
- State when to act autonomously, when to ask, when to stop, and what must never be expanded.
- Define responses to insufficient information, unverifiable facts, unavailable tools, permission failures, partial completion, and unsafe requests.
- Replace “advanced”, “professional”, “comprehensive”, and similar language with observable checks.
- Use examples only to remove ambiguity; rules remain authoritative.
- Preserve intent fidelity, source fidelity, execution stability, recoverability, and progressive context loading.

## Generalization Gate

Before promoting an example or failure into a core rule:

1. Restate it as domain-neutral behavior.
2. Classify it as a core invariant, optional adapter, or eval-only fixture.
3. Promote only safety, factual, permission, or repeated cross-domain behavior.
4. Keep one-off details in fixtures or specialist references.
5. Re-run the original case and an unrelated boundary case.

## Main Workflow

1. Qualify the request as a reusable skill or no-skill task.
2. Collect intent, boundaries, evidence sources, permissions, and success criteria.
3. Research existing solutions and record `keep / adapt / reject / invent`.
4. Design the smallest valid package architecture.
5. Write executable behavior instructions and failure handling.
6. Check generalization and remove sample-specific overfitting.
7. Write and run trigger cases, including positives, negatives, and near neighbors.
8. Complete the root package, `agents/interface.yaml`, and only the earned resources.
9. Run validation, tests, context, trust, and evidence checks proportional to risk.
10. Export Skill IR for Production+, public, or cross-platform packages.
11. Deliver the package with provenance, evidence boundaries, deliberate rejections, rollback notes, and unresolved `missing evidence`.

Core commands:

```bash
python3 scripts/validate_skill.py .
python3 scripts/export_skill_ir.py . --output reports/skill-ir.json
python3 scripts/trigger_eval.py . --cases evals/trigger_cases.json --output reports/trigger-eval.json
python3 scripts/release_check.py . --phase local --run-tests
python3 scripts/publish_skill.py /path/to/skill --dry-run
```

## Release Boundary

Only after explicit publication authorization, read [Self-Contained Publishing](references/publishing.md) and use the bundled publisher. It must preserve permissions, rollback, secret scanning, evidence-bound claims, feature branch, PR checks, immutable versions, Release verification, public discovery, and isolated clean installation. Never push directly to the default branch or invent a repository, release, install count, or installation proof.

## Output Contract

Return only what the selected mode earns:

1. a working skill directory whose root name, frontmatter, manifest, interface, scripts, tests, and internal references agree
2. a lean, trigger-aware root `SKILL.md`
3. architecture and prompt-design decisions in the proper resources
4. trigger cases and generated results for Production+
5. Skill IR, prior-art research, and creation handoff for Production+
6. validation results, rollback path, provenance, and explicit `missing evidence`
7. publication artifacts only when publication was authorized and verified

The handoff must distinguish design advantages, validated advantages, and hypotheses. Never claim superior generated results without fair task-level evidence.

## Reference Map

- Architecture and authoring: [Skill Architecture Design](references/skill-architecture-design.md), [Prompt Design](references/prompt-design.md), [Skill Engineering Method](references/skill-engineering-method.md), [Operating Modes](references/operating-modes.md)
- Research and evaluation: [Prior-Art Research](references/prior-art-research.md), [Eval Playbook](references/eval-playbook.md), [Output Eval](references/output-eval-method.md), [Skill IR](references/skill-ir-method.md)
- Governance and release: [Governance](references/governance.md), [Review And Release Gates](references/review-release-gates.md), [Self-Contained Publishing](references/publishing.md), [SkillOps](references/skillops-loop.md)
