# Sentry

Hosted [Sentry](https://sentry.io/) monitors browser, web server, and worker in one project,
distinguished by `service` and `runtime` tags. Startup commands set `SENTRY_SERVICE`.
The JavaScript SDK is pinned to 11.2.0. All commands run from the repository root.

## Setup

1. Create a Sentry account, organization, and React Router project. Use the included SDK integration;
   skip the wizard's code changes.
2. Copy Project Settings → Client Keys (DSN) into `SENTRY_DSN` in root `.env`, including its regional
   ingestion hostname.
3. Start the app with the [root workflow](../../README.md#run-the-whole-app) or the web/worker host
   workflows. Both send directly to hosted Sentry. Restart processes after SDK configuration changes.

Without a DSN, processes use console logging with remote reporting disabled. They continue serving
if Sentry is unavailable. The DSN can be public; API tokens must remain private.

## Configuration

Set these in root `.env` or the deployment environment:

```dotenv
SENTRY_DSN=                          # Shared project DSN; blank disables reporting

# Optional:
SENTRY_ENVIRONMENT=                  # Event label; defaults to NODE_ENV (development in local Compose)
SENTRY_RELEASE=                      # Defaults to Git/build identity; must match uploaded artifacts
SENTRY_TRACES_SAMPLE_RATE=            # 0–1; blank defaults to 1 in development, 0.2 in production
SENTRY_REPLAYS_SESSION_SAMPLE_RATE=   # 0–1; blank defaults to 1 in development, 0.2 in production
SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=  # 0–1; blank defaults to 1
```

## Production

Supply `SENTRY_DSN` and optionally set `SENTRY_ENVIRONMENT` to your deployment label.
Startup commands set `NODE_ENV=production`, selecting production sampling defaults unless overridden.
Use the same release identifier for web and worker; see [releases and source maps](releases.md)
for artifact uploads.

## Agent debugging

Create a personal token in Sentry's account settings with `org:read`, `project:read`, `team:read`,
and `event:read` scopes. Your user must have access to the organization and project.
Add it to ignored root `.env`:

```dotenv
SENTRY_AGENT_TOKEN=          # Read-only access to recorded issues, events, logs, and traces
```

Repository instructions guide coding agents to use this token automatically. See [debugging](../debugging.md) for usage.

## Artifact uploads

Create a separate personal token with `org:read` and `project:releases` scopes.
Set these in root `.env` for local uploads or in CI:

```dotenv
SENTRY_ORG=                  # Organization slug, not display name or numeric ID
SENTRY_PROJECT=              # Project slug
SENTRY_UPLOAD_TOKEN=         # Source-map upload token
```

```bash
npm run sentry:upload         # Upload already-built artifacts
```

These settings are required only for uploads, not running the app or building artifacts.
See [releases and source maps](releases.md) for the build and upload workflow.

Both tools default to hosted Sentry; `SENTRY_URL` optionally overrides the endpoint.
Keep tokens private in ignored `.env` or CI; application Compose mappings and browser configuration
exclude them. See Sentry's [API authentication](https://docs.sentry.io/api/auth/) and
[permissions](https://docs.sentry.io/api/permissions/) docs. Manage retention and quotas in Sentry.

## Development guides

- [Releases](releases.md) — artifact uploads, release identity, and production builds.
- [Debugging](../debugging.md) — read-only CLI access and source matching.
- [Instrumentation](../instrumentation.md) — application integration and data policy.
