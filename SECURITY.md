# Security policy

OpenConnect stores an App Store Connect API key and your sales data, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue.** Report it privately through
[GitHub Security Advisories](https://github.com/OddOmens/OpenConnect/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply within a few days, and a fix or mitigation as quickly as the severity calls for. Reporters are credited in the release notes unless they'd rather not be.

## Supported versions

Only the latest release on `main` gets security fixes. Update with `git pull && docker compose up -d --build`.

## Scope

In scope: anything that lets someone read your data, change settings, or obtain the API key without the password. That includes authentication bypasses, CSRF, XSS, DNS rebinding with the password off, path traversal, and secrets leaking into logs, git or the Docker image.

Out of scope:
- Attacks that need access to the Docker host, since that owner already controls everything.
- Running with `OPENCONNECT_PASSWORD_REQUIRED=false` on a network you don't trust. That setting is documented as unsafe there.
- Denial of service by someone who can already reach the port.

See [Security in the README](README.md#security) for how OpenConnect protects itself.
