import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { evaluateFieldLiveReadiness } from "../dist/src/fieldLiveReadiness.js";

function argumentsByName(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error("Readiness arguments must use --name value pairs.");
    result.set(name.slice(2), value);
  }
  return result;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`Missing required readiness argument --${name}.`);
  return value;
}

const values = argumentsByName(process.argv.slice(2));
const manifestPath = required(values, "manifest");
const kvpPath = required(values, "kvp");
const policyPath = required(values, "policy");
const attestationPath = required(values, "attestation");
const attestationSecretPath = required(values, "attestation-secret-file");
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const kvp = JSON.parse(readFileSync(kvpPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
const attestationSecret = readFileSync(attestationSecretPath, "utf8").trim();
const manifestDigest = createHash("sha256").update(manifestBytes).digest("hex");
const bootstrapPayload = kvp.bootstrap?.payload;
const heartbeatPayload = kvp.heartbeat?.payload;
if (!bootstrapPayload?.report) throw new Error("Verified KVP evidence does not contain a bootstrap report.");
if (!heartbeatPayload) throw new Error("Verified KVP evidence does not contain a heartbeat.");
if (bootstrapPayload.manifestDigest !== manifestDigest) throw new Error("Signed bootstrap status does not match the manifest digest.");

const result = evaluateFieldLiveReadiness({
  manifest,
  manifestDigest,
  bootstrapReport: bootstrapPayload.report,
  heartbeat: heartbeatPayload,
  policy,
  attestation,
  attestationSecret,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "ready") process.exitCode = 2;
