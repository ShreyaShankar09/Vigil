# Operations runbook

## Backup and restore

Use encrypted, access-controlled storage for both the PostgreSQL dump and the encryption
key backup. The database alone is not a usable evidence backup.

```sh
docker compose exec -T postgres pg_dump -U narcotrace -Fc narcotrace > narcotrace.dump
createdb -h <restore-host> -U <restore-user> narcotrace_restore
pg_restore -h <restore-host> -U <restore-user> -d narcotrace_restore --no-owner narcotrace.dump
```

Restore the matching `DATA_KEY_HEX` into the approved secret manager before validating
encrypted images. Run migrations, verify representative image hashes and custody chains,
and record the restoration time and operator. Never test restore by overwriting production.

## Key rotation

- **JWT secret:** issue a new secret in the secret manager, restart all API instances, and
  require officers to sign in again. Confirm refresh-cookie rotation and revocation.
- **Image data key:** the existing single-key configuration does not support transparent
  multi-key decryption. Schedule an audited maintenance window, back up database and old
  key together, decrypt/re-encrypt each stored image using a controlled migration, verify
  each stored digest, then switch the key. Do not simply replace `DATA_KEY_HEX`.
- **Future chain-anchor key:** rotate Ed25519 keys with a key ID and preserve historical
  public keys so old off-box signatures remain verifiable.

## Retraining

The current model is a synthetic baseline. Follow [docs/EVALUATION.md](./EVALUATION.md) and
[docs/MODEL_COMPARISON.md](./MODEL_COMPARISON.md); do not promote a retrain without a
reproducible, held-out evaluation and an explicit model-card review. The available command
is `make train`; inspect its run outputs and retain the prior model for rollback.

Real photos require an approved, lab-confirmed manifest and session-level separation before
they may be used for validation. Do not add personally identifying or case evidence to the
synthetic dataset or commit it to source control.

## Verify kit charts

1. Obtain the manufacturer's chart for the exact reagent/kit lot and record its citation.
2. Compare each expected and ambiguous colour under the approved reference conditions.
3. Have an authorized reviewer record their name and verification date.
4. Run `python -m app.ml.verify_chart KIT-COC-04 --by "<name>"` from the backend.
5. Review the diff, run policy tests, and record the kit lot and chart revision in the
   deployment change log.

Do not set a chart verified based only on published general reagent references.

## E2E test environment

`make e2e` starts the compose PostgreSQL/backend, resets only records prefixed for E2E, and
runs Playwright. The test seed requires `E2E_SEED_ALLOW_RESET=1` and `ENV=dev`; the guarded
tamper helper additionally requires `E2E_MUTATIONS_ENABLED=1`. Never enable these switches
in production.
