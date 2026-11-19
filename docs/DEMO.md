# Three-minute fixture demo

This demonstration uses generated synthetic fixture images only. It is not a field test or
evidence from a real investigation.

## Before the demo

1. Run `make setup`, `make dev`, then `make seed` and create a zonal administrator.
2. As administrator, provision a field officer and a lab account, each with a temporary
   password. Change each password on first login.
3. Keep the synthetic fixture files in `narcotrace-synthetic-dataset/test/`; use no real
   case data.

## Timeline

| Time | Demo action |
| --- | --- |
| 0:00–0:25 | Open the sign-in page, switch to Hindi or Kannada, then sign in as the field officer. Point out that the model banner says synthetic baseline. |
| 0:25–1:20 | Open New test, enter a demo case ID, choose `KIT-COC-04`, click Reagent added, and upload `test/blue/SYN0000_00.jpg`. Show calibration and the **presumptive only** warning. |
| 1:20–1:50 | Open Evidence, select the new row, review its image hash, analysis details, and custody timeline. Run Verify integrity. |
| 1:50–2:25 | Log in as the lab user, append “Laboratory Received” through the API or an enabled lab workflow, then return to the officer and verify the extended chain. |
| 2:25–3:00 | Generate a Form 6 draft, point out that legal wording is marked placeholder, and show that the downloadable PDF contains the evidence ID and hash. |

Do not present any synthetic verdict, model metric, kit chart, or PDF as a validated
forensic conclusion.
