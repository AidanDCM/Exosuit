import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Repository invariant: every committed evidence record's artifact is present,
 * intact, and nothing unreferenced is committed alongside it.
 *
 * This exists because `.gitignore` carried an unanchored `artifacts/` rule that
 * also matched `docs/qa/completion/artifacts/`, so the evidence the completion
 * gate rests on was never in the repository. The records verified — their
 * signatures are over public material — but the content they were bound to
 * lived only on one machine. A content-addressed record without its content is
 * only a signed pointer.
 *
 * Deliberately independent of the completion evaluator, and deliberately free
 * of any private-key dependency: signature checking needs the public registry,
 * and this needs only committed files. That makes it something hosted CI can
 * actually enforce, where `validate:completion` cannot run at all — it requires
 * both the TPM-sealed signing keys and this artifact store.
 */

const STATE_DIR = join("docs", "qa", "completion");
const ARTIFACT_DIR = join(STATE_DIR, "artifacts");

interface EvidenceRecord {
  readonly evidenceId: string;
  readonly boundTestId: string;
  readonly artifactSha256: string;
  readonly artifactBytes: number;
}

function evidenceRecords(): readonly EvidenceRecord[] {
  const raw = readFileSync(join(STATE_DIR, "evidence.json"), "utf8").replace(/^﻿/, "");
  return (JSON.parse(raw) as { records: EvidenceRecord[] }).records;
}

function committedArtifacts(): readonly string[] {
  return existsSync(ARTIFACT_DIR)
    ? readdirSync(ARTIFACT_DIR).filter((name) => statSync(join(ARTIFACT_DIR, name)).isFile())
    : [];
}

describe("completion evidence artifact reconciliation", () => {
  const records = evidenceRecords();

  it("has evidence records to check", () => {
    // Guards against the test silently passing on an empty store, which would
    // make every assertion below vacuous.
    expect(records.length).toBeGreaterThan(0);
  });

  it("every referenced artifact exists", () => {
    const missing = records
      .filter((record) => !existsSync(join(ARTIFACT_DIR, record.artifactSha256)))
      .map((record) => `${record.evidenceId} -> ${record.artifactSha256}`);
    expect(missing).toEqual([]);
  });

  it("every artifact's filename equals the SHA-256 of its contents", () => {
    // The filename is the address. If content and name disagree, the store is
    // no longer content-addressed and a record could point at altered bytes.
    const mismatched: string[] = [];
    for (const name of committedArtifacts()) {
      const actual = createHash("sha256").update(readFileSync(join(ARTIFACT_DIR, name))).digest("hex");
      if (actual !== name) mismatched.push(`${name} hashes to ${actual}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("every artifact's byte length matches the record that claims it", () => {
    const wrongSize = records
      .filter((record) => existsSync(join(ARTIFACT_DIR, record.artifactSha256)))
      .filter((record) => statSync(join(ARTIFACT_DIR, record.artifactSha256)).size !== record.artifactBytes)
      .map((record) => {
        const actual = statSync(join(ARTIFACT_DIR, record.artifactSha256)).size;
        return `${record.evidenceId}: record says ${record.artifactBytes}, file is ${actual}`;
      });
    expect(wrongSize).toEqual([]);
  });

  it("no unreferenced artifact is committed", () => {
    // Unattached evidence in the tree invites a reviewer to mistake it for
    // current proof. Superseded records stay referenced by the ledger history,
    // so this does not force their removal — it forbids orphans.
    const referenced = new Set(records.map((record) => record.artifactSha256));
    const orphans = committedArtifacts().filter((name) => !referenced.has(name));
    expect(orphans).toEqual([]);
  });

  it("carries no private key material", () => {
    // Cheap standing check on published bytes. The full secret scan lives in
    // CI; this catches the one category that is never acceptable.
    const offenders: string[] = [];
    for (const name of committedArtifacts()) {
      const text = readFileSync(join(ARTIFACT_DIR, name), "utf8");
      if (/-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
