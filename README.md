# Semantic Model Analysis

A collection of Microsoft Fabric notebook projects for analyzing Power BI / Fabric semantic models — cataloging their metadata and turning it into governance-ready insight.

Each project lives in its own subfolder and is self-contained. Add new analyses as sibling folders alongside the existing ones.

## Projects

| Project | Description |
| --- | --- |
| [`similarity/`](similarity/) | Uses a three-notebook flow to catalog semantic models, security definitions, and direct report dependencies; calculate **schema**, **security**, and **combined similarity** plus directional schema **containment**; and review candidates with security warnings and report-impact evidence. See its [README](similarity/README.md). |

## Repository layout

```text
.
├── README.md          # this file — the collection overview
├── .gitignore
├── .github/           # scoped validation and manual draft-release workflows
└── similarity/        # semantic model similarity & containment analysis
    ├── README.md
    ├── README.marketing.md
    └── notebooks/     # catalog, scoring, and interactive results notebooks
```

## Releases

Projects are versioned and released independently. Similarity uses tags such as
`similarity/v0.1.0` and a manual **Prepare Similarity Release** GitHub Action.
Merging to `main` runs checks but does not create or publish a release. See the
[similarity release guide](similarity/RELEASING.md) and
[project changelog](similarity/CHANGELOG.md).

All projects share GitHub's repository Releases page. Download the attached
project-specific ZIP for just that project; GitHub's automatic source ZIP and
tarball contain the entire tagged repository. A similarity release does not
version or package sibling projects.

## Adding a new project

1. Create a new top-level folder (for example `lineage/` or `usage/`).
2. Add a project `README.md` describing what it does and how to run it.
3. Add a row to the **Projects** table above.
4. Give it its own release workflow and tag namespace when needed; do not add it
    to the similarity release package or couple its version to similarity.
