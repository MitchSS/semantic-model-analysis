# Semantic Model Similarity app

A [Fabric App](https://learn.microsoft.com/fabric/apps/) (built with Rayfin) for the semantic model similarity workflow. From one place you can:

- **Run analysis.** Start notebook 001 with parameters, follow its status, cancel it, and see recent runs.
- **Review.** Rank possible duplicates, schema coverage, and shared-structure pairs. Overall, schema, security, and coverage scores appear side by side.
- **Groups.** Browse connected possible-duplicate groups.
- **Compare.** Compare any two catalog models with all three scores, coverage in both directions, a breakdown of the schema signals, catalog counts, and dependent reports.
- **Similarity map.** Use a heatmap of Overall scores, shown 40 models at a time. Select a cell to open Compare.

The views use the same score meanings as the results notebook (002). See the [technical reference](../docs/reference.md) for how scores are calculated.

## How it works

```text
React app ──► Rayfin Functions (app identity) ──► Fabric Job Scheduler API ──► notebook 001
   │                                                                              │ writes
   └──► fabric-sqlanalytics connector (read-only) ◄── Lakehouse SQL endpoint ◄─────┘
```

| Piece | Location |
| --- | --- |
| Run functions: `startSimilarityRun`, `getSimilarityRun`, `listSimilarityRuns`, `cancelSimilarityRun` | `packages/functions/src/` |
| Run parameter contract: defaults, validation, and notebook mapping | `packages/shared/src/similarity-run.ts` |
| Lakehouse entities (read-only, keyless) | `rayfin/connectors/similaritylakehouse/` |
| Data loading and view models | `packages/frontend/src/lib/` |
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
- The app never reads the stored security-definition JSON. Review and Compare show only security status and scores.

### Target resources

| Resource | Value |
| --- | --- |
| Fabric App item (hosting) | Workspace `Rayfin France` (`c2a25257-248f-46bb-b07a-48392a297ef4`), capacity `fabfrancerayfin` (France Central) |
| Notebook workspace | `semantic-model-similarity-20260805` (`a5a00e8c-d269-4422-9cfc-a6626a4f2ff3`) |
| Notebook | `001_semantic_model_similarity` (`5bd4d491-889e-4b07-af84-daddfbc3c95c`) |
| Lakehouse | `LH_SemanticModels` (`f997d7ec-692b-49b1-bba5-3be168fe89fd`) |

The app is hosted in a different workspace from the notebook and lakehouse. Fabric Apps isn't turned on for the West US 3 capacity that `semantic-model-similarity-20260805` uses: creating an app item there fails with `403 The feature is not available`. As a result, notebook runs and lakehouse reads go across workspaces and regions (France Central to West US 3). Check that this is acceptable under your data residency requirements. The `fabfrancerayfin` capacity must be running for the app to work.

The notebook and workspace IDs are set in `packages/functions/src/similarity-runs.ts`. Run requests from the browser can't change them. The connector target is in `rayfin/rayfin.yml`. The deployed notebook must be the parameterised version of notebook 001 from this repository, attached to `LH_SemanticModels`.

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

After the lakehouse schema changes, run `npx rayfin connector remove` and then `npx rayfin connector add` to refresh `metadata.json`. Then update the entity files. Only the columns the app uses are mapped.

## Deploy

```sh
npx rayfin login
npx rayfin up --workspace "Rayfin France"
npx rayfin up status
```

`rayfin up` builds the app, then deploys the static app, the functions, and the connector configuration. After deploying:

1. Open the app in Fabric and confirm that Review loads data.
2. Start a narrow run, for example by setting **Workspace**. Watch it finish, then confirm the results timestamp changes.

The lakehouse SQL endpoint can take a short time to show newly written Delta data. The app reloads straight after a run finishes and again 45 seconds later.
