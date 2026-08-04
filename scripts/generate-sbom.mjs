import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== "object") {
  throw new Error("A package-lock v2 or v3 packages map is required.");
}
const timestamp = options.timestamp ?? new Date().toISOString();
if (!Number.isFinite(new Date(timestamp).getTime())) throw new Error("--timestamp must be an ISO date-time.");
const commit = options.commit ?? process.env.GITHUB_SHA ?? process.env.EXOSUIT_RELEASE_COMMIT;
if (commit !== undefined && !/^[a-f0-9]{40}$/.test(commit)) throw new Error("--commit must be an exact lowercase 40-character Git SHA.");

const components = [];
for (const [path, raw] of Object.entries(lock.packages)) {
  if (!path || !path.includes("node_modules/") || !raw || typeof raw !== "object") continue;
  const value = raw;
  if (typeof value.version !== "string" || value.version.length === 0) continue;
  const name = packageNameFromPath(path);
  const purl = npmPurl(name, value.version);
  const component = {
    type: "library",
    "bom-ref": purl,
    ...(name.startsWith("@") ? { group: name.split("/")[0] } : {}),
    name: name.startsWith("@") ? name.split("/").slice(1).join("/") : name,
    version: value.version,
    purl,
    ...(typeof value.integrity === "string" ? { hashes: integrityHashes(value.integrity) } : {}),
    properties: [
      { name: "exosuit:development", value: String(value.dev === true) },
      { name: "exosuit:optional", value: String(value.optional === true) },
    ],
  };
  components.push(component);
}
components.sort((left, right) => left.purl.localeCompare(right.purl));
const dependencyDigest = createHash("sha256").update(JSON.stringify(components)).digest("hex");
const documentIdentity = createHash("sha256")
  .update(`${packageJson.name}:${packageJson.version}:${commit ?? "unbound"}:${dependencyDigest}`)
  .digest("hex");
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${uuidFromDigest(documentIdentity)}`,
  version: 1,
  metadata: {
    timestamp,
    tools: { components: [{ type: "application", name: "Exosuit deterministic npm SBOM generator", version: "1" }] },
    component: {
      type: "application",
      "bom-ref": `pkg:npm/${encodeURIComponent(packageJson.name)}@${encodeURIComponent(packageJson.version)}`,
      name: packageJson.name,
      version: packageJson.version,
      ...(commit ? { properties: [{ name: "exosuit:git-commit", value: commit }] } : {}),
    },
    properties: [
      { name: "exosuit:package-lock-version", value: String(lock.lockfileVersion) },
      { name: "exosuit:component-count", value: String(components.length) },
      { name: "exosuit:dependency-digest-sha256", value: dependencyDigest },
    ],
  },
  components,
};
const serialized = `${JSON.stringify(sbom, null, 2)}\n`;
if (options.output) {
  const destination = resolve(root, options.output);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  console.log(`Wrote CycloneDX SBOM with ${components.length} components to ${destination}`);
} else {
  process.stdout.write(serialized);
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--output") result.output = requiredValue(args, ++index, "--output");
    else if (value === "--commit") result.commit = requiredValue(args, ++index, "--commit");
    else if (value === "--timestamp") result.timestamp = requiredValue(args, ++index, "--timestamp");
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function packageNameFromPath(path) {
  const marker = "node_modules/";
  const name = path.slice(path.lastIndexOf(marker) + marker.length);
  if (!name || name.includes("node_modules/")) throw new Error(`Cannot determine package name from lock path: ${path}`);
  return name;
}

function npmPurl(name, version) {
  if (name.startsWith("@")) {
    const [scope, ...rest] = name.split("/");
    if (!scope || rest.length === 0) throw new Error(`Invalid scoped npm package name: ${name}`);
    return `pkg:npm/${encodeURIComponent(scope)}/${rest.map(encodeURIComponent).join("/")}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function integrityHashes(integrity) {
  const hashes = [];
  for (const token of integrity.split(/\s+/)) {
    const match = /^(sha256|sha384|sha512)-(.+)$/.exec(token);
    if (!match) continue;
    try {
      const content = Buffer.from(match[2], "base64").toString("hex");
      if (content) hashes.push({ alg: match[1].toUpperCase().replace("SHA", "SHA-"), content });
    } catch {
      // Ignore malformed unsupported integrity tokens; package-lock validation remains npm's responsibility.
    }
  }
  return hashes;
}

function uuidFromDigest(digest) {
  const bytes = Buffer.from(digest.slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
