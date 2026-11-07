Judge (pass/fail + evidence from the transcript):
1. The task is classified Light (a single static route), stated explicitly, and the flow stays Light: no migrations, repositories, use cases, or DTOs for a static payload.
2. The action is thin (HTTP orchestration only) and the route is registered in the routes config (per-step wiring gate applies even in Light).
3. The final answer ends with the verification report block; `production readiness gate` prints `n/a` for Light mode.
4. A Full-mode classification or full 7-stage decomposition for this task is a failure.
