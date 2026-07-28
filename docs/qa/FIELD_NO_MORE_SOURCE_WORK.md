# Field No-More-Source-Work Rule

Until L0 validation executes, new Field runtime modules should be added only when they fix a confirmed review finding or validation failure.

Allowed before L0:

- repair a confirmed type/test/parser/security defect;
- improve a missing test for an existing requirement;
- correct documentation that contradicts source;
- repair CI or evidence capture.

Not allowed before L0:

- add more disconnected providers, models, abstractions, or autonomy;
- wire source-only modules into live Glove execution;
- expand policy or permissions;
- claim operational capability.

Reason: further speculative expansion now increases integration drift and false confidence more than it increases readiness.
