# Semantic Model Similarity

Find duplicate and near-duplicate Microsoft Fabric semantic models before they become a governance problem.

This project helps BI and data teams quickly compare semantic models by scanning their metadata and highlighting where models overlap structurally and textually. It is built for Fabric notebook users who want a practical, analyst-friendly way to spot model redundancy, drift, and consolidation opportunities.

## Why it matters

As semantic models grow across teams, workspaces, and business domains, duplicate models often appear in different forms:

- same business logic implemented more than once
- copy-and-paste versions of an existing model
- legacy models that were rebuilt without visibility into prior work
- overlapping data marts or analysis layers that should be consolidated

This project gives you a fast way to surface those patterns using the metadata already available in Fabric.

## What the solution does

The workflow is intentionally simple:

1. Catalog semantic model metadata from Fabric using Semantic Link Labs and TOM.
2. Normalize each model into a signature built from tables, columns, measures, relationships, and data sources.
3. Score pairwise similarity using a weighted mix of structural overlap and DAX/name text similarity.
4. Score directional containment to detect when one model contains everything in another, plus more.
5. Flag likely duplicates, near-duplicates, and subset relationships.
6. Group duplicate relationships into clusters.
7. Visualize the results in notebook heatmap and ranking tables.

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

The project has two notebook stages:

### 1. Catalog the model metadata

The catalog notebook connects to Fabric semantic models through read-only TOM access and extracts:

- model metadata
- data sources
- tables
- columns
- measures and DAX expressions
- relationships
- workspace/model errors

This data is written to Lakehouse Delta tables so it can be analyzed and reused.

### 2. Score model similarity and containment

The similarity notebook reads the catalog, builds a signature per model, and computes:

- structural overlap across metadata objects
- name and DAX similarity using TF-IDF
- a blended, symmetric composite similarity score ("how alike are these models overall?")
- a directional containment score ("does one model contain everything in the other?")
- duplicate / similar / distinct classification, plus a containment relationship (equivalent, contains, or partial overlap)
- connected duplicate clusters
- interactive visual similarity outputs

## Outputs you can review

The notebook produces a clear set of results for review:

- ranked similar model pairs
- ranked containment candidates (subset / superset relationships)
- duplicate clusters
- per-model signature summaries
- all-model similarity matrix
- interactive similarity heatmap

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

1. Run the catalog notebook to populate metadata tables.
2. Review the model inventory and confirm the result set is complete.
3. Run the similarity notebook to score model overlap.
4. Review the flagged pairs and duplicate clusters.
5. Use the results to guide consolidation, cleanup, or governance follow-up.

## A practical value statement

This project turns a difficult metadata problem into a clear review process: instead of manually comparing models table by table, you get a structured view of which models are likely duplicates or near-duplicates, and which models fully contain others.

That makes it easier to reduce sprawl, improve model hygiene, and keep your Fabric estate more maintainable.

## Important note

This is a metadata-driven similarity solution. It helps identify likely overlap based on model structure and DAX/text patterns, but it does not replace a full business review or a complete semantic design assessment.
