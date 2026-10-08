# Semantic Model Similarity app

A [Fabric App](https://learn.microsoft.com/fabric/apps/) (built with Rayfin) for the semantic model similarity workflow. From one place you can:

- **Run analysis.** Start notebook 001 with parameters, follow its status, cancel it, and see recent runs.
- **Review.** Rank possible duplicates, schema coverage, and shared-structure pairs, and filter them by finding, workspace, security, and Power Query state. Expand a row to see its seven schema signals.
- **Consolidation.** Pick any model as the one to keep and see every model it duplicates, covers or overlaps, with their reports. From there, approve it as the trusted model, get guidance to promote or certify it, and rebind the other models' reports to it. Review rows (**Consolidate**) and Compare (**Consolidate into A/B**) open it with a target chosen.
- **Compare.** Compare any two catalog models: all three scores, coverage in both directions, differences in tables, columns, measures, Power Query (M), relationships and sources, dependent reports, and a score breakdown.
- **Similarity map.** Use a matrix of Overall scores, shown 40 models at a time. Select a cell to open Compare.
- **Actions.** The trusted models and the full history of decisions and rebinds.

The results views offer the same analysis, labels and thresholds as the results notebook (002), backed by shared parity tests. See [App and notebook 002 parity](docs/parity.md) for the feature checklist and the deliberate differences, and the [technical reference](../docs/reference.md) for how scores are calculated.

## How it works

```text
React app ──► Rayfin Functions (app identity) ──► Fabric Job Scheduler API ──► notebook 001
   │                                                                              │ writes
   └──► fabric-sqlanalytics connector (read-only) ◄── Lakehouse SQL endpoint ◄─────┘
```

| Piece | Location |
| --- | --- |
| Run functions: `startSimilarityRun`, `getSimilarityRun`, `listSimilarityRuns`, `cancelSimilarityRun`, `refreshSimilarityResults` | `packages/functions/src/` |
| Next-action functions: `listApprovers`, `executeRebind`, `undoRebind` | `packages/functions/src/rebind.ts`, `caller.ts` |
| App data (next-action history): `TrustedModelDecision`, `RebindAction` | `packages/data/src/`, contracts in `packages/shared/src/actions.ts` |
| Run parameter contract: defaults, validation, and notebook mapping | `packages/shared/src/similarity-run.ts` |
| Lakehouse entities (read-only, keyless) | `rayfin/connectors/similaritylakehouse/` |
| Data loading, and the port of notebook 002's payload and view logic | `packages/frontend/src/lib/results/` |
| Views | `packages/frontend/src/components/` |

### Run parameters

The app passes these values to notebook 001's Fabric **parameters** cell:

| App field | Notebook parameter | Default |
| --- | --- | --- |
| Workspace | `WORKSPACE_NAME` | blank = all |
| Model | `MODEL_NAME` | blank = all |
| Report workspace | `REPORT_WORKSPACE_NAME` | blank = all visible |
| Candidate blocking | `ENABLE_BLOCKING` | on |
| Duplicate threshold | `DUPLICATE_THRESHOLD` | 0.95 |
| Similar threshold | `SIMILAR_THRESHOLD` | 0.70 |
| Coverage threshold | `CONTAINMENT_THRESHOLD` | 0.95 |

The server validates every value again: names are 256 characters at most, thresholds must be greater than 0 and no more than 1, and the similar threshold can't be higher than the duplicate threshold. Notebook 001 writes over its own output tables, so the app won't start a run while another run is queued or in progress.

You can't turn on temporary workspace access or change the score weights from the app. To use them, run notebook 001 directly.

### Identity and permissions

- **Notebook runs use the Fabric app owner's identity.** Rayfin Functions call Fabric as the owner of the Fabric App item. Each run sees only the workspaces and models the owner can read, whoever selects **Start run**. The owner needs permission to run notebook 001 (Contributor or higher on its workspace).
- **Anyone the app is shared with can start a run.** Share the app only with people who should be able to rescan the catalog.
- **Lakehouse reads.** The connector uses the authentication mode set in `rayfin/rayfin.yml`, which is `application` by default. Check this setting before you share results more widely.
- The app never reads the stored security-definition JSON. Review and Compare show only security status, role counts, and scores. Use notebook 002 to inspect rule-level security differences.

### Next actions and approvals

Next actions live in **Consolidation**. Choose a target model (suggestions list trusted models first, then the models with the most review candidates). The candidate list uses the same thresholds and **Cross-workspace only** scope as Review and covers all three findings: possible duplicates, schema coverage and shared structure.

1. **Trusted model.** Approvers approve the target as a trusted model; anyone else can propose it. Trust belongs to the model, so it shows wherever the model appears. Decisions made in the earlier Groups view still count.
2. **Promote or certify.** Power BI has no public API to endorse a model, so the app links to the model's settings and explains the steps.
3. **Rebind reports.** Expand a candidate to see its reports and how much of the candidate the trusted model covers. A plan below the coverage threshold needs an explicit override, which is recorded. Approvers approve a plan, then either select **Rebind now** or copy a PowerShell script (**Run it yourself**) that makes the same change under their own account. **Undo rebind** moves an executed report back. A candidate that is itself trusted is tagged **Also trusted**.

How approval is enforced:

- **Approvers** are listed in the `APPROVER_EMAILS` secret (comma-separated). Change it with `npx rayfin secret set APPROVER_EMAILS --stdin`.
- **Rayfin Functions can't identify the person calling them.** The token a function receives is a platform app token without user claims. So approval is proven in the app's database instead: `TrustedModelDecision` and `RebindAction` rows are append-only (no update or delete), and a server-side create policy only accepts a row whose `authorEmail` equals the signed-in user's `email` claim. A row written by an address in `APPROVER_EMAILS` counts as an approval.
- **`executeRebind` and `undoRebind`** read the plan from the database, refuse it unless an approver wrote it, check that the report is a Power BI report still bound to the planned model, then call the Power BI Rebind API **as the app owner**. The app owner therefore needs write access to the report and Build permission on the trusted model. Any app user can trigger an approved plan, but nobody can run a plan an approver didn't write.
- The outcome (`executed`, `failed`, `undone`) is recorded as the user who selected the button. Report dependencies in Review and Compare change only after the next analysis run.

### Configure for your environment

The app targets one notebook workspace and lakehouse. Set these before the first deploy:

| Setting | Where | Value |
| --- | --- | --- |
| Notebook workspace ID | `SIMILARITY_WORKSPACE_ID` in `packages/functions/src/similarity-runs.ts`, and `connectors[0].config.workspaceId` in `rayfin/rayfin.yml` | The workspace that holds notebook 001 and its lakehouse |
| Notebook ID | `SIMILARITY_NOTEBOOK_ID` in `packages/functions/src/similarity-runs.ts` | Notebook `001_semantic_model_similarity` (the parameterised version from this repository) |
| SQL analytics endpoint ID | `SIMILARITY_SQL_ENDPOINT_ID` in `packages/functions/src/similarity-runs.ts`, and `connectors[0].config.itemId` in `rayfin/rayfin.yml` | The SQL analytics endpoint of the lakehouse notebook 001 writes to (`LH_SemanticModels` by default) |
| Hosting workspace | `npx rayfin up --workspace "<app workspace>"` | A workspace on a capacity with Fabric Apps turned on |
| Hosted app URL | `services.auth.allowedRedirectUris` in `rayfin/rayfin.yml` | The `hostingUrl` that the first `rayfin up --json` reports; add it and deploy again |
| Approvers | `npx rayfin secret set APPROVER_EMAILS --stdin` | Comma-separated emails of people who can approve next actions |

Find workspace and item IDs in the Fabric portal URL of each item, or with the Fabric REST API (`GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items`).

Run requests from the browser can't change the notebook or workspace IDs. The deployed notebook must be attached to the lakehouse the connector reads.

The hosting workspace can be different from the notebook workspace, for example when the notebook's capacity doesn't have Fabric Apps turned on (creating an app item there fails with `403 The feature is not available`). Notebook runs and lakehouse reads then go across workspaces and possibly regions, so check that this meets your data residency requirements. The hosting capacity must be running for the app to work.

## Develop

Run these commands from this folder (`similarity/app`). You need Node.js 20 or later.

```sh
npm install
npm run typecheck   # shared + functions contract + all packages
npm run lint
npm test            # frontend and functions unit tests
npm run build
npm run dev         # Rayfin local services + Vite; needs `npx rayfin login`
```

`packages/functions/src/types.ts` is generated by Rayfin. Don't edit it by hand. A running `npm run dev` session regenerates it when a function signature changes, and `npm run validate:functions` checks that it matches the registered functions. Handler signatures wrap shared types in `Inline<…>` so that the generated file includes the full types.

> **Warning:** `npm run dev` (`rayfin dev`, CLI 1.36.2) runs against the deployed Fabric App and resends its project settings without the connector. Afterwards the hosted app fails with `UNKNOWN_CONNECTOR` until you run `npx rayfin up` again. To work only on the frontend, use `npm run dev:frontend` instead. It doesn't change the deployed settings, and in that mode function calls return 404 because no local Functions host is running.

The browser connector config in `packages/frontend/src/lib/connectors.ts` lists each entity's columns as strings. It never imports the decorated entity classes, because bundlers can't compile those for the browser. A compile-time check fails if a list doesn't match its entity in `rayfin/connectors/similaritylakehouse/`.

After the lakehouse schema changes, run `npx rayfin connector remove` and then `npx rayfin connector add` to refresh `metadata.json`. Then update the entity files. Only the columns the app uses are mapped, but each entity must keep its table's **first** column: the tables are keyless, and the SQL endpoint treats the first column as the key, so leaving it out makes `rayfin up` fail with `DataSourceMetadataKeyFieldInFieldMappings`. Because that key isn't unique, the app reads each table in one request (up to 100,000 rows) instead of paging with cursors, which would skip rows that share a key.

## Deploy

```sh
npx rayfin login
npx rayfin up --workspace "<app workspace>"
npx rayfin up status
```

`rayfin up` builds the app, then deploys the static app, the functions, and the connector configuration. Check that the JSON output (`--json`) reports `"status": "success"` for the `similaritylakehouse` entry under `generate`; a connector error there doesn't fail the command. After deploying:

1. Open the app in Fabric and confirm that Review loads data.
2. Start a narrow run, for example by setting **Workspace**. Watch it finish, then confirm the results timestamp changes.

The lakehouse SQL endpoint can take minutes to show newly written Delta data. When a run finishes, the app asks the endpoint to sync its metadata (`refreshSimilarityResults`), reloads, and reloads again 45 seconds later.
