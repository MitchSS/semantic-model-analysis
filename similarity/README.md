# Semantic Model Similarity

Find possible duplicates and overlapping Microsoft Fabric semantic models. Two notebooks collect and score metadata, then present candidates for review with security differences and linked-report context.

![Desktop Review view showing six synthetic models and a possible duplicate with 100% schema, 0% security, and 95% combined similarity](docs/images/review-desktop.png)

*Review ranks candidate pairs in aligned score columns, with security differences kept visible. Synthetic demo data is shown with cross-workspace scope switched off.*

## Requirements

- A Microsoft Fabric notebook runtime and a Lakehouse in your workspace (new or existing).
- Permission to read the target workspaces, semantic models, and **complete security metadata**. Report discovery also needs [report read access and API authorization](docs/reference.md#report-dependencies).
- Python packages: `semantic-link-labs`, `pandas`, `scikit-learn`, and `scipy`.
- Optional temporary access: a Fabric administrator with `Tenant.ReadWrite.All` who already belongs to a dedicated security group. The group must have no permanent workspace assignments or overlapping process runs. See [temporary workspace access](docs/reference.md#temporary-workspace-access).

**Output behavior:** source models and reports are not changed. Catalog and scoring writes **replace their output Delta tables**, including typed empty results. If the catalog contains no readable models, scoring stops without producing new scores. There is no analytical run history. Optional temporary access changes the group's workspace role assignments and records separate recovery journals in Lakehouse Files. Security definitions may contain sensitive values; restrict access to the output Lakehouse and notebook results.

## Quick start

1. Download the `semantic-model-similarity-vVERSION.zip` asset and its SHA-256 checksum from [Releases](https://github.com/MitchSS/semantic-model-analysis/releases). Extract it and import both notebooks from `similarity/notebooks/` into Fabric. Use notebooks from the same release; GitHub's automatic source archives contain the whole repository. The two-notebook layout replaces the earlier three-notebook layout; do not mix them.
2. Attach the **same Lakehouse as the default Lakehouse for both notebooks**, keeping the default schema consistent.
3. Review notebook 001's **Configuration** and **Scoring Parameters** cells. `WORKSPACE_NAME` and `MODEL_NAME` accept exact names; `None` leaves that scope unfiltered. `REPORT_WORKSPACE_NAME` independently controls report discovery, so filtering models does not restrict report scanning. Scoring defaults and optional overrides are in the [configuration reference](docs/reference.md#configuration).
4. Leave temporary access off to use existing permissions. To scan otherwise inaccessible workspaces, set `ENABLE_TEMPORARY_WORKSPACE_ACCESS = True` and `ACCESS_SECURITY_GROUP_ID` to the dedicated group's object UUID. With no workspace filters, this can grant Member access to that group in every active regular workspace in the tenant, including report-only workspaces.

Run the notebooks in order, with notebook 001 run interactively in Fabric:

| Notebook | Purpose |
| --- | --- |
| [001_semantic_model_similarity.ipynb](notebooks/001_semantic_model_similarity.ipynb) | Collect and persist model/security/report metadata, then score pairs, duplicate groups and schema coverage. |
| [002_semantic_model_similarity_results.ipynb](notebooks/002_semantic_model_similarity_results.ipynb) | Open the interactive results app. |

Check catalog errors and security/report scan completeness before interpreting results. Temporary assignments are removed and checked per workspace before scoring; failed cleanup stops the run. After upgrading notebooks or changing model security, rerun **001 -> 002**. Do not interpret earlier score tables as a new successful run after collection or scoring fails.

## Understanding results

Start in **Review** with catalog context and a searchable, sortable pair table. **Cross-workspace only** starts off, so same-workspace comparisons are included. Enable it to restrict Review, Groups, and the Similarity map to cross-workspace pairs. The **Overall** score is the existing combined schema/security score; its calculation is unchanged. Finding, workspace, and security filters refine the Review table; clearing them preserves the shared scope. Candidate and group totals follow that scope, while the catalog-model count does not change.

**Groups** connects qualifying pairs within the selected scope, so no groups can be a valid cross-workspace result even when same-workspace duplicates exist. The map labels excluded cells **Outside scope** rather than treating them as unscored or zero. Manual **Compare** can still inspect any selected pair. Back navigation restores the source view and selection.

Compare keeps all three scores and both coverage directions visible, with formula text, security rules, report links, and score breakdowns available on demand. The **?** control holds definitions and scan details; incomplete evidence stays visible as a concise status, not hidden in Help.

Select a Review row to expand its table, column, measure, text, relationship, and source similarity indicators. Select it again to collapse them. Only the arrow at the end of the row opens the detailed comparison.

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
