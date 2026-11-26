# ALEC Vision — Sigma (V8 experimental)

Base: ALEC V7.2. The Sigma service is the independent GPL bridge from the earlier ALEC Vision prototype; it must be patched/compiled separately against the documented Sigma 2.3.0 commit. Stock Sigma does not expose this API. This branch adds Desktop-side tool registration and a Visão panel, not a new Windows installer.

- Start the modified Sigma and ALEC from the same local development session with a random 32-byte hex ALEC_SIGMA_TOKEN; configure ALEC_SIGMA_ENABLE=1 and ALEC_SIGMA_ROOTS on Sigma only. Do not expose port 47821 to the LAN or Tailscale. Never commit the token.
- Visão > ALEC Vision · Sigma File Manager > Activar > Testar ligação. With a tool-capable non-lite model, ask ALEC to find a filename or list an authorised folder. Disabled by default. Existing ALEC read-safety checks additionally filter Sigma paths. The index must already exist.
- Only status, search and list metadata are available. No opening, content reading, mutations, or new Remote capabilities. This feature uses the existing local agent, not a new model. Remote-origin calls to the new tools are blocked; existing Remote behavior is unchanged. Lite and conversation-only modes do not advertise the tools.
- The connection token is currently inherited from the development process environment. A production credential-store handoff and managed Sigma startup are not implemented. Metadata sent to a cloud model may leave the computer under the model provider's existing policy. Search results are incomplete by design.

## Verify

Run `node --test desktop-redesign/native/test-alec-sigma-vision.mjs`. Then run the existing source-preparation and build checks on the audited upstream checkout, followed by real Windows integration checks against the independently compiled Sigma server. Do not install over a working V7.2 release until these checks pass.
