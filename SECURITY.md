# Security Policy

Neo Chat is designed for local-first and self-hosted use. It is not a turnkey
public multi-user SaaS boundary.

## Supported Versions

Security fixes are handled on the default branch. If release branches are added
later, this file should be updated with the supported version policy.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:

https://github.com/u14app/neo-chat/security/advisories/new

Do not include secrets, private chat logs, or private user files in a public
issue. A useful report includes:

- Affected version or commit.
- Deployment target: local, Docker, Cloudflare Workers, or another host.
- `DEPLOYMENT_MODE` and relevant store settings with secrets removed.
- Reproduction steps and expected impact.
- Any safe proof-of-concept details.

## Security Boundaries

- Browser storage is the primary durable data store for chats, app settings,
  plugins, assistants, knowledge metadata, and files.
- BYOK envelopes prevent user-entered secrets from being sent to server routes
  as plain request body fields, but deployments must still protect server logs,
  upstream services, and environment variables.
- `DEPLOYMENT_MODE=hosted` tightens outbound URL policy and requires shared
  stores for hosted or multi-instance deployments.
- `ACCESS_PASSWORD` is a deployment gate, not account authentication or tenant
  isolation.

Before running Neo Chat as a public service, add account authentication, tenant
isolation, server-side secret storage, quotas, audit logs, abuse controls, and
provider spend limits.
