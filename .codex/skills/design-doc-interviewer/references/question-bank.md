# Question Bank

Use 2–4 questions per turn. Pick only the sections that apply.

## Scope & Format

1. Who is the audience, and what systems or teams are affected?
2. Do you have a preferred template or example doc to mirror?
3. What is the single-sentence objective?

## Goals / Non-Goals

1. What outcomes must be true for this to be a success?
2. What is explicitly out of scope?

## UX / Workflows

1. What are the primary user workflows or screens impacted?
2. Are there any new fields or UI configuration steps?
3. Any workflows that should remain unchanged?

## Data Model / API

1. What new fields or entities are needed (and where)?
2. What validation rules should apply?
3. Any new or changed endpoints, or reusing existing CRUD?

## Logic / Algorithms

1. What is the core computation or decision logic?
2. Any edge cases or precedence rules?
3. Where in the system should this logic run?

## Telemetry / Observability

1. What should be logged or emitted for downstream consumers?
2. Do we need flags or metadata to distinguish computed vs. real values?

## Compatibility / Permissions

1. What should happen for existing objects with no new configuration?
2. Any permissions or security implications?

## Rollout / Migration

1. Any data migrations or defaults required?
2. Should rollout be phased or behind a flag?

## Testing

1. What are the must-have test cases?
2. Any performance or reliability concerns to validate?

## Open Questions

1. What decisions are still undecided or risky?
