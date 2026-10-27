# Session Type Logic

Identify the session type so the handoff emphasizes the right information.

If two types are close, mark Mixed and preserve the high-value fields from both.

## Coding / Technical

Signals:

- code files, commands, tests, git, deploys, configs
- bug, error, regression, CI, package, API, integration

Emphasis:

- exact file changes
- commands run and verification status
- technical decisions and rejected fixes
- next command or next edit

## Engineering Debug / Investigation

Signals:

- repeated hypotheses
- reproduction, failing tests, logs
- `blocked`, `root cause`, `ruled out`

Emphasis:

- debug chain
- feedback loop built
- hypotheses ruled out with evidence
- pending hypothesis and next probe

## Content Creation

Signals:

- topic, title, script, article, post, voice, publishing platform
- draft, revision, hook, style, examples

Emphasis:

- audience and publishing context
- confirmed voice constraints
- source material and draft state
- rejected tones or angles

## Course Design

Signals:

- course, lesson, students, homework, teaching goal, slides, workbook

Emphasis:

- teaching objective
- confirmed outline
- learner constraints
- source material and delivery artifacts

## Strategy / Planning

Signals:

- direction choice, tradeoff, plan, roadmap, pricing, operating model
- multiple options compared

Emphasis:

- decision tree
- user's leaning and concerns
- rejected paths
- next information needed

## Knowledge Management / Research

Signals:

- wiki, archive, source, entity, concept, knowledge base
- research synthesis, corpus, transcript, reference assets

Emphasis:

- durable knowledge assets
- core insights not to rediscover
- trigger-to-reference routing
- provenance and evidence gaps

## External Model Handoff

Signals:

- user wants to paste into GPT, Grok, Claude web, another computer, or a new chat without local tools

Emphasis:

- self-contained context
- minimal driver prompt
- clear limits: target model cannot inspect local paths
- ask-local-agent protocol for missing evidence

## Mixed

Use when two or more types are material.

Format:

```markdown
Mixed: primary [type], secondary [type]
```

Use the primary type for structure and preserve secondary fields only when they
help the next session act.
