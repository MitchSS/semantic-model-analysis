# Releasing Semantic Model Similarity

Releases are deliberate snapshots of `main`. Merging a PR runs scoped checks;
it does not create a tag, draft, or published release. There is one release entry
point: **Actions > Prepare Similarity Release > Run workflow**.

## Before The First Release

- Merge the release tooling into `main`, the repository's default branch, so the
  manual workflow appears in Actions. Do not dispatch it from `develop` or a tag.
- GitHub Actions must be enabled and allowed to use the pinned checkout, Python,
  and artifact actions. The publishing job requires `contents: write` through
  the built-in `GITHUB_TOKEN`; no personal access token or Fabric secret is needed.
- Repository or organization policies must permit that job to create
  `similarity/v*` tags and draft releases. The workflow does not change policies.
- The path-filtered **Similarity CI** workflow is not a suitable globally required
  check for all future projects: unrelated PRs can leave a filtered check pending.
  Configure an always-present conditional gate first if global branch protection
  is desired. No branch-protection changes are part of this setup.

## Prepare And Publish

1. Prepare similarity changes and a nonempty `## [0.1.0]` section in
   [CHANGELOG.md](CHANGELOG.md) for the first release. For later releases, add a
   section with the intended version. Keep notes specific to this project; do not
   claim a publication date or successful Fabric test that has not happened.
2. Open the PR to `main`, pass **Similarity CI**, review, and merge. Several merges
   can form one release.
3. Open **Actions > Prepare Similarity Release > Run workflow**. Select `main`,
   enter **Version** `0.1.0`, and leave **Prerelease** checked for the first preview.
4. The workflow pins the dispatch's exact commit, validates the notebooks, notes,
   and archive, and checks for an existing similarity tag or release (including
   drafts). Only then does it create the fixed tag `similarity/v0.1.0` and a draft
   titled **Similarity 0.1.0**. A later movement of `main` cannot change this source.
5. Follow the draft URL in the workflow summary. Review the notes, source SHA,
   prerelease setting, and both attached files. Download
   `semantic-model-similarity-v0.1.0.zip` and its `.zip.sha256` companion.
6. Complete the Fabric smoke checklist below against the downloaded notebooks.
   A successful Actions run alone is not a runtime certification.
7. Publish the reviewed draft as a **prerelease**. Confirm its tag still identifies
   the recorded source SHA. The workflow never publishes automatically and never
   sets a release as the repository-wide **Latest**.

## Versions

The workflow input is the version source of truth. There is no separate version
file, automatic version bump, or commit-message convention to maintain. The input
must be numeric `MAJOR.MINOR.PATCH`, without a leading `v`, leading zeroes, suffix,
or build metadata. Its changelog section must exist exactly once and contain notes.

Use `0.1.0` for the initial preview, `0.1.1` for fixes, and `0.2.0` for the next
feature iteration. Move to `1.0.0` when the supported configuration and persisted
output compatibility contract are ready to be stable. After that, use patch for
fixes, minor for backward-compatible features, and major for breaking changes.
Describe any output migration or required notebook rerun in the release notes.

**Prerelease** is an explicit GitHub flag; GitHub does not infer it from a `0.x`
version. Internal `score_version` and `security_schema_version` are independent
data contracts and are not changed by preparing a release.

## Package Boundary

The custom ZIP contains only the three notebooks, this guide, the two project
READMEs, the changelog, and the four documented screenshot images. It retains
the `similarity/` directory so documentation links work after extraction. Every
entry comes from the pinned Git tree, not uncommitted local files. Changing the
distribution requires deliberately updating the release helper's allowlist.

Sibling projects, repository settings, release tooling, local previews, browser
profiles, caches, and output data are not included. Notebook sources and useful
metadata, including hidden input, are preserved; saved outputs and environment
bindings fail validation rather than being silently stripped.

GitHub releases and tags still belong to the repository. All projects share the
Releases page and subscriptions. GitHub's automatic **Source code (zip/tar.gz)**
downloads contain the whole repository; use the named similarity ZIP instead.
Future projects can have independent tag namespaces and release schedules. Do not
use the repository's `/releases/latest` URL as a similarity-specific download.

## Fabric Smoke Checklist

- Verify the ZIP's SHA-256 digest against its companion file. For example, use
  `Get-FileHash -Algorithm SHA256` in PowerShell or `sha256sum -c` on Linux.
- Import all three downloaded notebooks into an approved test workspace. Attach
  the same test Lakehouse to each and review the configuration and prerequisites
  in [README.md](README.md). Do not overwrite production snapshots for this check.
- Run 001 interactively with a deliberately limited, known model/report scope,
  then 002, then 003. The catalog can install packages, and catalog/scoring runs
  replace output Delta tables. Use an identity authorized for the test scope.
- Check expected catalog and analysis outputs and confirm that Review, Groups,
  Compare, and Similarity map render. Verify expected security warnings and
  report-scan completeness against known test models.
- Record the source SHA, test scope, outcome, and remaining limitations in the
  draft notes before publishing. Do not include private model data or credentials.

## Local Checks

Use Python 3.12 in a virtual environment. These commands operate locally and make
no GitHub release or Fabric API calls. Run them from the repository root:

```shell
python -m pip install -r .github/requirements-release.txt
python -B -m unittest discover -s .github/scripts -p "test_similarity*.py" -v
python .github/scripts/similarity_release.py check --worktree
python .github/scripts/similarity_release.py package --worktree --version 0.1.0 --prerelease true --output output/similarity-preview
```

On Windows, use `.venv/Scripts/python.exe` in place of `python` if the environment
is not activated. `--worktree` validates pending edits and creates an explicitly
non-releasable preview. Use `--commit HEAD` instead to check or package committed
files; release preparation always supplies the exact dispatch SHA. Use a new output
directory for each preview. The ignored `output/` directory is not distributed.

When changing workflows, also run `actionlint` on the two similarity workflow
definitions. Unit tests use disposable Git repositories and mocked GitHub calls;
they do not tag, commit, or publish in the working repository.

## Failed Runs

Validation failures occur before any GitHub write. Fix them through a PR and retry
from `main` with suitable release notes. Authentication, API, and permission
failures stop the workflow; they are never interpreted as an unused version.

A failure after tag or draft creation can leave an unpublished tag or incomplete
draft. Inspect the run and Releases page before retrying. The workflow refuses to
overwrite an existing tag, draft, release, or asset, including on a rerun. It does
not automatically delete partial work. A maintainer may deliberately remove an
unpublished draft and its unused tag after confirming the version was never
published, then retry. Never move or reuse a published tag; issue a new version
instead. Changed notebook content requires a new reviewed source commit and a
fresh smoke check before publication.