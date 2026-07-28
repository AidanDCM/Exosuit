# Field Live Acceptance Evidence Schema

Every live acceptance run must produce one JSON summary with this logical shape:

```json
{
  "contractVersion": 1,
  "acceptanceLevel": "L0",
  "runId": "timestamp-or-uuid",
  "branch": "agent/field-foundation",
  "commitSha": "exact-40-char-sha",
  "environment": {
    "os": "hashed/sanitized",
    "powershell": "version",
    "node": "version",
    "dotnet": "version",
    "hyperV": "version-or-status"
  },
  "field": {
    "fieldId": "uuid-or-null",
    "fieldGeneration": 1
  },
  "startedAt": "ISO-8601",
  "completedAt": "ISO-8601",
  "status": "passed|failed|review",
  "steps": [
    {
      "name": "exact step",
      "status": "passed|failed|skipped",
      "command": "reproducible command or procedure ID",
      "evidence": ["relative log/artifact paths"],
      "errorCode": null,
      "notes": "sanitized"
    }
  ],
  "failureInjections": [
    {
      "id": "matrix row",
      "expected": "expected behavior",
      "actual": "actual behavior",
      "verdict": "passed|failed|review",
      "evidence": ["paths"]
    }
  ],
  "audit": {
    "gloveChainValid": true,
    "fieldChainValid": true
  },
  "privacy": {
    "supportBundleInspected": true,
    "credentialLeakObserved": false,
    "unconsentedRecordingObserved": false
  },
  "rollback": {
    "attempted": true,
    "completed": true,
    "evidence": ["paths"]
  },
  "ownerVerdict": "accepted|rejected|pending",
  "claimBoundary": "exact evidence class and exclusions"
}
```

## Rules

- Never put secrets, tokens, cookies, screenshots, UI values, raw demonstrations, private paths, machine names, or operator identity into the summary.
- Logs containing sensitive data must be redacted before attachment.
- `passed` requires every mandatory step and failure injection for the level.
- A rollback failure makes the run failed even if the primary action succeeded.
- A runner-allocation failure is infrastructure evidence, not a repository test failure.
- An executable source pass is not Hyper-V evidence.
- Hyper-V evidence is not Teach, Shadow, or Pilot evidence.
- Owner acceptance cannot be inferred from a model response.
