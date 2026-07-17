# Security Policy

Exosuit is pre-release and execution-sensitive. Report suspected vulnerabilities privately to the repository owner. Do not include real tokens, screenshots, credentials, personal data, or exploit demonstrations against systems you do not own.

High-priority reports include:

- bypass of local proposal approval,
- ability to enable full control remotely,
- binding beyond loopback without explicit architecture,
- token leakage in logs or tool results,
- password/secret values in observations,
- wrong-window execution,
- emergency-stop failure,
- audit-chain false validation,
- prompt content overriding host policy,
- raw input occurring while disabled.

Until a formal disclosure channel is configured, use a private GitHub security advisory for this repository rather than a public issue.

See `docs/SECURITY_MODEL.md` for the trust model and known residual risks.
