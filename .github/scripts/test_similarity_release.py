"""Focused tests for release tooling, without executing Fabric notebooks."""

import copy
import hashlib
import io
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from similarity_release import (
    NOTEBOOK_PATHS, PACKAGE_PATHS, archive_name, build_archive, extract_release_notes,
    read_sources, release_tag, validate_dispatch, validate_notebook, validate_sources,
    validate_version, verify_archive, write_bundle,
)


def sample_notebook(source="result = 1\n"):
    return {
        "nbformat": 4, "nbformat_minor": 5,
        "metadata": {"language_info": {"name": "python"}},
        "cells": [{
            "id": "test-code", "cell_type": "code", "source": source,
            "metadata": {"language": "python", "jupyter": {"source_hidden": True}},
            "outputs": [], "execution_count": None,
        }],
    }


def sample_sources():
    files = {name: b"fixture image" for name in PACKAGE_PATHS}
    for name in PACKAGE_PATHS:
        if name.endswith(".md"):
            files[name] = b"# Fixture\n\n![Review](docs/images/review-desktop.png)\n"
    files["similarity/CHANGELOG.md"] = b"# Changelog\n\n## [0.1.0]\n\n### Added\n\n- Initial preview.\n"
    for name in NOTEBOOK_PATHS:
        files[name] = json.dumps(sample_notebook()).encode("utf-8")
    return files


class ReleaseIdentityTests(unittest.TestCase):
    def test_project_identity_comes_from_one_version(self):
        self.assertEqual(validate_version("0.1.0"), "0.1.0")
        self.assertEqual(release_tag("0.1.0"), "similarity/v0.1.0")
        self.assertEqual(archive_name("0.1.0"), "semantic-model-similarity-v0.1.0.zip")

    def test_valid_versions(self):
        for version in ("0.0.0", "0.1.1", "0.2.0", "1.0.0", "12.34.567"):
            with self.subTest(version=version):
                self.assertEqual(validate_version(version), version)

    def test_invalid_versions(self):
        for version in (
            "", "v0.1.0", "01.0.0", "0.01.0", "0.1.00", "1.0", "1.2.3.4",
            "1.0.0-rc.1", "1.0.0+build", " 0.1.0", "0.1.0\n", "../0.1.0",
            "1.0.0; echo bad", "1.0.0$(id)", "-1.0.0",
        ):
            with self.subTest(version=version):
                with self.assertRaises(ValueError):
                    validate_version(version)

    def test_only_manual_main_dispatch_is_allowed(self):
        commit = "a" * 40
        validate_dispatch("workflow_dispatch", "refs/heads/main", commit)
        for event, ref in (
            ("pull_request", "refs/pull/1/merge"),
            ("push", "refs/heads/main"),
            ("workflow_dispatch", "refs/heads/develop"),
            ("workflow_dispatch", "refs/tags/similarity/v0.1.0"),
        ):
            with self.subTest(event=event, ref=ref):
                with self.assertRaises(ValueError):
                    validate_dispatch(event, ref, commit)

    def test_moving_or_invalid_source_is_rejected(self):
        for commit in ("main", "HEAD", "abc123", "a" * 39, "g" * 40):
            with self.subTest(commit=commit):
                with self.assertRaises(ValueError):
                    validate_dispatch("workflow_dispatch", "refs/heads/main", commit)


class NotebookValidationTests(unittest.TestCase):
    def test_valid_source_is_compiled_but_never_executed(self):
        document = sample_notebook("raise RuntimeError('must never execute')\n")
        validate_notebook("fixture.ipynb", json.dumps(document).encode())

    def test_known_install_magic_is_checked_without_installing(self):
        for source in (
            "%pip install -q package-that-must-not-be-installed",
            "# Install requirements.\n\n%pip install -q package-that-must-not-be-installed\n",
        ):
            with self.subTest(source=source):
                document = sample_notebook(source)
                validate_notebook("fixture.ipynb", json.dumps(document).encode())

    def test_invalid_json_and_schema_are_rejected(self):
        for content in (b"{bad", b"{}", b'{"nbformat":4,"nbformat_minor":5,"cells":false}'):
            with self.subTest(content=content):
                with self.assertRaises(ValueError):
                    validate_notebook("fixture.ipynb", content)

    def test_invalid_python_and_unknown_magic_are_rejected(self):
        for source in ("def broken(:\n", "%unknown_magic\n", "%%sql\nSELECT 1"):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "Python syntax"):
                    validate_notebook("fixture.ipynb", json.dumps(sample_notebook(source)).encode())

    def test_outputs_and_execution_counts_are_rejected(self):
        for key, value in (
            ("execution_count", 1),
            ("outputs", [{"output_type": "stream", "name": "stdout", "text": "private data"}]),
        ):
            document = sample_notebook()
            document["cells"][0][key] = value
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, "Clear saved outputs"):
                    validate_notebook("fixture.ipynb", json.dumps(document).encode())

    def test_environment_bindings_are_rejected_but_hidden_input_is_preserved(self):
        for metadata in (
            {"dependencies": {"lakehouse": {"default_lakehouse": "private-id"}}},
            {"custom": {"workspaceId": "private-id"}},
        ):
            document = sample_notebook()
            document["metadata"].update(metadata)
            with self.subTest(metadata=metadata):
                with self.assertRaisesRegex(ValueError, "binding metadata"):
                    validate_notebook("fixture.ipynb", json.dumps(document).encode())
        document = sample_notebook()
        content = json.dumps(document).encode()
        validate_notebook("fixture.ipynb", content)
        self.assertTrue(json.loads(content)["cells"][0]["metadata"]["jupyter"]["source_hidden"])

    def test_duplicate_or_missing_cell_ids_are_rejected(self):
        document = sample_notebook()
        document["cells"].append(copy.deepcopy(document["cells"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate cell IDs"):
            validate_notebook("fixture.ipynb", json.dumps(document).encode())
        document = sample_notebook()
        del document["cells"][0]["id"]
        with self.assertRaisesRegex(ValueError, "schema"):
            validate_notebook("fixture.ipynb", json.dumps(document).encode())


class NotesAndPackageTests(unittest.TestCase):
    def test_release_notes_include_only_the_requested_section(self):
        changelog = "# Changes\n\n## [0.2.0]\n\nNext.\n\n## [0.1.0]\n\nInitial.\n\n## [0.0.1]\n\nOlder.\n"
        self.assertEqual(extract_release_notes(changelog, "0.1.0"), "Initial.\n")

    def test_missing_empty_duplicate_or_code_fenced_notes_are_rejected(self):
        for changelog in (
            "# Changes", "## [0.1.0]\n", "## [0.1.0]\nOne\n## [0.1.0]\nTwo",
            "```markdown\n## [0.1.0]\nNot a heading\n```",
        ):
            with self.subTest(changelog=changelog):
                with self.assertRaisesRegex(ValueError, "nonempty"):
                    extract_release_notes(changelog, "0.1.0")

    def test_archive_is_deterministic_and_preserves_exact_sources(self):
        files = sample_sources()
        validate_sources(files)
        archive = build_archive(files)
        self.assertEqual(archive, build_archive(dict(reversed(list(files.items())))))
        with zipfile.ZipFile(io.BytesIO(archive)) as result:
            self.assertEqual(result.namelist(), sorted(PACKAGE_PATHS))
            for name in files:
                self.assertEqual(result.read(name), files[name])

    def test_missing_or_extra_files_cannot_be_packaged(self):
        files = sample_sources()
        del files[NOTEBOOK_PATHS[0]]
        with self.assertRaisesRegex(ValueError, "inventory"):
            build_archive(files)
        for name in ("lineage/notebook.ipynb", "../secret.txt", "similarity/validation/profile/Cookies"):
            files = sample_sources()
            files[name] = b"must not ship"
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, "inventory"):
                    build_archive(files)

    def test_broken_markdown_and_html_links_are_rejected(self):
        for text in (
            "[Missing](notebooks/missing.ipynb)",
            '<img src="docs/images/missing.png">',
            "[Outside](../README.md)",
            "[Encoded](%2e%2e/private.txt)",
        ):
            files = sample_sources()
            files["similarity/README.md"] = text.encode()
            with self.subTest(text=text):
                with self.assertRaisesRegex(ValueError, "not in the package"):
                    validate_sources(files)

    def test_corrupt_or_changed_archive_is_rejected(self):
        files = sample_sources()
        archive = build_archive(files)
        files["similarity/README.md"] = b"changed"
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_archive(archive, files)
        with self.assertRaises(zipfile.BadZipFile):
            verify_archive(b"not a zip", files)

    def test_bundle_checksum_notes_and_manifest_match(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = write_bundle(sample_sources(), "0.1.0", "a" * 40, True, output)
            archive = output / archive_name("0.1.0")
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertEqual(manifest["sha256"], digest)
            self.assertEqual(manifest["tag"], "similarity/v0.1.0")
            self.assertEqual((output / f"{archive.name}.sha256").read_text(), f"{digest}  {archive.name}\n")
            self.assertIn("a" * 40, (output / "release-notes.md").read_text())
            with self.assertRaisesRegex(ValueError, "already exists"):
                write_bundle(sample_sources(), "0.1.0", "a" * 40, True, output)

    def test_worktree_preview_has_no_releasable_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = write_bundle(sample_sources(), "0.1.0", None, True, Path(directory))
            self.assertIsNone(manifest["commit"])


class CommittedSourceTests(unittest.TestCase):
    def test_only_allowlisted_committed_blobs_ship(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = sample_sources()
            for name, content in {**files, "lineage/private.txt": b"sibling", "README.md": b"root"}.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)

            def git(*arguments):
                return subprocess.run(["git", "-C", str(root), *arguments], check=True, capture_output=True).stdout

            git("init", "--quiet")
            git("-c", "core.autocrlf=false", "add", ".")
            git("-c", "user.name=Release Tests", "-c", "user.email=release-tests@example.invalid", "commit", "--quiet", "-m", "Fixture")
            (root / NOTEBOOK_PATHS[0]).write_bytes(b"uncommitted invalid notebook")
            local = root / "similarity/validation/profile/Cookies"
            local.parent.mkdir(parents=True)
            local.write_bytes(b"must not ship")
            actual, commit = read_sources(root, "HEAD")
            self.assertEqual(actual, files)
            self.assertRegex(commit, r"^[0-9a-f]{40}$")
            validate_sources(actual)
            verify_archive(build_archive(actual), files)


if __name__ == "__main__":
    unittest.main()