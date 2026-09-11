"""Verify the release workflow's trigger, permissions and source boundaries."""

import fnmatch
import unittest

import yaml

from similarity_release import ROOT


def workflow(name):
    return yaml.load((ROOT / ".github/workflows" / name).read_text(encoding="utf-8"), Loader=yaml.BaseLoader)


class WorkflowContractTests(unittest.TestCase):
    def test_release_has_only_a_manual_trigger_with_explicit_version(self):
        release = workflow("similarity-release.yml")
        self.assertEqual(set(release["on"]), {"workflow_dispatch"})
        inputs = release["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(inputs["version"]["type"], "string")
        self.assertEqual(inputs["version"]["required"], "true")
        self.assertEqual(inputs["prerelease"]["type"], "boolean")
        self.assertEqual(inputs["prerelease"]["default"], "true")
        self.assertEqual(release["concurrency"]["cancel-in-progress"], "false")

    def test_ci_is_scoped_to_similarity_and_its_tooling(self):
        ci = workflow("similarity-ci.yml")
        self.assertEqual(set(ci["on"]), {"pull_request", "push"})
        for event in ci["on"].values():
            self.assertEqual(event["branches"], ["main"])
            paths = event["paths"]
            for included in (
                "similarity/notebooks/example.ipynb", "similarity/CHANGELOG.md",
                ".github/scripts/similarity_draft.py", ".github/scripts/test_similarity_workflows.py",
                ".github/requirements-release.txt", ".github/workflows/similarity-release.yml",
            ):
                with self.subTest(included=included):
                    self.assertTrue(any(fnmatch.fnmatchcase(included, pattern) for pattern in paths))
            for excluded in ("lineage/notebooks/example.ipynb", "usage/README.md", ".github/workflows/lineage-release.yml"):
                with self.subTest(excluded=excluded):
                    self.assertFalse(any(fnmatch.fnmatchcase(excluded, pattern) for pattern in paths))

    def test_write_job_requires_successful_validation_and_main(self):
        release = workflow("similarity-release.yml")
        self.assertEqual(release["permissions"], {"contents": "read"})
        draft = release["jobs"]["draft"]
        self.assertEqual(draft["needs"], "validate")
        self.assertEqual(draft["if"], "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'")
        self.assertEqual(draft["permissions"], {"contents": "write"})
        self.assertNotIn("permissions", release["jobs"]["validate"])
        ci = workflow("similarity-ci.yml")
        self.assertEqual(ci["permissions"], {"contents": "read"})
        self.assertFalse(any("permissions" in job for job in ci["jobs"].values()))

    def test_actions_and_checkout_sources_are_immutable(self):
        for filename in ("similarity-ci.yml", "similarity-release.yml"):
            for job in workflow(filename)["jobs"].values():
                for step in job["steps"]:
                    if "uses" in step:
                        self.assertRegex(step["uses"], r"^[A-Za-z0-9_./-]+@[0-9a-f]{40}$")
                    if step.get("uses", "").startswith("actions/checkout@"):
                        self.assertEqual(step["with"]["ref"], "${{ github.sha }}")
                        self.assertEqual(step["with"]["persist-credentials"], "false")

    def test_untrusted_inputs_are_passed_as_environment_not_shell_code(self):
        release = workflow("similarity-release.yml")
        self.assertEqual(release["env"]["RELEASE_VERSION"], "${{ inputs.version }}")
        self.assertEqual(release["env"]["RELEASE_PRERELEASE"], "${{ inputs.prerelease }}")
        for job in release["jobs"].values():
            for step in job["steps"]:
                self.assertNotIn("${{ inputs.", step.get("run", ""))

    def test_artifact_handoff_uses_the_validated_artifact_id(self):
        release = workflow("similarity-release.yml")
        validate = release["jobs"]["validate"]
        self.assertEqual(validate["outputs"]["artifact-id"], "${{ steps.bundle.outputs.artifact-id }}")
        uploader = next(step for step in validate["steps"] if step.get("id") == "bundle")
        self.assertEqual(uploader["with"]["if-no-files-found"], "error")
        downloader = next(step for step in release["jobs"]["draft"]["steps"] if step.get("uses", "").startswith("actions/download-artifact@"))
        self.assertEqual(downloader["with"]["artifact-ids"], "${{ needs.validate.outputs.artifact-id }}")
        self.assertEqual(downloader["with"]["merge-multiple"], "true")

    def test_only_draft_step_receives_the_release_token(self):
        release = workflow("similarity-release.yml")
        token_steps = []
        for job_name, job in release["jobs"].items():
            for step in job["steps"]:
                if "GH_TOKEN" in step.get("env", {}):
                    token_steps.append((job_name, step))
        self.assertEqual(len(token_steps), 1)
        job_name, step = token_steps[0]
        self.assertEqual(job_name, "draft")
        self.assertIn("similarity_draft.py create", step["run"])
        self.assertNotIn("--worktree", step["run"])


if __name__ == "__main__":
    unittest.main()