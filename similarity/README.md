# Semantic Model Similarity

This project catalogs Microsoft Fabric semantic models, measures their structural/text similarity and directional containment, and highlights duplicates, near-duplicates, and subset relationships in a notebook workflow.

## What this repo contains

```text
.
├── README.md
├── README.marketing.md
└── notebooks/
    ├── 001_semantic_model_tom_catalog.ipynb
    ├── 002_semantic_model_similarity.ipynb
    └── 003_semantic_model_similarity_results.ipynb
```

The repository is intentionally notebook-first. The catalog notebook extracts metadata from semantic models and writes it to a Lakehouse, the similarity notebook scores and persists model pairs, and the results notebook reads those persisted outputs into a separate interactive review app.

## Workflow

Run the notebooks in this order:

1. [001_semantic_model_tom_catalog.ipynb](notebooks/001_semantic_model_tom_catalog.ipynb)
2. [002_semantic_model_similarity.ipynb](notebooks/002_semantic_model_similarity.ipynb)
3. [003_semantic_model_similarity_results.ipynb](notebooks/003_semantic_model_similarity_results.ipynb)

### 1. Catalog semantic model metadata

The catalog notebook uses Semantic Link Labs and TOM to read the semantic model metadata through the notebook user’s Fabric identity. It discovers visible workspaces and semantic models, opens read-only TOM sessions, and extracts:

- semantic model properties
- data sources
- tables
- columns
- measures and DAX expressions
- relationships
- model/workspace errors
- direct Power BI report-to-model bindings, including visible cross-workspace reports
- report workspace scan status, scope, and snapshot timestamp

The notebook writes these Delta tables to the attached Lakehouse:

- `semantic_models`
- `semantic_model_datasources`
- `semantic_model_tables`
- `semantic_model_columns`
- `semantic_model_relationships`
- `semantic_model_measures`
- `semantic_model_catalog_errors`
- `semantic_model_report_dependencies`
- `semantic_model_report_scan`

The catalog supports optional exact filters through `WORKSPACE_NAME` and `MODEL_NAME`. Report discovery is independent: `REPORT_WORKSPACE_NAME = None` scans the report workspaces visible to the notebook identity, even when model discovery is filtered. Set it to an exact workspace name to restrict report scanning. Cross-workspace dependents outside that report scope cannot be discovered.

The report inventory uses [Power BI Reports - Get Reports In Group](https://learn.microsoft.com/en-us/rest/api/power-bi/reports/get-reports-in-group). Bindings use `datasetId`, never model names. Reports with missing model IDs, unsupported report types (including paginated reports), or models outside the catalog remain explicit inventory rows. Missing IDs and unsupported report types make coverage partial; an out-of-catalog model ID remains an observed binding, but its model workspace is unknown.

Each report row includes the report ID, name, workspace, generated report URL, bound model ID, available model/workspace context, binding status, cross-workspace flag, `scan_id`, and `scanned_at`. Scan rows record counts and `complete`, `partial`, or `failed` status for each report workspace. Discovery failures also create a failed scan row. Only sanitized exception types are stored for report scans.

These two report tables are **current snapshots**, always overwritten, including when empty. They do not implement historical change tracking, usage analytics, transitive model lineage, field-level dependencies, report rebinding, or a safety recommendation to retire a model. All counts are limited to the caller's visible, selected scope, not a tenant-wide guarantee.

### 2. Score model similarity and containment

The similarity notebook reads the catalog tables and builds a normalized signature for each semantic model. It then:

- builds candidate pairs
- computes structural Jaccard overlap for tables, columns, measures, relationships, and data sources
- measures DAX/name similarity with a local TF-IDF vectorizer
- blends the signals into a weighted, symmetric **composite similarity score** ("how alike are these two models overall?")
- computes a directional **containment score** ("does one model contain everything in the other?") from exact table, column, measure-definition, relationship, and data-source coverage
- classifies pairs as `duplicate`, `similar`, or `distinct`, and labels each containment relationship as `equivalent`, `model_a_contains_model_b`, `model_b_contains_model_a`, or `partial_overlap`
- groups duplicate-tier pairs into connected clusters
- writes the results back to the Lakehouse

The output tables are:

- `semantic_model_signatures`
- `semantic_model_similarity_pairs` (carries both `composite_score` and `containment_score`, the directional `model_a_in_model_b` / `model_b_in_model_a` coverages, and `containment_relationship`)
- `semantic_model_duplicate_clusters`
- `semantic_model_similarity_run` (thresholds, blocking flag, weight dictionaries serialized as JSON, timestamp, and counts)

Report dependencies are impact context only. They do not affect candidate blocking, similarity weights, containment, or duplicate clustering.

### 3. Review results in the interactive app

The results notebook keeps presentation separate from scoring. Its custom, dependency-free `displayHTML(...)` renderer loads the persisted Delta tables and provides four visible views:

- **Review** - finding-first summaries of **Possible duplicates**, **Model coverage**, and **Shared structure**, with named score directions and an expandable **Score breakdown**
- **Groups** - models linked by possible-duplicate pairs; not every pair within a group is equally similar
- **Compare** - overall similarity, both named coverage directions, and cataloged differences, with separate formula-text and report evidence
- **Similarity map** - overall-similarity percentages for all cataloged models; low similarity does not rule out high model coverage

The standalone **Reports** tab is temporarily omitted from navigation. Report collection, per-model counts in Review and Groups, and the **Dependent reports** section in Compare remain available. The report inventory renderer is retained for later use.

**Overall similarity** is the existing composite score: a weighted comparison of both complete models. **Coverage score: A within B** asks how much of A's cataloged definitions is represented in B. Extra content in B can lower overall similarity without lowering coverage of A. A 97.5% coverage score and 43.5% overall similarity therefore answer different questions; neither is a confidence rating or a percentage of all objects or data values.

The score breakdown separates the two named coverage directions from the six overall-similarity contributors. Table-name, column-name, measure-name, relationship-link, and source-definition overlap compare shared unique entries with all unique entries across both models. DAX text similarity is TF-IDF text resemblance, not a count of matching formulas. Models without measures use structural or model names as a text fallback, labeled **Model text similarity**. Coverage instead includes normalized measure-name/formula-text matches and excludes signal categories absent from the source before rescaling the remaining weights. Per-signal coverage contributions are not saved, so cataloged difference counts cannot explain an exact weighted score gap.

The six similarity contributors use compact tiles with percentage bars on a common 0%-100% scale. Bars represent the displayed signal value, not its weight or contribution to the overall score. Unavailable signals show a labeled dashed track without a numeric meter. Coverage remains in its separately named directional section; it is not an extra contributor to overall similarity.

Matches do not verify data values, calculation results, security, refresh behavior, or replacement safety. The interface describes candidates for review rather than asserting equivalence. **Almost all** is reserved for coverage of at least 95%, independently of a lower user cutoff. When both directions meet the active cutoff, both scores are named; missing directions remain explicitly unavailable.

Review and Groups include per-model report counts. Compare includes a separate **Dependent reports** section without changing structural difference counts. Missing, inaccessible, or inconsistent dependency snapshots show **Report dependencies unknown**. Partial scans show **known linked reports (scan incomplete)**, or **No linked reports found (scan incomplete)**. A verified empty snapshot shows **0 linked reports in scanned scope**. Zero observed direct links does not prove a model is unused or that no dependencies exist outside the visible, selected scope. Scan IDs and per-workspace counts are checked before using dependency rows; the report snapshot timestamp is distinct from the view generation time.

**Review thresholds** displays percentage cutoffs while retaining fractional score values internally. Applying a cutoff reclassifies existing scores, including one-way versus two-way coverage wording; it does not recalculate similarity or recover pairs omitted by blocking. Each candidate appears once, with possible duplicates taking priority over model coverage, then shared structure. Scoring algorithms, weights, and default thresholds are unchanged.

The results notebook keeps all preparation and renderer definitions together in one hidden-input cell (Cell 2), followed by the visible `render_results()` call (Cell 3). The UI output remains visible. This is a presentation change only: data preparation still happens in the results notebook and the three-notebook running order is unchanged.

## Requirements

This workflow expects:

- a Microsoft Fabric notebook runtime
- permissions to read the target semantic models and workspaces
- an attached Lakehouse
- the following Python packages in the notebook environment:
  - `semantic-link-labs`
  - `pandas`
  - `scikit-learn`

The notebook code performs read-only metadata extraction, but the notebook identity must still be allowed to read the semantic model metadata.

Report listing requires report read access and the appropriate API authorization (`Report.Read.All` or `Report.ReadWrite.All`); the notebook uses its existing Semantic Link identity. It does not request permissions, use tenant-admin report scans, or acquire/store credentials itself. Running the catalog/scoring notebooks **does write** their output Delta tables and may execute the catalog's existing package-install cell. Those operations are separate from read-only metadata inspection.

## Configuration settings

The catalog and scoring notebooks have a **Configuration** cell near the top. All three notebooks use the **lakehouse attached to the notebook**, so attach the same target Lakehouse before running — there is no database name to set.

The catalog notebook exposes the scan scope and write mode:

```python
WORKSPACE_NAME = None   # Optional exact workspace-name filter.
MODEL_NAME = None       # Optional exact model-name filter.
REPORT_WORKSPACE_NAME = None  # Independent report-workspace filter; None includes visible workspaces.
WRITE_MODE = "overwrite"
```

Catalog and scoring outputs have explicit schemas, so empty results are written instead of leaving stale rows behind in overwrite mode. Reads use registered table names (`spark.table`) to match `saveAsTable`, without assuming a physical `Tables/<name>` directory. Keep the attached lakehouse and default schema consistent across all three notebooks. Report snapshots always overwrite, even if legacy catalog/scoring outputs use `append`; historical append behavior is not a supported current-results workflow.

The similarity notebook exposes the following scoring settings:

```python
WRITE_MODE = "overwrite"
ENABLE_BLOCKING = True
DUPLICATE_THRESHOLD = 0.95
SIMILAR_THRESHOLD = 0.70
CONTAINMENT_THRESHOLD = 0.95            # Directional coverage at/above this flags a containment candidate.

SIMILARITY_WEIGHTS = {
    "tables": 0.15,
    "columns": 0.20,
    "measure_names": 0.15,
    "measure_dax_embedding": 0.25,
    "relationships": 0.15,
    "datasources": 0.10,
}

# Containment uses exact measure definitions (name + DAX) instead of the TF-IDF
# embedding, because cosine similarity is symmetric and cannot prove a subset.
CONTAINMENT_WEIGHTS = {
    "tables": 0.15,
    "columns": 0.20,
    "measure_names": 0.15,
    "measure_definitions": 0.25,
    "relationships": 0.15,
    "datasources": 0.10,
}
```

`ENABLE_BLOCKING` keeps comparisons focused on model pairs that share at least one normalized table or measure name; disabling it performs a full pairwise comparison across every model in the catalog and is more expensive for large catalogs.

## Typical usage

1. Attach your target Lakehouse to all three notebooks.
2. Open the catalog notebook and review the Configuration cell (write mode; optional `WORKSPACE_NAME` / `MODEL_NAME` filters).
3. Run the notebook to populate the catalog tables.
4. Open the similarity notebook (attached to the same Lakehouse) and review its Configuration cell.
5. Run the notebook.
6. Open the results notebook, attach the same Lakehouse, and run it.
7. Work through **Review**, **Groups**, **Compare**, and **Similarity map**. Check report scan scope, timestamp, and failures before interpreting impact counts.

## Notes

- This project is focused on semantic-model analysis and duplicate detection, not on Fabric workspace provisioning or general data engineering setup.
- The similarity logic is deterministic and local to the notebook environment; it does not rely on external embedding services or an external ML endpoint.
- The results experience is a self-contained Fabric `displayHTML(...)` app with no external web dependencies.
- The composite similarity score is symmetric, while the containment score is directional: a pair can have only moderate similarity yet high containment when a small model is fully absorbed by a much larger one.

The Similarity map lists all catalog models. A numeric cell is the overall-similarity score, displayed as a rounded whole percentage, and can be opened in Compare for the one-decimal score. **Not scored** means the pair is absent from the persisted pair table, commonly because blocking excluded it before scoring, and must not be interpreted as a score of zero. A scored zero remains a distinct, valid result. **Unavailable (?)** means a saved pair has a missing or invalid overall-similarity value.

### A.10 Interpretation and limitations

Similarity and containment are metadata-based. They do not compare report layouts, visual configurations, row-level data, refresh history, security roles, or business meaning outside the captured metadata. The composite score is symmetric ("how alike overall?"); the containment score is directional ("is one model a subset of the other?").

Results depend on:

- The completeness and freshness of the TOM catalog.
- Name consistency across models.
- The configured signal weights.
- The blocking setting.
- The lexical behavior of TF-IDF tokenization.
- The selected duplicate, similar, and containment thresholds.

Thresholds and weights should be calibrated against known model pairs before using the output as a governance or consolidation decision.
