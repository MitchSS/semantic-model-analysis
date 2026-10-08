# App and notebook 002 parity

The app's results views and notebook 002's results page must offer the same analysis: the same findings, counts, filters, labels and wording for the same lakehouse results. This page lists what is shared, how parity is enforced, and the deliberate exceptions.

## How parity is enforced

The two renderers are separate implementations: notebook 002 builds a self-contained HTML page with inline JavaScript, and the app is a React app. To stop them drifting apart:

- `packages/frontend/src/lib/results/payload.ts` ports 002's Python payload builder (`build_payload`, `build_report_dependency_payload`, `build_security_results`). `logic.ts` ports 002's view functions (`tierAt`, `classify`, `candidates`, `reviewSelection`, `buildGroups`, `compareData`, `mapSelection`, wording helpers).
- `.github/scripts/test_similarity_parity.py` runs 002's real builder and template JavaScript over a shared fixture and checks the expected snapshot. `src/lib/results/parity.spec.ts` and `payload.spec.ts` check the app port against the same snapshot and payload. If either side changes behaviour, a test fails.
- After an intentional change to both sides, regenerate the expected files from `.github/scripts`:

  ```sh
  python test_similarity_parity.py --write
  ```

- The React views call `Results`/`ViewState` from `logic.ts` and copy 002's labels. `src/App.spec.tsx` renders the app over `similarity_results_fixture.json`, the same fixture that 002's renderer tests use.

## Feature checklist

When you change a feature in one renderer, make the matching change in the other, then update this table.

| Area | Feature | Notebook 002 | App |
| --- | --- | --- | --- |
| Header | Review thresholds (Apply, Reset defaults, 0–100% validation); saved in browser storage `sms-thresholds-v2` | ✓ | ✓ |
| Header | Light/dark theme toggle | ✓ | ✓ |
| Header | Definitions & scan details dialog (scores, missing values, scope, review limits, report scans) | ✓ | ✓ |
| Header | Cross-workspace only scope | ✓ | ✓ |
| Status | Security, Reports and Scan details strip; unknown-workspace warning | ✓ | ✓ |
| Review | Catalog models, candidate (or cross-workspace) pairs, duplicate groups | ✓ | ✓ |
| Review | Filters: search, finding (with counts), workspace, security, Power Query | ✓ | ✓ |
| Review | Sort by Overall, Schema, Security, Finding; 25/50/100 rows per page; Clear filters | ✓ | ✓ |
| Review | Expand a row into the seven schema signals | ✓ | ✓ |
| Review | Compare opens at the most relevant section | ✓ | ✓ |
| Groups | Search; group table; members with security and report counts; Model A/B pickers; Compare | ✓ | ✓ |
| Compare | Model A/B selection and swap; Back to the previous view | ✓ | ✓ |
| Compare | Finding, security tag, outside-scope note, Differences only | ✓ | ✓ |
| Compare | Schema/Security/Overall, coverage A within B and B within A, schema entry counts, security notice | ✓ | ✓ |
| Compare | Tables, Columns, Measures (formula text), Power Query (M query), Relationships, Sources | ✓ | ✓ |
| Compare | Dependent reports (only `https://app.powerbi.com` links open) | ✓ | ✓ |
| Compare | Score breakdown: blend, seven schema signals, security components and weights | ✓ | ✓ |
| Compare | Security definitions: role-by-role rule differences | ✓ | Status and role counts only (see exceptions) |
| Map | Search, workspace filter, 40-model slices, legend, outside-scope cells, cell opens Compare | ✓ | ✓ |
| App only | Run analysis (start, follow, cancel notebook 001) | — | ✓ |
| App only | Next actions (trusted model, report rebind, promote/certify guidance) | — | ✓ |

## Exceptions

- **Run analysis and next actions are app-only.** They call Fabric and Power BI APIs as the app identity, which a notebook output can't do safely.
- **Security definitions stay in notebook 002.** The app never reads `semantic_model_security` or `security_definition_json`. It trusts the saved security fingerprint and role count, so its Security definitions section shows the comparison status and role counts, and points to notebook 002 for rule-level differences.
- **Long text is truncated for the app.** The lakehouse SQL endpoint exposes strings as `varchar(8000)`. The app uses notebook 001's `expression_hash` for Power Query equality, so M comparisons stay exact, but M and DAX text over 8,000 characters is cut short in Compare. DAX equality in the app uses a hash of the truncated text, so two long measures that differ only after 8,000 characters show as matching.
- **Hashing.** The app hashes normalized DAX with its own function (`textHash`) instead of MD5. Equality results are the same; only the internal key differs.
- **Report entries.** The app's report entries also carry `reportType`, which next actions use to decide whether a report can be rebound.
