# ALEC Desktop — Windows x64 candidate

Build base: Roamies v0.1.51, commit 362645466349f4c520ad453d94a94c2481776c2f. This is a pre-release engineering candidate, not a finished production release.

The Windows pipeline checks source parity, runs the original sidecar tests, compiles the original Tauri Windows application and native helpers, installs into the runner and verifies the helper self-tests and agent startup. It uploads an unsigned NSIS setup and SHA-256 only after the checks succeed. The full set of native drawing, screen markup, screenshots, pointer, file, web, memory, automation, tools and UI events is retained in the code, not replaced with a chat mock. Actual drawing, pointer movement, microphone, wake word, model calls and phone connectivity require an interactive Windows session to validate; the automated smoke test alone does not prove functional equivalence.

## Candidate restrictions
- Keep the old Roamies installation. Exit Roamies and any standalone V16 Bridge before opening ALEC. The application shares ~/Roamies, ~/.gg and the remote mailbox; do not run both simultaneously. Make a local backup first. No installer should be promoted until live acceptance checks pass.
- The public build does not embed the private personalized bundle, its secrets or personal folder list. On Windows it recognizes the exact previously audited local Roamies bundle and reads the voice reference and name as inert data; if the hash differs it uses native defaults. It does not execute that file.
- The V16 Bridge supervisor requires a local extracted V16 project and a valid Python 3.10+ installation. The public candidate does not bundle the private ZIP or Python. The managed server is opt-in. The folder list applies to direct Bridge file operations, not unrestricted Ask agent tools. Full Ask isolation, Cloudflare-specific catalog, generic repository execution adapters and custom Hello Alex helper validation remain outstanding.
- Built-in Roamies wake/voice helper retained. Do not overwrite the old custom helper. Public candidate is unsigned (Windows SmartScreen may warn). No automatic update from original upstream.
- The native drawing and screen-marking tools require a compatible model with vision and tool calling, as in Roamies. Text-only mode cannot use them. No model's capabilities are invented.
- Test both local and remote flows before using the new app for production tasks. Check drawing/marking/dragging, desktop overlay, capture and screenshot, screen and window OCR, cursor follow, native app interactions, tools and approvals, file read/write, command execution, voice/PCM and wake word, memory and all configured providers, remote pairing, Ask, direct file permissions, reconnect and graceful shutdown. Test every native panel page and ability, including agents, MCP, skills and routines.

## Corresponding source
The artifact contains the original source reference in SOURCE.txt, ALEC-source.patch, the added source files under new-source/, and original AGPL license. Apply the patch to the pinned original checkout and copy new-source into its root. The public build recipe is also in the ALEC repository at the commit identified in SOURCE.txt. Preserve the original credits and license.

Download only from the successful Actions run. An Actions run, an installer filename or a source archive is not proof of a completed build.
