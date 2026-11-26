# Sigma independent bridge

Pinned upstream: https://github.com/aleksey-hoffman/sigma-file-manager/tree/d0da797fa1ded2f8601d0e065329da06b43971e9 (2.3.0). The Rust module is GPL-3.0-or-later. Keep the upstream notices and provide corresponding source when distributing modified Sigma.

Use a clean checkout at that SHA. Run `python sigma-integration/apply_patch.py <checkout>` then the upstream build instructions. The module uses existing Tauri, Tantivy, Axum and Tokio components; it adds no dependency. The listener is opt-in, authenticated and binds only 127.0.0.1:47821. Set ALEC_SIGMA_ENABLE=1, ALEC_SIGMA_TOKEN to a random 32-byte hex token, and ALEC_SIGMA_ROOTS to a JSON array of 1–32 approved existing directories (not drive roots). Pass the same token to ALEC's development process. Never commit secrets. See desktop-redesign/native/ALEC-VISION.md.

CI checks the real pinned Windows Rust source and tests the module and Desktop transformation. A successful CI run does not prove live end-to-end behaviour; that requires a real Windows session and populated Sigma index. No release or automatic process management yet.
