# Semantic Model Similarity

Find possible duplicates and overlapping Microsoft Fabric semantic models. Three notebooks catalog metadata, score model similarity and schema coverage, and present candidates for review with security differences and linked-report context.

![Desktop Review view showing six synthetic models and a possible duplicate with 100% schema, 0% security, and 95% combined similarity](docs/images/review-desktop.png)

*Review highlights security differences alongside possible duplicates. Screenshot uses synthetic demo data.*

## Requirements

- A Microsoft Fabric notebook runtime and a Lakehouse in your workspace (new or existing).
- Permission to read the target workspaces, semantic models, and **complete security metadata**. Report discovery also needs [report read access and API authorization](docs/reference.md#report-dependencies).
- Python packages: `semantic-link-labs`, `pandas`, `scikit-learn`, and `scipy`.

**Output behavior:** source models and reports are not changed, but catalog and scoring runs **replace their output Delta tables**, including when results are empty. There is no run history. Security definitions may contain sensitive values; restrict access to the output Lakehouse and notebook results.

## Quick start

1. Download the `semantic-model-similarity-vVERSION.zip` asset and its SHA-256 checksum from [Releases](https://github.com/MitchSS/semantic-model-analysis/releases). Extract it and import all three notebooks from `similarity/notebooks/` into Fabric. Use notebooks from the same release; GitHub's automatic source archives contain the whole repository.
2. Attach the **same Lakehouse as the default Lakehouse for all three notebooks**, keeping the default schema consistent.
3. Review the catalog notebook's **Configuration** cell. `WORKSPACE_NAME` and `MODEL_NAME` accept exact names; `None` leaves that scope unfiltered. `REPORT_WORKSPACE_NAME` independently controls report discovery, so filtering models does not restrict report scanning. Scoring defaults and optional overrides are in the [configuration reference](docs/reference.md#configuration).

Run the notebooks in order, with the catalog run interactively in Fabric:

| Notebook | Purpose |
| --- | --- |
| [001_semantic_model_tom_catalog.ipynb](notebooks/001_semantic_model_tom_catalog.ipynb) | Collect model metadata, security definitions, and direct report bindings. |
| [002_semantic_model_similarity.ipynb](notebooks/002_semantic_model_similarity.ipynb) | Score model pairs and identify duplicate groups and schema coverage. |
| [003_semantic_model_similarity_results.ipynb](notebooks/003_semantic_model_similarity_results.ipynb) | Open the interactive results app. |

Check catalog errors and security/report scan completeness before interpreting results. After upgrading notebooks or changing model security, rerun **001 -> 002 -> 003**.

## Understanding results

Start in **Review**, explore related candidates in **Groups**, inspect a pair in **Compare**, or browse the **Similarity map**.

| Score | Meaning |
| --- | --- |
| **Schema similarity** | Structural and text overlap across model definitions. |
| **Security similarity** | Similarity of security rules, not user access or security strength. |
| **Combined similarity** | Overall score: normally 95% schema plus 5% security. |
| **Schema coverage** | How much of one model's schema is represented in another. Directional and separate from security. |

When both complete scans find no roles, combined equals schema similarity. Incomplete security metadata makes the combined score unavailable. **Not scored** pairs, commonly excluded by candidate blocking, are not zero-score matches.

**A possible duplicate is a review candidate, not a replacement recommendation.** At the default 95% duplicate cutoff, 100% schema plus 0% security still qualifies with a 95% combined score. Always inspect security warnings.

Matches do not verify data values, calculation correctness, role assignments, or effective user access. Report counts cover only the visible, scanned scope; zero linked reports does not prove a model is unused. Calibrate thresholds against known model pairs before making consolidation decisions.

## Further reading

- [Technical reference](docs/reference.md): output tables, algorithms, configuration, view details, more screenshots, and limitations.
- [Product overview](README.marketing.md): what the project does and who it helps.
- [Changelog](CHANGELOG.md).
