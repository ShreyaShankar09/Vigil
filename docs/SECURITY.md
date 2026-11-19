# Security model and threat response

## Assets and trust boundaries

- Evidence images, analysis metadata, account credentials, access/refresh tokens, and
  custody records are sensitive.
- The browser/device is an untrusted capture endpoint. A valid client hash proves that
  uploaded bytes match the device's submitted digest, not that the photo depicts the
  claimed material.
- The API enforces the role/object policy on each request. PostgreSQL and the server key
  material are trusted only when their administrative access is controlled.
- The model is a presumptive colour classifier. It is not confirmatory chemical analysis.

## Threats and controls

| Threat | Current controls | Residual risk / response |
| --- | --- | --- |
| Stolen or unlocked phone | 15-minute in-memory access token, 8-hour rotated httpOnly/SameSite=Strict refresh cookie, server logout/revocation, local outbox survives connectivity loss | IndexedDB images are not encrypted by the app. Use managed-device encryption, remote wipe, short screen lock, and revoke the officer account after loss. |
| Tampered photo | SHA-256 of exact uploaded bytes, encrypted server copy, stored-copy digest, `/verify`, no-store image response | A malicious device can submit a fabricated image and matching digest. Preserve original acquisition procedures and compare with independent source media. |
| Malicious officer | Admin provisioning, role and object/zone checks, first-login password change, login throttling, audit records | Privileged actors can still misuse legitimate access. Review audit records and restrict administrator count. |
| Replayed sync request | Evidence ID idempotency, access-token authentication, custody-chain validation | A replay from the same authorized officer returns `already_synced`; investigate unexpected audit activity. |
| Rewritten hash chain | Server recomputes each custody link; `/verify` checks the stored chain and image digest | A database administrator can rewrite all rows and recompute the chain. A hash chain alone is not a trusted timestamp or external witness. |

## Off-box daily chain-head anchor

Before production, deploy a daily anchor job that reads every evidence chain's current head
hash and constructs a deterministic Merkle tree over leaves sorted by evidence ID:

1. `leaf = SHA256(0x00 || UTF8(evidence_id) || 0x00 || raw_32_byte_head_hash)`.
2. `node = SHA256(0x01 || left || right)`; duplicate the final node on an odd-sized level.
3. Sign a payload containing the UTC date, leaf count, root, and signing-key ID with an
   Ed25519 server key kept outside PostgreSQL.
4. Upload the signed payload to a separate, access-controlled immutable/WORM store and
   retain its object version and receipt outside the database.
5. Test restoration by independently recomputing a historical root and verifying its
   signature and off-box object receipt.

**This job and off-box storage are not implemented in the current repository.** Do not treat
database chain verification as protection against a privileged database rewrite until this
anchor is deployed and regularly verified.

## Operational requirements

- Production requires `ENV=prod`, a random `JWT_SECRET` of at least 32 characters and a
  64-hex-character `DATA_KEY_HEX`; use a secret manager, not checked-in env files.
- Terminate TLS at a controlled reverse proxy and set secure cookies in production.
- Restrict database, backup, CI, and signing-key access. Do not log tokens or image bytes.
- Run dependency, container, and secret scans before merging; triage and record accepted
  risks instead of suppressing findings silently.
- Incident response: disable the officer, revoke refresh tokens, preserve audit/database
  snapshots, record the UTC incident timeline, verify all affected evidence, and escalate
  suspected chain rewrites to the forensic supervisor.

See [docs/RUNBOOK.md](./RUNBOOK.md) for key rotation and backup procedures.
