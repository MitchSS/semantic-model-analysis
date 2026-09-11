# Semantic Model Similarity

Find duplicate and near-duplicate Microsoft Fabric semantic models before they become a governance problem.

This project helps BI and data teams compare semantic models through separate schema, security, and combined similarity scores. It highlights structural overlap while exposing differences in RLS and object-level security, so security variants are not presented as interchangeable simply because their business definitions match.

Screenshots use synthetic demo data rendered by the results notebook in its desktop dark theme.

![Desktop Review view showing a synthetic model inventory and a possible duplicate with separate schema, security, and combined scores](docs/images/review-desktop.png)

*A high combined score still carries a visible warning when security definitions differ.*

## Why it matters

As semantic models grow across teams, workspaces, and business domains, duplicate models often appear in different forms:

- same business logic implemented more than once
- copy-and-paste versions of an existing model
- legacy models that were rebuilt without visibility into prior work
- overlapping data marts or analysis layers that should be consolidated

This project gives you a fast way to surface those patterns using the metadata already available in Fabric.

## What the solution does

The workflow is intentionally simple:

1. Catalog semantic model metadata from Fabric using Semantic Link Labs and TOM, plus direct report-to-model bindings through the Power BI API.
2. Build schema signatures and collect role permissions, RLS filters, table OLS, and column OLS definitions.
3. Calculate schema similarity, security similarity, and a combined score using 95% schema and 5% security by default.
4. Score directional schema containment, separately from security.
5. Flag possible duplicates and subset relationships, with visible security-difference warnings.
6. Group duplicate relationships into clusters.
7. Review the results in a dedicated, interactive Fabric notebook app.

## Key benefits

- Save time during model governance reviews
- Identify redundant semantic models across workspaces
- Highlight consolidation candidates quickly
- Surface near-duplicate models before they create reporting confusion
- Keep the workflow in a notebook, using Fabric-native metadata

## Typical use cases

- Semantic model cleanup and deduplication
- Governance and stewardship reviews
- Inventory analysis across multiple workspaces
- Detecting copy-and-paste model sprawl
- Assessing whether two models are materially similar
- Identifying superset/subset models for consolidation

## How it works

The project has three notebook stages:

### 1. Catalog the model metadata

The catalog notebook connects to Fabric semantic models through read-only TOM access and extracts:

- model metadata
- data sources
- tables
- columns
- measures and DAX expressions
- relationships
- RLS, table OLS, column OLS (CLS), and relationship security definitions
- security scan completeness, distinguishing no roles from unreadable metadata
- workspace/model errors
- direct report bindings and per-workspace report scan status

This data is written to Lakehouse Delta tables so it can be analyzed and reused.

### 2. Score model similarity and containment

The similarity notebook reads the catalog, builds a signature per model, and computes:

- structural overlap across metadata objects
- name and DAX similarity using TF-IDF
- separate symmetric schema and security similarity scores
- a combined score using 95% schema and 5% security when security applies
- a directional schema containment score that excludes security
- combined-score duplicate / similar / distinct classification, with unassessed status when security is unknown
- connected duplicate clusters

It writes the signatures, scores, duplicate clusters, and run settings to Lakehouse Delta tables for the results notebook.

Role names do not affect security similarity: roles are matched one-to-one by their rules while preserving role boundaries. When both complete scans find no roles, security is not applicable and combined equals schema. If security is unreadable, schema remains visible but security and combined are unavailable.

Security differences are warnings, not a veto. At the default 95% duplicate cutoff, 100% schema plus 0% security still yields a 95% combined score and a possible-duplicate label. These remain review candidates, not models approved for replacement.

### 3. Review consolidation candidates

The results notebook uses a custom, self-contained `displayHTML(...)` renderer with four focused views:

- **Review** combines estate statistics with a ranked queue, three-score summaries, and security warnings.
- **Groups** explores connected duplicate candidates and flags security differences across their members.
- **Compare** provides schema, security, and combined scores with aligned role-rule differences and structural/DAX evidence.
- **Similarity map** shows combined scores with separate schema/security values in tooltips.

The standalone **Reports** tab is temporarily omitted; report counts in Review and Groups and dependent-report details in Compare remain available.

Report counts add consolidation impact context; they do not change similarity scores. Missing or incomplete scans are distinguished from verified zero-report results. Counts describe the current snapshot within the identity's visible, selected report scope, not tenant-wide usage or proof that a model can be retired.

When candidate blocking is enabled, the map still lists all catalog models, but pairs excluded before scoring appear as **Not scored** rather than as misleading zeroes.

![Desktop Compare detail showing matching schema entries alongside column OLS, RLS, and table OLS differences in a synthetic model pair](docs/images/compare-desktop.png)

*Compare keeps schema coverage and security-rule evidence separate. This scrolled detail shows why matching business definitions do not make models interchangeable.*

## Outputs you can review

The workflow produces a clear set of results for review:

- one ranked queue of unique consolidation-candidate pairs
- connected duplicate groups with selectable comparisons
- summary-first schema, security-rule, and DAX comparison
- an all-model similarity map that distinguishes scored, zero-score, and unscored pairs

## Who this is for

This project is useful for:

- BI architects
- semantic model owners
- analytics governance teams
- Power BI and Fabric administrators
- data stewards managing model sprawl

## What you need

- Microsoft Fabric notebook runtime
- access to the semantic models you want to compare
- an attached Lakehouse
- the required Python packages installed in the notebook runtime

## Recommended workflow

1. Run the catalog notebook interactively to populate metadata and security tables.
2. Review the model inventory and security scan completeness.
3. Run the similarity notebook to score model overlap.
4. Run the results notebook against the same Lakehouse.
5. Use **Review**, **Groups**, **Compare**, and **Similarity map** to guide consolidation, cleanup, or governance follow-up.

## A practical value statement

This project turns a difficult metadata problem into a clear review process: instead of manually comparing models table by table, you get a structured view of likely duplicates, near-duplicates, and model pairs with high directional schema coverage at your chosen threshold.

That makes it easier to reduce sprawl, improve model hygiene, and keep your Fabric estate more maintainable.

## Important note

This is a metadata-driven similarity solution. Matching security definitions do not establish matching role assignments or effective user access. The workflow does not test enforcement or compare source-system security, and it does not replace a business review or semantic design assessment. Existing catalogs need the updated catalog and scoring notebooks rerun before security and combined scores are available.
