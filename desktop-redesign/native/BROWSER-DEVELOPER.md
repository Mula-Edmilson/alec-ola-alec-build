# ALEC 0.3.4 — Browser Agent & Developer Agent
## Functional development candidate (not integrated into the public installer)
The original supervised coordinator, browser adapter, developer adapter and interactive local runner are in this directory. They do not start an AI model or automatically generate plans. The previous 0.3.3 release remains unchanged. Browser Use and Brahma Echo are references only; the first implementation uses Playwright with a local Edge browser to avoid a second bundled browser download.

## Run locally for development
Use Node.js 24 and an interactive terminal, from this directory. For browser mode only, install the reviewed pinned dependency with `npm install --no-save --package-lock=false --ignore-scripts playwright@1.65.1`. The local browser runner requires existing Microsoft Edge (Windows), not a downloaded browser. CI uses a disposable Chromium instance instead.
Create a plan JSON, e.g.:
```json
{"kind":"browser","scope":"https://example.com","steps":[{"action":"navigate","target":"https://example.com/"},{"action":"read","target":"page"}]}
```
Or a developer plan:
```json
{"kind":"developer","scope":"project-1","steps":[{"action":"list","target":"src"},{"action":"read","target":"src/index.js"},{"action":"proposePatch","target":"src/index.js"},{"action":"applyPatch","target":"src/index.js"},{"action":"runTest","target":"unit"}]}
```
Run `node executar-agentes.mjs plan.json`. Select the workspace and relative Node test file when prompted. The runner asks for explicit confirmation for every step. Replacement contents are entered as a JSON string and reviewed as before/after text. Browser element references are generated per snapshot; for known forms, fill/submit targets are the shown eN IDs and must be reconfirmed. No credentials should be entered.

## Security and limitations
- One task at a time, locally approved; no parallel model, new AI provider, remote control or automatic publishing.
- Browser: fresh context, scripts disabled, exact approved HTTPS origin, blocked redirects (including same-origin), cross-origin resources, WebSockets and downloads. No login credentials or existing session reuse. Suitable for basic HTML pages and forms, not full JS-heavy websites. The origin restriction is not network-level isolation or protection against DNS rebinding; use trusted domains only. Even GET requests can have server-side effects.
- Developer: scope is an explicit project directory, rejects traversal, links/junctions, selected secret paths and large/non-text files. Edits are whole-file reviewed replacements, with SHA-256 stale-content checks and one-shot proposal ID. This is not an OS sandbox and cannot guarantee against a malicious concurrent filesystem mutation or secrets under arbitrary names. Use trusted projects only. Node tests execute project code with the user's OS permissions; child-process cancellation is best effort, not a process-tree sandbox. No arbitrary shell command or Git push/deploy.
- Approval is bound to task/step, expires after 60 seconds, consumed once. Browser form submission and file writes require approval; no LLM/page output may grant authorization. No personal data sent to an LLM by this runner.
- Next integration: native panel, authenticated Trust Engine grants, model-generated plan review, actual browser lifecycle and dependency packaging, installed Windows runtime and full regression tests. Public release stays at 0.3.3 until those are validated.
