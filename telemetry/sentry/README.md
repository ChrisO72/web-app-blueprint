# Sentry provider

Hosted [Sentry](https://sentry.io/) provides monitoring for browser, web server, and worker.
This directory contains provider setup, the read-only debugging CLI, and source-map uploads.
All commands run from the repository root.

## Setup

1. Create a Sentry account and organization, then create a project with the React Router platform.
   Use the SDK integration already included in this blueprint; skip the setup wizard's code changes.
2. In Project Settings → Client Keys (DSN), copy the DSN into `SENTRY_DSN`
   in root `.env`. Copy it exactly, including its regional ingestion hostname.
3. Run the app using the [root workflow](../../README.md#run-the-whole-app), or the web/worker
   host workflows. Restart application processes after changing SDK configuration.

Browser, web, and worker use the same project, distinguished by `service` and `runtime` tags.
The DSN is optional; leaving it empty disables remote reporting. It enables event
submission and can be public. API tokens grant additional access and must remain private.

## Configuration

Add tooling settings to root `.env` or the CI environment only when needed.

```dotenv
SENTRY_DSN=                  # Project DSN shared by browser, server, and worker

# Optional host/CI tooling; not needed to run the app or build artifacts.
SENTRY_URL=https://sentry.io  # Default CLI and artifact-upload endpoint; optional override
SENTRY_ORG=                  # Organization slug; required for CLI investigations and uploads
SENTRY_PROJECT=              # Project slug; required for CLI investigations and uploads
SENTRY_AGENT_TOKEN=          # Read-only token; required for CLI investigations
SENTRY_UPLOAD_TOKEN=         # Separate token; required for source-map uploads
```

Use slugs from Sentry settings, not display names or numeric IDs. Both slugs and the appropriate
command's token are required when invoking the tools. Only the DSN is needed for reporting.
Application sampling and labels are documented in [telemetry configuration](../README.md#configuration).

### Tooling tokens

Create separate personal tokens in Sentry's account settings with these scopes:

| Token  | Scopes                                                |
| ------ | ----------------------------------------------------- |
| Agent  | `org:read`, `project:read`, `team:read`, `event:read` |
| Upload | `org:read`, `project:releases`                        |

The token's user must have access to the configured organization and project. See Sentry's
[API authentication](https://docs.sentry.io/api/auth/) and
[permissions](https://docs.sentry.io/api/permissions/) documentation.
Store tokens in ignored root `.env` for host tools or in the CI environment for uploads.
Application Compose mappings and browser configuration never include these tokens. The debugging
wrapper selects the agent token and removes the upload token from its child process environment.

```bash
npm run sentry -- issue list  # Read existing issues using SENTRY_AGENT_TOKEN
npm run sentry:upload         # Upload built artifacts using SENTRY_UPLOAD_TOKEN
```

The [CLI](https://cli.sentry.dev/configuration/) defaults to hosted Sentry. Its state is kept under
ignored `.local/cli/`, excluded from Git, application images, Compose Watch, formatting, linting,
and TypeScript. Provider retention and quotas are managed in the hosted account.

## Development guides

- [Releases](releases.md) — artifact uploads, release identity, and production build handling.
- [Debugging](../debugging.md) — read-only CLI access and source matching.
- [Instrumentation](../instrumentation.md) — application integration and data policy.
