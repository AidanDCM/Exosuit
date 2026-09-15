import { fieldChannelEnvelopeSchema } from "./fieldChannel.js";
import type { FieldSceneSnapshot } from "./fieldScene.js";
import type { FieldHeartbeat } from "./fieldHeartbeat.js";
import type { FieldSceneChannelReceiver } from "./fieldSceneChannel.js";
import { readKvpJson } from "./fieldSceneKvpReader.js";

/**
 * The host-side scene read: one path from a raw KVP snapshot to an accepted scene.
 *
 * Four outcomes, not two. Transport corruption and authentication failure both mean "do not act
 * on this scene", but they are different findings and must not be flattened into one. This
 * project's rule is that a rejection only counts as a successful negative test when it rejected
 * for the exact intended reason, and a caller that cannot tell a truncated KVP value from a bad
 * signature cannot honour that rule.
 *
 * Nothing here caches. There is no last-good scene to fall back to, by construction rather than
 * by discipline.
 */
export type HostSceneReadResult =
  /** No scene value is published. */
  | { readonly status: "absent" }
  /** The value exists but the transport did not deliver it intact. */
  | { readonly status: "unreadable"; readonly reason: string }
  /** The value arrived intact but failed authentication, binding, or policy. */
  | { readonly status: "rejected"; readonly reason: string }
  /** A verified scene, bound to the expected Field, boot, session, and display contract. */
  | { readonly status: "accepted"; readonly scene: FieldSceneSnapshot };

/**
 * Reads, reassembles, and authenticates the scene value in one step.
 *
 * The receiver is passed in rather than constructed here because it carries replay state: the
 * same instance must see every scene in sequence, and building a fresh one per read would
 * silently disable replay rejection.
 */
export function readSceneFromKvp(input: {
  readonly snapshot: Readonly<Record<string, string>>;
  readonly valueName: string;
  readonly receiver: FieldSceneChannelReceiver;
  readonly heartbeat: FieldHeartbeat;
  readonly secret: string;
  readonly now?: Date;
}): HostSceneReadResult {
  const read = readKvpJson(input.snapshot, input.valueName);
  if (read.status === "absent") return { status: "absent" };
  if (read.status === "unreadable") return { status: "unreadable", reason: read.reason };

  // Shape failures are transport-level: the bytes arrived but are not an envelope at all.
  const envelope = fieldChannelEnvelopeSchema.safeParse(read.value);
  if (!envelope.success) {
    return {
      status: "unreadable",
      reason: `scene value is not a Field channel envelope: ${envelope.error.issues[0]?.message ?? "invalid"}`,
    };
  }

  // Everything past this point is an authenticated decision, so its failures are rejections
  // rather than transport faults, and the receiver's own message is preserved verbatim — a
  // reworded reason is a reason that can no longer be matched against an expected code.
  try {
    return {
      status: "accepted",
      scene: input.receiver.accept({
        envelope: envelope.data,
        heartbeat: input.heartbeat,
        secret: input.secret,
        ...(input.now === undefined ? {} : { now: input.now }),
      }),
    };
  } catch (error) {
    return { status: "rejected", reason: error instanceof Error ? error.message : String(error) };
  }
}
