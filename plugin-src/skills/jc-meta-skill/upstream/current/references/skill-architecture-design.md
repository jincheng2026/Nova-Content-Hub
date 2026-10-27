# Skill Architecture Design

Use this method when creating, restructuring, or reviewing a skill package.

## 1. Qualify The Job

A skill is justified when the work is recurring, route-sensitive, made safer by deterministic execution, or needs portability and governance. Do not package one-off answers, ordinary documents, translations, explanations, or speculative future workflows.

Before choosing files, record:

- users and recurring job
- real inputs and finished outputs
- explicit exclusions and near neighbors
- permissions, side effects, and rollback needs
- authoritative fact sources and freshness needs
- success criteria and evidence needed to claim success
- target hosts and publication intent

If a missing answer changes the product category, permission boundary, or irreversible scope, stop and ask one focused question. Otherwise state a conservative assumption and proceed.

## 2. Choose The Lightest Structure

Start with root `SKILL.md`. Add a resource only when it earns its place:

| Resource | Put here | Do not put here | Acceptance check |
| --- | --- | --- | --- |
| `SKILL.md` | routing, essential decisions, main workflow, output contract | long doctrine, extensive examples, generated evidence | an agent can route and start correctly without loading everything |
| `references/` | judgment, policy, schemas, long examples | deterministic operations | each file is linked from the root or another selected reference |
| `scripts/` | repeatable, brittle, testable actions | unresolved judgment | `--help`, unit test, or internal-module marker makes its contract visible |
| `evals/` | trigger, near-neighbor, execution, regression cases | decorative sample prompts | cases state expected behavior and can be rerun |
| `reports/` | generated evidence, provenance, results | source rules the agent must obey | reports identify their generator, date, and evidence boundary |
| `assets/` | static output inputs that should not enter prompt context | personal branding without authorization | every asset has a real consumer |

Do not create empty folders or templates for imagined future needs. A second discoverable `SKILL.md` is forbidden; use `SKILL.example.md` or `SKILL.fixture.md` for embedded cases.

## 3. Control Context

- Put only route and execution-critical material in the initial load.
- Link optional references by the decision that requires them.
- Read the smallest relevant reference set for the current branch.
- Keep repeated facts in one source of truth; other files point to it.
- Move deterministic transformations to scripts when prose repetition is more error-prone.

If the root grows because every specialist rule is always loaded, split by decision boundary and rerun route and execution cases.

## 4. Architecture Review

The architecture passes when:

- the folder name, frontmatter name, manifest, and interface agree
- the recurring job and exclusions are explicit
- each file changes behavior, reduces repeated work, or supplies evidence
- no rule has two active sources of truth
- the root contains no long material needed only by one branch
- permissions and mutations are visible before execution
- failure paths are recoverable or clearly stop
- trigger positives, negatives, and near neighbors exist when route risk matters
- public claims point to actual evidence

## Failure Handling

- If intent is unclear: ask only the boundary-changing question.
- If facts are stale or unverified: research an authoritative source or label the claim unresolved.
- If a tool is unavailable: use a declared fallback; otherwise preserve partial work and report the missing capability.
- If permission is missing: stop before the mutation and state the exact authorization needed.
- If architecture requires speculative files: omit them and record the future condition that would justify them.
- If a rename would collide or break another active source: stop without modifying files.

## Evidence Boundary

The compact placement table, stop rules, and no-speculative-resource policy are design decisions in this package. They are not evidence of superior task results.
