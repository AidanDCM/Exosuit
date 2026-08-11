import type { FieldHeartbeat } from "./fieldHeartbeat.js";
import type { FieldSceneSnapshot } from "./fieldScene.js";
import type { FieldSceneChannelReceiver } from "./fieldSceneChannel.js";
import { readSceneFromKvp } from "./fieldSceneKvpIntake.js";

/**
 * The host's view of whether a scene may be acted on.
 *
 * Deliberately the same shape as the guest-side lifecycle: a scene is actionable only while
 * every condition that made it meaningful still holds, and invalidation is one-way until a fresh
 * scene arrives. Two sides of the channel reaching different conclusions about readiness would
 * be worse than either being wrong alone, so they use the same vocabulary and the same ordering.
 */
export type HostSceneState =
  /** Nothing has been accepted yet for the current boot. */
  | { readonly status: "no_scene" }
  /** A verified scene is current and the guest desktop is actionable. */
  | { readonly status: "ready"; readonly scene: FieldSceneSnapshot }
  /** Something changed or failed. The previous scene must not be reused. */
  | { readonly status: "invalidated"; readonly reason: string };

/**
 * Polls the guest KVP scene value and folds each read into a readiness decision.
 *
 * The monitor holds no scene bytes of its own beyond the last accepted snapshot, and it never
 * re-promotes that snapshot: only a fresh accepted read can return it to `ready`. Every other
 * outcome — absent, corrupt, rejected, locked desktop, changed boot — invalidates with a
 * specific reason.
 */
export class FieldSceneHostMonitor {
  readonly #receiver: FieldSceneChannelReceiver;
  readonly #secret: string;
  readonly #valueName: string;
  #state: HostSceneState = { status: "no_scene" };
  #bootId?: string;
  #bootStale = false;
  /**
   * Set when the guest desktop stopped being observable. A scene captured before this instant
   * describes a desktop that has since been locked or covered by the Secure Desktop, so it may
   * not restore readiness however well it authenticates.
   */
  #observabilityBarrier?: number;

  constructor(input: {
    receiver: FieldSceneChannelReceiver;
    secret: string;
    valueName: string;
  }) {
    this.#receiver = input.receiver;
    this.#secret = input.secret;
    this.#valueName = input.valueName;
  }

  get state(): HostSceneState {
    return this.#state;
  }

  /** A scene may be acted on only while the monitor is `ready`. */
  get isActionable(): boolean {
    return this.#state.status === "ready";
  }

  /**
   * True once the guest has rebooted under this monitor. Terminal: the receiver's replay state
   * belongs to the previous boot, so a new monitor and receiver are required rather than
   * continuing to fold reads into this one.
   */
  get isBootStale(): boolean {
    return this.#bootStale;
  }

  /**
   * One observation. Ordering mirrors the guest supervisor: boot identity, then desktop state,
   * then the scene value. The most fundamental cause is the one recorded, so a reboot is never
   * reported as a mere lock.
   */
  poll(input: {
    readonly snapshot: Readonly<Record<string, string>>;
    readonly heartbeat: FieldHeartbeat;
    readonly now?: Date;
  }): HostSceneState {
    if (this.#bootStale) return this.#state;

    if (this.#bootId === undefined) {
      this.#bootId = input.heartbeat.bootId;
    } else if (this.#bootId !== input.heartbeat.bootId) {
      this.#bootStale = true;
      return this.#invalidate(
        "boot identity changed; the previous scene belongs to a boot that has ended",
      );
    }

    // A locked or Secure Desktop guest cannot produce an actionable scene, and reading one
    // anyway would only invite promoting content the desktop no longer justifies. The barrier
    // outlives the lock: unlocking on its own must not restore readiness, because the desktop
    // may have changed while nothing was observing it.
    if (input.heartbeat.sessionLocked) {
      this.#raiseBarrier(input.heartbeat.observedAt);
      return this.#invalidate("guest session locked");
    }
    if (input.heartbeat.secureDesktopActive) {
      this.#raiseBarrier(input.heartbeat.observedAt);
      return this.#invalidate("guest Secure Desktop active");
    }

    const read = readSceneFromKvp({
      snapshot: input.snapshot,
      valueName: this.#valueName,
      receiver: this.#receiver,
      heartbeat: input.heartbeat,
      secret: this.#secret,
      ...(input.now === undefined ? {} : { now: input.now }),
    });

    switch (read.status) {
      case "accepted": {
        const capturedAt = Date.parse(read.scene.capturedAt);
        // Fail closed on ties: a scene captured at the same instant the desktop stopped being
        // observable cannot be shown to predate the change.
        if (this.#observabilityBarrier !== undefined && capturedAt <= this.#observabilityBarrier) {
          // Authentic, in-sequence, and still stale: it was captured before the desktop stopped
          // being observable. Only a scene from after that instant can restore readiness.
          return this.#invalidate(
            "scene was captured before the guest desktop stopped being observable",
          );
        }
        this.#observabilityBarrier = undefined;
        this.#state = { status: "ready", scene: read.scene };
        return this.#state;
      }
      case "absent":
        // Absence is not quiet. If a scene was current and the value is now gone, the guest has
        // stopped publishing and the last scene describes a desktop nothing is observing.
        return this.#invalidate("no scene value is published");
      case "unreadable":
        return this.#invalidate(`scene transport failed: ${read.reason}`);
      case "rejected":
        return this.#invalidate(`scene rejected: ${read.reason}`);
    }
  }

  /** Raises the barrier to the latest moment the desktop was known to be unobservable. */
  #raiseBarrier(observedAt: string): void {
    const at = Date.parse(observedAt);
    if (Number.isNaN(at)) return;
    if (this.#observabilityBarrier === undefined || at > this.#observabilityBarrier) {
      this.#observabilityBarrier = at;
    }
  }

  #invalidate(reason: string): HostSceneState {
    this.#state = { status: "invalidated", reason };
    return this.#state;
  }
}
