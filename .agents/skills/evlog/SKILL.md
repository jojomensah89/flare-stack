---
name: evlog
description: Server-side structured logging conventions using evlog.
---

# evlog Skill

## Guidelines

1. **Wide Events**: Prefer accumulating a single comprehensive request event with `requestId`, `method`, `path`, `status`, and `durationMs` rather than scattering `console.log` statements.
2. **Redaction**: Never log passwords, tokens, API keys, or sensitive personal data.
3. **Format**: Pretty logs during local development, structured JSON in production for Cloudflare Workers Logs.
