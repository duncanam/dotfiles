# TODO — Architect / Implementor

Goal: An opt-in Pi extension with independently configured tmux agents and a parent UI that routes feedback without using the parent model.

Constraints:
- Parent model, conversation, tools and existing settings remain unchanged.
- Architect plans/reviews, implementor codes; only bounded explicit communications cross roles.
- Architect independently inspects artifacts after completion; no worker transcript tool.
- Default timer is 600 seconds per assignment cycle, not per tool/turn/status.
- Explicit role extension/skill allowlists; no automatic child extension discovery.
- Independent provider/model/reasoning effort per role; unsupported effort fails clearly.
- One conversation per role across all tasks while enabled; disable kills tmux/workers, and re-enable starts fresh.
- Cleanup is leased and best-effort under OS failure; no claim of an OS security sandbox.

- [x] Add validated YAML configuration, protocol/state machine, and role policies with unit tests.
  - Verified independent effort, invalid config, anchored timers, stale cycles, evidence gating, scoped reads, and role tools.
- [x] Add tmux RPC transport, heartbeat watchdog, exact-name orphan cleanup, and failure/cleanup tests.
  - Verified parent SIGKILL, heartbeat expiry, detached tool cleanup, failed startup rollback, and selective stale-session reap.
  - Also verified the secondary worker watchdog against SIGKILL of a real Pi worker's bridge without model calls.
- [x] Add child tools and parent commands/input routing with responsive side-by-side log panes.
  - Verified editor interception (including ! and /compact), width safety, pause gates, two-task continuity, transcript isolation, and editor restoration.
- [x] Validate integration with mock RPC workers, real Pi startup without model calls, and document setup/limits.
  - `npm run typecheck`: passed. `npm test`: 17 passed.
  - `npm run smoke`: both configured real Pi workers loaded at exact models/effort with zero messages.
  - Real interactive tmux smoke: both panes rendered, /ai-disable restored input and cleaned up; no model calls.
  - README documents configuration, lifecycle, checks, trust/cleanup limits, and the untested paid-model workflow.

- [x] Replace user-facing ai commands with /pair-enable and /pair-disable; move status into the live UI.
  - Show lifecycle, cycle, phase, and check-in countdown without a status command; distinguish failed/stopping from stale worker activity.
  - Updated editor routing, configuration comments, docs and tests. Typecheck passed; 18 tests passed.
  - Real Pi/tmux smoke confirmed both renamed commands, live status header/footer, role labels, and cleanup without model calls.

- [x] Restyle the panes as theme-aware rounded cards with role accents, status badges, separate model/effort metadata, and differentiated log entries.
  - Added a clearly labeled check-in progress indicator without changing orchestration/timer behavior.
  - Typecheck and all 19 tests passed, including real dark/light palette and width/height/sanitization checks.
  - Real Pi TUI smoke verified dark/light themes and narrow stacked cards with no model calls.
  - Updated existing YAML to openai-codex/gpt-5.6-sol max and openai-codex/gpt-5.6-luna max; real startup verified exact provider/model/effort with zero messages.

- [x] Correct the screenshot's visual problems: remove filled backgrounds, use continuous quiet borders and adjacent status labels, constrain ultrawide layout, and compact empty panes.
  - Removed routine startup/debug chatter and duplicate footer details; retained errors/warnings and unchanged workflow behavior.
  - Initially used compact/capped panes; superseded by the user's sizing clarification below.
  - Typecheck and 20 tests passed, including screenshot-scale width, zero background painting, idle/active height, and dark/light theme regressions.
  - Real Pi/tmux verified light/dark rendering at 380 columns and stacked layout at 50 columns, without model calls.

- [x] Restore tall, full-terminal-width 50/50 panes per user clarification, retaining the clean styling.
  - Removed the width cap and idle collapse; kept neutral backgrounds, subtle borders, adjacent status, and reduced clutter.
  - Typecheck and all 20 tests passed, including even splits at 80–380 columns and stable 18-row idle/active panes.

- [x] Switch extension configuration to JSON while preserving settings except the requested architect effort change.
  - Added architect-implementor.json with Sol/high and Luna/max, both openai-codex; verified all other values exactly match the old YAML.
  - Replaced loader/example/docs, removed the direct YAML dependency, and preserved the old local file as architect-implementor.yaml.bak.
  - Typecheck and 22 tests passed, including JSON errors, size limits, relative paths, and end-to-end integration.
  - Real Pi smoke confirmed both exact provider/model/effort selections with zero messages/model calls.

- [x] Add /pair-models for temporary per-role model/effort overrides, with a picker, direct arguments, and per-role reset.
  - Verified pre-enable staging, live role/effort changes, per-role reset, picker cancellation, editor routing, and clearing overrides on disable. Parent APIs remain untouched.
- [x] Safely switch existing workers at a settled boundary without losing context or resetting cycles; verify exact selections and rollback rejected changes.
  - Verified busy/retry-gap ordering, prompt serialization, context/process continuity across two tasks, unsupported-effort rollback, unknown-model rejection, expiry/stop, and fail-closed timeout/rollback behavior.
- [x] Verify command routing, cancellation, override lifecycle, busy-worker ordering and rollback with tests; run typecheck and zero-prompt real Pi smoke; document usage.
  - Typecheck and all 28 tests passed. Real Pi switched each existing worker to the other model/effort and back, with unchanged session IDs and zero messages/model calls.
  - Smoke verified extension JSON and Pi settings.json remained byte-for-byte unchanged. README documents syntax, temporary scope, waiting, validation and rollback.
