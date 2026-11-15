# Repository instructions

Read [README.md](README.md) for project orientation. Before editing an area, read its local
`AGENTS.md` and any deeper instructions governing the affected files. Open only the topic guides
needed for the task; a root-started session may not have loaded nested instructions.

## Universal rules

- Run the relevant [checks](README.md#checks) before finishing changes.
- Do not silence the type checker: no `any`, `@ts-ignore`, or unjustified `eslint-disable`.
- Keep credentials out of code, documentation, and logs.
- Update docs only when a change makes existing guidance inaccurate or leaves a clear usage gap.
  Keep updates minimal; docs explain current usage, not implementation details or change history.
  and relevant guide before changing coverage.

## Read when relevant

| Work                                | Instructions                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| Web routes, auth, or UI             | [web/AGENTS.md](web/AGENTS.md)                                   |
| Jobs or schedules                   | [worker/AGENTS.md](worker/AGENTS.md)                             |
| Schema, migrations, or repositories | [db/AGENTS.md](db/AGENTS.md)                                     |
| Email                               | [integrations/mail/AGENTS.md](integrations/mail/AGENTS.md)       |
| File storage                        | [integrations/storage/AGENTS.md](integrations/storage/AGENTS.md) |
| Monitoring or Sentry tooling        | [telemetry/AGENTS.md](telemetry/AGENTS.md)                       |
| Shared environment or shutdown      | [runtime/AGENTS.md](runtime/AGENTS.md)                           |

For recorded errors, traces, or logs, read [telemetry/debugging.md](telemetry/debugging.md) and use
the repository-local Sentry CLI with its read-only agent token.
