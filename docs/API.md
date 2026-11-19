# NarcoTrace API

The API is served at `http://localhost:8000`. Authenticated requests use
`Authorization: Bearer <access-token>`. Missing or malformed credentials return `401`;
authenticated requests outside the role/object policy return `403`.

The machine-readable OpenAPI export is [openapi.json](./openapi.json). To regenerate or
check it, run `python -m app.export_openapi` or `python -m app.export_openapi --check` from
`narcotrace-backend/`.

## Authorization matrix

| Role | Evidence read | Create/sync | Analyze | Append custody | Dashboard and user management |
| --- | --- | --- | --- | --- | --- |
| `field_officer` | Own evidence only | Own evidence | Yes | No | No |
| `lab` | All evidence in own zone | No | No | Own-zone evidence | No |
| `zonal_admin` | All evidence in own zone | No | No | No | Own-zone dashboard and officers |
| `prosecutor` | Released evidence only | No | No | No | No |

`POST /admin/evidence/{id}/release` is restricted to zonal administrators and evidence in
their zone. `Officer.zone` is copied into `Evidence.zone` when evidence is synced, so later
officer zone changes do not change the evidence's access scope.

## Endpoints

| Method and path | Description |
| --- | --- |
| `POST /analyze` | Analyze one multipart `file` and `kit_id`; field officers only |
| `POST /sync/evidence` | Create/sync a field officer's own evidence; idempotent by evidence ID |
| `GET /evidence` | List accessible evidence with filters and pagination |
| `GET /evidence/{id}` | Read one authorized evidence record |
| `GET /evidence/{id}/image` | Decrypt and return the authorized stored image |
| `GET /evidence/{id}/custody` | Read custody events and chain verification status |
| `POST /evidence/{id}/custody` | Append a lab event, such as “Laboratory Received” |
| `GET /evidence/{id}/verify` | Verify custody chain and stored image hash |
| `GET /evidence/{id}/form6.pdf` | Download the evidence Form 6 PDF |
| `POST /admin/evidence/{id}/release` | Mark same-zone evidence released |
| `GET /dashboard/summary` | Zonal-admin-only dashboard summary |
| `/admin/officers` | Zonal-admin officer provisioning and management |

### Evidence list

`GET /evidence` accepts:

- `verdict`, `case_id`
- `captured_from`, `captured_to` (ISO-8601 datetimes, inclusive)
- `sync_state`: `synced`, `pending`, `uploading`, or `failed`
- `limit` (1–100, default 50), `offset` (default 0)

The response contains `items`, `total`, `limit`, and `offset`. The server stores only
successfully synced evidence, so only `sync_state=synced` currently returns records.

### Image uploads

`/analyze` and `/sync/evidence` accept images up to 8 MiB. The server identifies JPEG, PNG,
and WebP from file magic bytes; it does not trust filenames or client MIME headers.
`STRIP_EXIF_GPS=false` is the default. When enabled, GPS EXIF is removed from the stored
copy while the original client hash is retained separately from the stored-copy integrity hash.
`GET /evidence/{id}/image` sets `Cache-Control: no-store`.

### Analyze notices

Successful analysis responses provide `reasons` and `warnings` as machine-readable objects.
They do not include English message text; human-readable messages are written to server logs.

| Code | Category | Parameters |
| --- | --- | --- |
| `CARD_NOT_FOUND` | Reason | — |
| `EXPOSURE_DARK` | Reason | — |
| `EXPOSURE_CLIPPED` | Reason | — |
| `TEST_REGION_UNREADABLE` | Reason | — |
| `PARTIAL_REACTION` | Reason | — |
| `LOW_CONFIDENCE` | Reason | `min` (0–1) |
| `COLOR_AMBIGUOUS` | Reason | `color`, `reagent` |
| `COLOR_NOT_EXPECTED` | Reason | `color`, `reagent` |
| `EXPOSURE_DIM` | Warning | — |
| `EXPOSURE_BRIGHT` | Warning | — |
| `CALIBRATION_RESIDUAL_HIGH` | Warning | `max_delta_e` |

Upload and analysis errors also use a machine `code` in the error detail, including
`IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `IMAGE_DECODE_FAILED`, and `UNKNOWN_KIT`.

### Shared custody vectors

`narcotrace-backend/tests/vectors/custody.json` contains five cross-language canonicalization
vectors, including Unicode actor names. The hashes use UTF-8 JSON with sorted keys, compact
separators, and unescaped Unicode.
