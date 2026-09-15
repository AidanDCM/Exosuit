# Atomic audit: structural scene display bounds

- **Scope:** Field M2 / SCN-001 host-side adaptation of authenticated structural observations.
- **Live trigger:** Generation 20 published the first authenticated scene envelope. The compiled host verifier accepted its exact Field/generation/boot/key/digest binding, while its UI Automation desktop rectangle reached 2048×1152 under an approved 1920×1080 display contract.
- **Finding:** cursor coordinates were bounded, but active-window, window, and element rectangles were not checked against the approved display before a scene snapshot could be returned.
- **Change:** the unprivileged guest producer rejects any supplied structural rectangle with a negative origin or an extent beyond its configured display before signing/publication. The host independently applies the same rule before replay or scene state advances.
- **Authority:** unchanged. This adds no input, recording, policy, consent, key, export, or administrative authority.
- **Privacy:** unchanged. No screenshot or retained UI text is introduced; the live artifact remains structural-only.
- **Failure posture:** a contradictory coordinate space fails closed and requires display reconciliation plus a fresh scene. It is not scaled, clipped, or silently relabeled.
- **Generation impact:** the source fix requires a new immutable base and Field generation before live validation. Generation 20 remains diagnostic evidence only.
- **Rollback:** revert this isolated validation slice; do not promote any scene whose structural coordinates contradict its display contract.
- **Promotion:** SCN-001 remains unpromoted pending a corrected fresh-generation scene and the remaining repeated-scene, lock, Secure Desktop, heartbeat-loss, replay, restart, and stop ceremonies.
