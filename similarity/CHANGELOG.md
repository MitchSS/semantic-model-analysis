# Changelog

Release notes for Semantic Model Similarity only. A section records the intended
release contents; publication status is shown on GitHub Releases, not inferred
from its presence here.

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