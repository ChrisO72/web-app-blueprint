# Telemetry

Hosted Sentry monitoring for browser, web server, and worker. Application instrumentation lives
here; provider setup and tooling live in [sentry/](sentry/README.md).
All commands run from the repository root.

## Configuration

Set `SENTRY_DSN` in root `.env` to enable browser, web server, and worker reporting.
They share one Sentry project, distinguished by `service` and `runtime` tags.
Startup commands set `SENTRY_SERVICE`. See [Sentry setup](sentry/README.md#setup).

```dotenv
SENTRY_DSN=                          # Project DSN shared by browser, server, and worker; blank disables reporting
```

Optional overrides can be added to `.env` or the deployment environment:

```dotenv
SENTRY_ENVIRONMENT=                  # Event label; defaults to NODE_ENV (development in local Compose)
SENTRY_RELEASE=                      # Release override; defaults to Git/build identity; must match uploaded artifacts
SENTRY_TRACES_SAMPLE_RATE=            # 0–1; blank defaults to 1 in development, 0.2 in production
SENTRY_REPLAYS_SESSION_SAMPLE_RATE=   # 0–1; blank defaults to 1 in development, 0.2 in production
SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=  # 0–1; blank defaults to 1
```

Sampling defaults follow `NODE_ENV`, independently of `SENTRY_ENVIRONMENT`.
Other runtime modes use development defaults; SDK initialization is disabled during tests.
Explicit zero disables the corresponding sampled signal. Error events remain fully sampled
subject to existing filters and provider limits. Replays retain the masking and redaction
described in [instrumentation](instrumentation.md).

## Run locally

Use the [whole-app workflow](../README.md#run-the-whole-app) or the individual host workflows.
Configured SDKs send directly to hosted Sentry from either workflow. Restart application processes
after SDK configuration changes.

Without a DSN, application processes use console logging with remote reporting disabled. They
continue serving if Sentry becomes unavailable. The pinned JavaScript SDK version is 11.2.0.

## Production

Supply `SENTRY_DSN` and optionally set `SENTRY_ENVIRONMENT=production` (or your deployment's label).
Startup commands set `NODE_ENV=production`, which selects production sampling defaults unless
explicit rates are supplied. Give web and worker the same release identifier. Follow
[releases and source maps](sentry/releases.md) for artifact uploads. Agent and upload tokens belong
only to host/CI tooling; application Compose mappings do not pass them to containers.

## Development guides

- [Instrumentation](instrumentation.md) — logs, traces, metrics, redaction, and lifecycle.
- [Debugging](debugging.md) — investigating existing issues, events, logs, and traces.
- [Releases](sentry/releases.md) — build identity and source-map uploads.
- [Sentry setup](sentry/README.md) — hosted account, project, and tooling credentials.
