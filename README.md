# Semantic Model Analysis

A collection of Microsoft Fabric notebook projects for analyzing Power BI / Fabric semantic models — cataloging their metadata and turning it into governance-ready insight.

Each project lives in its own subfolder and is self-contained. Add new analyses as sibling folders alongside the existing ones.

## Projects

| Project | Description |
| --- | --- |
| [`similarity/`](similarity/) | Catalogs semantic models, scores structural/text **similarity** and directional **containment**, and highlights duplicates, near-duplicates, and subset relationships. See its [README](similarity/README.md). |

## Repository layout

```text
.
├── README.md          # this file — the collection overview
├── .gitignore
└── similarity/        # semantic model similarity & containment analysis
    ├── README.md
    ├── README.marketing.md
    └── notebooks/
```

## Adding a new project

1. Create a new top-level folder (for example `lineage/` or `usage/`).
2. Add a project `README.md` describing what it does and how to run it.
3. Add a row to the **Projects** table above.
