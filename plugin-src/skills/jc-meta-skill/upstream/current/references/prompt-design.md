# Prompt Design

Use this method when a skill creates, improves, audits, or depends on reusable agent instructions.

## 1. Start With The Job

Write what the agent must accomplish before describing expertise or tone. A role belongs only when it changes decisions, vocabulary, safety, or output quality.

Capture:

- user-visible job and finished result
- inputs, authoritative sources, and freshness requirements
- actions and required order
- decisions and observable criteria
- output contract and acceptance checks
- stop conditions, forbidden scope, and rollback behavior

## 2. Write Executable Rules

Use this shape when it removes ambiguity:

`When <observable condition>, do <specific action>, verify <check>, then <continue or stop>.`

Separate three levels:

- **Hard constraints**: must hold; violation blocks completion.
- **Recommended defaults**: use unless current evidence gives a reason to choose differently; record the reason.
- **Permitted judgment**: the agent may choose within named boundaries and still must meet the output contract.

Avoid “advanced”, “professional”, “beautiful”, “comprehensive”, “best”, and “as complete as possible” unless followed by observable criteria. Replace them with file requirements, state coverage, thresholds, source rules, examples of failure, or reviewer checks.

## 3. Define Autonomy And Stops

- Act autonomously when inputs are sufficient, the action is authorized, low-risk, and reversible.
- Ask when one missing answer materially changes scope, permission, product category, or irreversible outcome.
- Stop when authorization is missing, sources conflict without a safe precedence rule, a required tool has no valid fallback, or execution would overwrite unrelated work.
- Audit-only means no writes. Create/refactor/package may write within the named package. Publish requires explicit authorization.

## 4. Define Failure Handling

| Condition | Required behavior |
| --- | --- |
| information is insufficient | ask one boundary-changing question or state a conservative reversible assumption |
| a fact cannot be verified | label it unknown or `missing evidence`; do not promote inference to fact |
| a tool is unavailable | follow the declared fallback; otherwise preserve partial output and report the exact gap |
| permission is insufficient | stop before mutation and name the permission required |
| validation fails | keep the failure output, repair the smallest responsible rule or artifact, and rerun the same check |
| partial completion | report completed scope, remaining scope, and a recoverable next step |

## 5. Use Examples Correctly

Examples clarify ambiguity, format, or edge cases. They do not replace rules and must not silently introduce new requirements. Keep examples outside the root when they are long, domain-specific, or useful only for evaluation.

## 6. Prompt Acceptance Checklist

A prompt passes when:

- every instruction maps to an action, decision, boundary, failure response, or acceptance check
- role language changes behavior rather than adding prestige
- hard constraints, defaults, and judgment space do not conflict
- autonomy, ask, stop, and no-write boundaries are explicit
- fact and source handling prevent unsupported claims
- vague quality words have observable replacements
- examples agree with the rules
- optional knowledge is loaded progressively
- the result protects intent fidelity, source fidelity, execution stability, and recoverability

Test the prompt with at least one normal case, one missing-information case, one tool or permission failure, and one near-neighbor case when the selected mode earns output evaluation. Without real task comparison, improvements remain design advantages or hypotheses, not validated superiority.

## Evidence Boundary

The explicit constraint levels, autonomy matrix, and recoverability checks are design decisions in this package. Without real task comparison, they do not prove superior results.
