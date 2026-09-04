# Semantic Model Similarity

This project catalogs Microsoft Fabric semantic models, measures their structural/text similarity and directional containment, and highlights duplicates, near-duplicates, and subset relationships in a notebook workflow.

## What this repo contains

```text
.
├── README.md
└── notebooks/
    ├── semantic_model_tom_catalog.ipynb
    ├── semantic_model_similarity.ipynb
    └── semantic_model_similarity_results.ipynb
```

The repository is intentionally notebook-first. The catalog notebook extracts metadata from semantic models and writes it to a Lakehouse, the similarity notebook scores and persists model pairs, and the results notebook reads those persisted outputs into a separate interactive review app.

## Workflow

Run the notebooks in this order:

1. `semantic_model_tom_catalog.ipynb`
2. `semantic_model_similarity.ipynb`
3. `semantic_model_similarity_results.ipynb`

### 1. Catalog semantic model metadata

The catalog notebook uses Semantic Link Labs and TOM to read the semantic model metadata through the notebook user’s Fabric identity. It discovers visible workspaces and semantic models, opens read-only TOM sessions, and extracts:

- semantic model properties
- data sources
- tables
- columns
- measures and DAX expressions
- relationships
- model/workspace errors

The notebook writes these Delta tables to the attached Lakehouse:

- `semantic_models`
- `semantic_model_datasources`
- `semantic_model_tables`
- `semantic_model_columns`
- `semantic_model_relationships`
- `semantic_model_measures`
- `semantic_model_catalog_errors`

The catalog supports optional exact filters through `WORKSPACE_NAME` and `MODEL_NAME`.

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

### 3. Review results in the interactive app

The results notebook keeps presentation separate from scoring. Its custom, dependency-free `displayHTML(...)` renderer loads the persisted Delta tables and provides four stable views:

- **Review** — summary statistics and one ranked, deduplicated queue of likely duplicates, subset/superset relationships, and high-overlap pairs
- **Groups** — connected components of likely-duplicate pairs, with strongest-pair defaults and selectable member comparisons
- **Compare** — summary-first structural differences with progressive detail and subordinate DAX evidence
- **Similarity map** — an all-model matrix whose scored cells open Compare

The app can reclassify already-scored pairs with draft thresholds, but it does not recalculate similarity or recover pairs omitted by blocking.

## Requirements

This workflow expects:

- a Microsoft Fabric notebook runtime
- permissions to read the target semantic models and workspaces
- an attached Lakehouse
- the following Python packages in the notebook environment:
  - `semantic-link-labs`
  - `pandas`
  - `scikit-learn`
  - `plotly`
  - `scipy`

The notebook code performs read-only metadata extraction, but the notebook identity must still be allowed to read the semantic model metadata.

## Configuration settings

The catalog and scoring notebooks have a **Configuration** cell near the top. All three notebooks use the **lakehouse attached to the notebook**, so attach the same target Lakehouse before running — there is no database name to set.

The catalog notebook exposes the scan scope and write mode:

```python
WORKSPACE_NAME = None   # Optional exact workspace-name filter.
MODEL_NAME = None       # Optional exact model-name filter.
WRITE_MODE = "overwrite"
```

The similarity notebook exposes the scoring and report knobs:

```python
WRITE_MODE = "overwrite"
ENABLE_BLOCKING = True
DUPLICATE_THRESHOLD = 0.95
SIMILAR_THRESHOLD = 0.70
CONTAINMENT_THRESHOLD = 0.95            # Directional coverage at/above this flags a containment candidate.
TOP_N = 20                             # Rows shown in the ranked pair table.
HEATMAP_MIN_SCORE = SIMILAR_THRESHOLD  # Hide heatmap cells below this composite score.

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

1. Attach your target Lakehouse to both notebooks.
2. Open the catalog notebook and review the Configuration cell (write mode; optional `WORKSPACE_NAME` / `MODEL_NAME` filters).
3. Run the notebook to populate the catalog tables.
4. Open the similarity notebook (attached to the same Lakehouse) and review its Configuration cell.
5. Run the notebook.
6. Open the results notebook, attach the same Lakehouse, and run it.
7. Work through **Review**, **Groups**, **Compare**, and **Similarity map**.

## Notes

- This project is focused on semantic-model analysis and duplicate detection, not on Fabric workspace provisioning or general data engineering setup.
- The similarity logic is deterministic and local to the notebook environment; it does not rely on external embedding services or an external ML endpoint.
- The results experience is a self-contained Fabric `displayHTML(...)` app with no external web dependencies.
- The composite similarity score is symmetric, while the containment score is directional: a pair can have only moderate similarity yet high containment when a small model is fully absorbed by a much larger one.

The Similarity map lists all catalog models. A numeric cell is a scored composite result and can be opened in Compare. **Not scored** means the pair is absent from the persisted pair table—commonly because blocking excluded it before scoring—and must not be interpreted as a score of zero. A scored zero remains a distinct, valid result.

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
