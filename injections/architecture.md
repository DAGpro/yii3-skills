## Yii3 support (from yii3-skills)

Load the `yii3` skill and generate or update ARCHITECTURE.md per its `references/core-architecture-alignment.md`:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Architecture-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Pattern & tier alignment: map the chosen `/aif-architecture` pattern (`explicit`, `structured`, `layers`) to the corresponding Yii 3 isolation tier (Strict, Balanced, Pragmatic) per `references/core-architecture-alignment.md` §1–§2.
- Universal presentation invariant: enforce presentation isolation from persistence (thin actions, zero direct SQL/transactions) and composition root in `config/` per `core-architecture-alignment.md` §3.1–§3.3.
- Stack invariants: record exactly one DB driver, one persistence path, one queue/cache/mutex driver, and one test runner per SKILL.md Stage 0 item 2.
- Pre-existing & starter code policy: define the authoritative target architecture in "## Folder Structure" and qualify existing/scaffolding files under the 4 strategies (Quarantine, Dedicated Main context with Anti-Dumping invariant, Global Web-Shell, or Strangler Fig) per `core-architecture-alignment.md` §3.6.
- Zero-ambiguity contract: ensure the generated `ARCHITECTURE.md` explicitly defines concrete directory structures, module boundaries, and file naming conventions so subsequent feature plans require zero architectural guesswork.
