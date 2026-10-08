# Changelog

Release notes for Semantic Model Similarity only. A section records the intended
release contents; publication status is shown on GitHub Releases, not inferred
from its presence here.

## [Unreleased]

### Changed

- Tag notebook 001's **Configuration** cell as the Fabric parameters cell and
  move `ENABLE_BLOCKING`, `DUPLICATE_THRESHOLD`, `SIMILAR_THRESHOLD` and
  `CONTAINMENT_THRESHOLD` into it, so pipeline and job API runs can override
  them. Defaults and scoring are unchanged.
- Treat blank filter names as unfiltered and validate injected filters, flags
  and thresholds before collection.

## [0.2.0]

### Changed

- Consolidate catalog collection and similarity scoring into notebook 001, and
  renumber the results viewer to 002. Use both notebooks together; the fourteen
  Delta table contracts, scoring defaults and persisted schema versions are unchanged.
- Collect model and report scopes once per workspace, resolving cross-workspace
  report bindings after the complete model catalog is available.
- Replace narrative results cards with compact analytical views: a filterable,
  sortable pair table, group/member drill-down, explicit map slices, and a concise
  comparison summary. Keep methodology in one on-demand definitions panel.
- Use Fabric-logo teal accents on neutral light/dark surfaces, with opaque
  row highlights that retain text contrast inside the Fabric notebook host.
- Default to all-workspace comparisons with one shared scope for Review, Groups,
  and the map. Rebuild groups and their highest-pair scores from eligible links;
  retain manual comparison and label excluded map cells separately.
- Label the existing combined score **Overall** throughout the results UI, without
  renaming stored fields or changing score calculations.

### Added

- Opt-in temporary Member access for a process-dedicated security group across
  selected model and report workspaces, without a routine pre-grant lookup.
- Per-workspace cleanup verification, bounded read/cleanup retries and durable
  Lakehouse Files journals with explicit interrupted-run recovery.
- Offline tests for access failure paths, report scope, schema/scoring parity
  and the two-notebook release inventory. Live Fabric validation remains separate.
- Renderer state/scale tests and a native-browser smoke check covering both themes,
  responsive layouts, keyboard interactions, screenshots, and visible data states.

### Fixed

- Render the report-scan warning as a straight bar rather than a rounded crescent.
- Expand Review rows inline to show schema-similarity indicators; reserve the
  end-of-row arrow for the detailed comparison.
- Stop results output from growing continuously inside Fabric's auto-sized iframe.
- Keep scan details within the visible notebook area with internal scrolling, and
  reveal the selected pair when returning from Compare in an embedded output.
- Keep table text readable under Fabric's light host-row styles in dark mode, and
  explicitly align Review and Groups headers with their left-aligned cell text.

## [0.1.0]

### Added

- Three-notebook workflow for cataloging semantic models, calculating similarity,
  and reviewing persisted results in Microsoft Fabric.
- Separate schema, security, and combined similarity scores, with directional
  schema containment and possible-duplicate groups.
- Security definition comparison covering RLS, table OLS, column OLS, and
  relationship propagation, with explicit warnings for differences or unavailable
  metadata.
- Direct report-dependency inventory and scan-coverage context for model reviews.
- Review, Groups, Compare, and Similarity map views, plus documentation with
  synthetic-data screenshots.
- Independently versioned similarity downloads and a manually initiated,
  validated draft-release workflow.

### Compatibility And Limitations

- Initial preview. Use all three notebooks from the same release and attach them
  to the same test Lakehouse before running them in order.
- Persisted contracts are `score_version=2` and `security_schema_version=1`;
  these are independent of the public release version.
- Catalog and scoring runs replace their output Delta tables. There is no
  historical run selection or retention in this preview.
- Similarity is metadata evidence, not proof of matching data, effective access,
  security enforcement, or safe model retirement. Report discovery is limited
  to the notebook identity's visible, selected scope.
- GitHub validation checks file format, Python syntax, portability, documentation
  links, and package integrity. It does not execute the Fabric workflow.