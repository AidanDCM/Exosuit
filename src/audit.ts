import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { auditEventSchema, type AuditEvent } from "./contracts.js";

const SECRET_KEY_PATTERN = /token|password|passcode|secret|authorization|cookie|api[_-]?key|private[_-]?key|credential/i;
const INLINE_SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
];

function stable(value: unknown): string {
  if (value === undefined) return '"[UNDEFINED]"';
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? JSON.stringify(String(value));
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

export function redactForAudit(value: unknown, keyHint = ""): unknown {
  if (SECRET_KEY_PATTERN.test(keyHint)) return "[REDACTED]";
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of INLINE_SECRET_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED]");
    return redacted.length > 20_000 ? `${redacted.slice(0, 20_000)}…[TRUNCATED]` : redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactForAudit(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactForAudit(item, key)]),
    );
  }
  return value;
}

function hashEvent(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(stable(event)).digest("hex");
}

export interface AppendAuditInput {
  eventType: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt?: string;
  eventId?: string;
}

export interface LedgerVerification {
  valid: boolean;
  checked: number;
  firstInvalidSequence?: number;
  reason?: string;
}

export class HashChainLedger {
  readonly #path?: string;
  #events: AuditEvent[] = [];

  constructor(path?: string) {
    this.#path = path;
  }

  async append(input: AppendAuditInput): Promise<AuditEvent> {
    const previousHash = this.#events.at(-1)?.hash ?? "GENESIS";
    const withoutHash: Omit<AuditEvent, "hash"> = {
      sequence: this.#events.length,
      eventId: input.eventId ?? randomUUID(),
      eventType: input.eventType,
      createdAt: input.createdAt ?? new Date().toISOString(),
      actor: input.actor,
      payload: redactForAudit(input.payload) as Record<string, unknown>,
      previousHash,
    };
    const event: AuditEvent = { ...withoutHash, hash: hashEvent(withoutHash) };
    auditEventSchema.parse(event);
    this.#events.push(event);

    if (this.#path) {
      await mkdir(dirname(this.#path), { recursive: true });
      await appendFile(this.#path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    return event;
  }

  all(): readonly AuditEvent[] {
    return [...this.#events];
  }

  tail(limit = 100): AuditEvent[] {
    return this.#events.slice(-Math.max(0, limit));
  }

  verify(events: readonly AuditEvent[] = this.#events): LedgerVerification {
    let previousHash = "GENESIS";
    for (const [index, event] of events.entries()) {
      if (event.sequence !== index) {
        return { valid: false, checked: index, firstInvalidSequence: event.sequence, reason: "Sequence mismatch" };
      }
      if (event.previousHash !== previousHash) {
        return { valid: false, checked: index, firstInvalidSequence: event.sequence, reason: "Previous hash mismatch" };
      }
      const { hash, ...withoutHash } = event;
      if (hashEvent(withoutHash) !== hash) {
        return { valid: false, checked: index, firstInvalidSequence: event.sequence, reason: "Event hash mismatch" };
      }
      previousHash = hash;
    }
    return { valid: true, checked: events.length };
  }

  async hydrate(): Promise<{ loaded: number; skipped: number }> {
    if (!this.#path) return { loaded: 0, skipped: 0 };
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { loaded: 0, skipped: 0 };
      throw error;
    }

    const events: AuditEvent[] = [];
    let skipped = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        events.push(auditEventSchema.parse(JSON.parse(line)));
      } catch {
        skipped += 1;
      }
    }
    const verification = this.verify(events);
    if (!verification.valid) {
      throw new Error(`Audit ledger failed verification: ${verification.reason ?? "unknown error"}`);
    }
    this.#events = events;
    return { loaded: events.length, skipped };
  }
}
