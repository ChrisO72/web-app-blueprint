# Runtime

Shared environment loading and process/resource shutdown for web and worker.

## Configuration ownership

Root `.env` is the single local configuration file and is git-ignored.
[.env.example](../.env.example) documents defaults and optional integrations. Host commands load
it without overriding existing process variables. Compose selects explicit variables for each
container rather than passing the complete file. Standalone deployments supply variables through
their deployment environment.

Each component owns its `config.ts` schema and environment validation. Database tools need only
`DATABASE_URL`; worker modules do not require web authentication secrets. Shared loading lives in
[env.server.ts](env.server.ts), with optional-value handling in [config.ts](config.ts).

## Shutdown

[lifecycle.server.ts](lifecycle.server.ts) coordinates cleanup, while
[process.server.ts](process.server.ts) manages process shutdown. See
[telemetry instrumentation](../telemetry/instrumentation.md#shutdown) for shutdown ordering and
telemetry flushing.
