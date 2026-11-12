# Repository instructions

Read [README.md](README.md) for project orientation. Before editing an area, read its local
`AGENTS.md` and any deeper instructions governing the affected files. Open only the topic guides
needed for the task; a root-started session may not have loaded nested instructions.

## Universal rules

- Run `npm run check` before finishing changes. It is the standard verification gate.
- Use `$blueprint-review-test` for requested reviews and configured project checks.
- Do not silence the type checker: no `any`, `@ts-ignore`, or unjustified `eslint-disable`.
- Keep credentials out of code, documentation, and logs.
- Keep unit tests in the owning component's `test/` directory. Read that component's instructions
  and relevant guide before changing coverage.
- Keep coverage minimal and focused on application behavior. Use in-memory dependencies;
  tests must not require application services, Docker, or external providers.

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
