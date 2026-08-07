/**
 * Secret and PII scan over published completion evidence artifacts.
 *
 * These files are command output, committed so that a content-addressed
 * evidence record can actually be checked by someone other than the machine
 * that produced it. Command output is exactly the kind of thing that picks up
 * secrets by accident, so it is scanned on every CI run rather than once at
 * publication time.
 *
 * An artifact CANNOT be redacted in place: its filename is the SHA-256 of its
 * contents and a signed evidence record commits to both. Editing it breaks the
 * record. So a finding here is not a cleanup task — it means that evidence is
 * unsuitable for publication and must be replaced through attestation:
 *
 *   1. treat the record as unpublishable
 *   2. re-run the command with deterministic redaction
 *   3. record a new artifact and a new signed evidence record
 *   4. replace the authoritative record through the normal transition path
 *
 * Usage:  node scripts/scan-evidence-artifacts.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join("docs", "qa", "completion", "artifacts");

/**
 * Each rule carries an `allow` predicate for the false positives this corpus
 * genuinely contains — test fixtures that exist precisely to assert that such
 * strings are rejected. Suppressing by pattern rather than by file keeps a real
 * secret from hiding behind a blanket exemption.
 */
const RULES = [
  {
    id: "private-key",
    severity: "block",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  {
    id: "aws-access-key",
    severity: "block",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: "github-token",
    severity: "block",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  },
  {
    id: "slack-token",
    severity: "block",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: "bearer-token",
    severity: "block",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  },
  {
    id: "url-with-credentials",
    severity: "block",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/gi,
  },
  {
    id: "private-ipv4",
    severity: "warn",
    pattern: /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.(?:\d{1,3}\.){1,2}\d{1,3}\b/g,
    // Version strings and durations produce plenty of dotted quads.
    allow: (m, line) => /version|v\d|\bnode\b|\bnpm\b/i.test(line),
  },
  {
    id: "mac-address",
    severity: "warn",
    pattern: /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g,
  },
  {
    id: "email",
    severity: "warn",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    // RFC 2606 reserves .example/.test/.invalid/.localhost for documentation;
    // the support-bundle suite uses them as fixtures asserting rejection.
    allow: (m) => /\.(?:example|test|invalid|localhost)$/i.test(m),
  },
];

if (!existsSync(DIR)) {
  console.log(`No evidence artifact directory at ${DIR}; nothing to scan.`);
  process.exit(0);
}

const files = readdirSync(DIR).filter((n) => statSync(join(DIR, n)).isFile());
const findings = [];

for (const name of files) {
  const text = readFileSync(join(DIR, name), "utf8");
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    for (const [index, line] of lines.entries()) {
      rule.pattern.lastIndex = 0;
      for (const match of line.matchAll(rule.pattern)) {
        const value = match[0];
        if (rule.allow?.(value, line)) continue;
        findings.push({
          file: name.slice(0, 12),
          rule: rule.id,
          severity: rule.severity,
          line: index + 1,
          // Never echo a suspected secret in full into CI logs.
          sample: value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value,
        });
      }
    }
  }
}

console.log(`Scanned ${files.length} evidence artifact(s) in ${DIR}\n`);

const blocking = findings.filter((f) => f.severity === "block");
const warnings = findings.filter((f) => f.severity === "warn");

for (const f of warnings) {
  console.log(`  warn   ${f.file} line ${f.line}  ${f.rule}: ${f.sample}`);
}
for (const f of blocking) {
  console.error(`  BLOCK  ${f.file} line ${f.line}  ${f.rule}: ${f.sample}`);
}

if (blocking.length > 0) {
  console.error(
    `\n${blocking.length} blocking finding(s). These artifacts must not be published.`
    + "\nDo NOT edit them — the filename is their SHA-256 and a signed record commits to it."
    + "\nRe-run the command with redaction and replace the record through attestation.",
  );
  process.exitCode = 1;
} else {
  console.log(`\nNo blocking findings. ${warnings.length} warning(s).`);
}
