"""Mocked GitHub checks: no real tags, releases, uploads or authentication."""

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from similarity_draft import GitHub, prepare_draft
from similarity_release import archive_name, write_bundle
from test_similarity_release import sample_sources


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.bundle = Path(self.directory.name)
        self.files = sample_sources()
        self.commit = "a" * 40
        write_bundle(self.files, "0.1.0", self.commit, True, self.bundle)
        self.github = Mock(spec=GitHub)
        self.github.repository = "example/project"
        self.github.pages.side_effect = [[], []]
        self.reference = {"ref": "refs/tags/similarity/v0.1.0", "object": {"type": "commit", "sha": self.commit}}
        self.draft = {
            "id": 17, "tag_name": "similarity/v0.1.0", "name": "Similarity 0.1.0",
            "draft": True, "prerelease": True,
            "body": (self.bundle / "release-notes.md").read_text(),
            "html_url": "https://github.com/example/project/releases/tag/similarity/v0.1.0",
            "assets": [
                {"name": path.name, "size": path.stat().st_size, "state": "uploaded",
                 "digest": "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()}
                for path in (self.bundle / archive_name("0.1.0"), self.bundle / (archive_name("0.1.0") + ".sha256"))
            ],
        }
        self.github.api.side_effect = [
            {"default_branch": "main"}, self.reference, self.draft, self.draft, self.reference,
        ]
        sources = patch("similarity_draft.read_sources", return_value=(self.files, self.commit))
        sources.start()
        self.addCleanup(sources.stop)

    def prepare(self, **overrides):
        arguments = {
            "github": self.github, "bundle": self.bundle, "version": "0.1.0",
            "commit": self.commit, "prerelease": True,
            "event": "workflow_dispatch", "ref": "refs/heads/main",
        }
        return prepare_draft(**(arguments | overrides))

    def assert_no_writes(self):
        self.assertFalse(any(call.kwargs.get("method") == "POST" for call in self.github.api.call_args_list))
        self.github.upload.assert_not_called()

    def test_creates_only_a_fixed_tag_and_unpublished_draft(self):
        self.assertEqual(self.prepare(), self.draft["html_url"])
        writes = [call for call in self.github.api.call_args_list if call.kwargs.get("method") == "POST"]
        self.assertEqual(len(writes), 2)
        self.assertEqual(writes[0].kwargs["payload"], {"ref": "refs/tags/similarity/v0.1.0", "sha": self.commit})
        payload = writes[1].kwargs["payload"]
        self.assertIs(payload["draft"], True)
        self.assertIs(payload["prerelease"], True)
        self.assertEqual(payload["make_latest"], "false")
        self.assertEqual(payload["target_commitish"], self.commit)
        self.github.upload.assert_called_once()

    def test_other_project_versions_do_not_block_similarity(self):
        self.github.pages.side_effect = [[{"name": "lineage/v0.1.0"}], [{"tag_name": "lineage/v0.1.0", "draft": True}]]
        self.prepare()
        self.github.upload.assert_called_once()

    def test_existing_tag_or_draft_blocks_writes(self):
        for pages in (
            [[{"name": "similarity/v0.1.0"}], []],
            [[], [{"tag_name": "similarity/v0.1.0", "draft": True}]],
            [[], [{"tag_name": "similarity/v0.1.0", "draft": False}]],
        ):
            with self.subTest(pages=pages):
                self.github.reset_mock()
                self.github.api.side_effect = [{"default_branch": "main"}]
                self.github.pages.side_effect = pages
                with self.assertRaisesRegex(ValueError, "already exists"):
                    self.prepare()
                self.assert_no_writes()

    def test_permission_and_api_errors_do_not_mean_unused_version(self):
        self.github.pages.side_effect = RuntimeError("HTTP 403")
        with self.assertRaisesRegex(RuntimeError, "403"):
            self.prepare()
        self.assert_no_writes()

    def test_wrong_dispatch_or_bundle_identity_blocks_writes(self):
        for overrides in (
            {"ref": "refs/heads/develop"}, {"event": "push"},
            {"commit": "b" * 40}, {"version": "0.2.0"}, {"prerelease": False},
        ):
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError):
                    self.prepare(**overrides)
                self.assert_no_writes()

    def test_preview_bundle_cannot_be_released(self):
        path = self.bundle / "release-manifest.json"
        manifest = json.loads(path.read_bytes())
        manifest["commit"] = None
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "identity"):
            self.prepare()
        self.assert_no_writes()

    def test_tampered_notes_or_archive_blocks_writes(self):
        for filename in ("release-notes.md", archive_name("0.1.0")):
            path = self.bundle / filename
            original = path.read_bytes()
            path.write_bytes(original + b"changed")
            with self.subTest(filename=filename):
                with self.assertRaises(ValueError):
                    self.prepare()
                self.assert_no_writes()
            path.write_bytes(original)

    def test_committed_source_mismatch_blocks_writes(self):
        self.files["similarity/README.md"] = b"different source commit"
        with self.assertRaisesRegex(ValueError, "differs"):
            self.prepare()
        self.assert_no_writes()

    def test_partial_upload_is_not_published_or_cleaned_up(self):
        self.github.upload.side_effect = RuntimeError("Upload failed")
        with self.assertRaisesRegex(RuntimeError, "Upload failed"):
            self.prepare()
        methods = [call.kwargs.get("method", "GET") for call in self.github.api.call_args_list]
        self.assertEqual(methods, ["GET", "POST", "POST"])

    def test_tag_creation_race_stops_before_draft_creation(self):
        self.github.api.side_effect = [{"default_branch": "main"}, RuntimeError("HTTP 422: reference exists")]
        with self.assertRaisesRegex(RuntimeError, "422"):
            self.prepare()
        self.github.upload.assert_not_called()
        self.assertEqual(len(self.github.api.call_args_list), 2)

    def test_readback_detects_incomplete_upload_and_tag_movement(self):
        self.draft["assets"][0]["size"] += 1
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.prepare()
        self.draft["assets"][0]["size"] -= 1
        self.github.pages.side_effect = [[], []]
        self.github.api.side_effect = [
            {"default_branch": "main"}, self.reference, self.draft, self.draft,
            {"object": {"type": "commit", "sha": "b" * 40}},
        ]
        with self.assertRaisesRegex(ValueError, "tag moved"):
            self.prepare()


class GitHubClientTests(unittest.TestCase):
    def test_all_pages_are_parsed_without_jq(self):
        with patch.object(GitHub, "run", return_value='[[{"name":"one"}],[{"name":"two"}]]') as run:
            self.assertEqual(GitHub("example/project").pages("tags?per_page=100"), [{"name": "one"}, {"name": "two"}])
            arguments = run.call_args.args[0]
            self.assertIn("--paginate", arguments)
            self.assertIn("--slurp", arguments)
            self.assertNotIn("--jq", arguments)

    def test_error_responses_fail_closed(self):
        with patch("similarity_draft.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "", "HTTP 401")):
            with self.assertRaisesRegex(RuntimeError, "401"):
                GitHub("example/project").pages("releases?per_page=100")
        for response in ('{"message":"Not Found"}', '[{"name":"not a page"}]', '[[null]]'):
            with self.subTest(response=response), patch.object(GitHub, "run", return_value=response):
                with self.assertRaises(ValueError):
                    GitHub("example/project").pages("releases?per_page=100")


if __name__ == "__main__":
    unittest.main()