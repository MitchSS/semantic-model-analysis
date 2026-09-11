"""Create a similarity draft only after a validated manual main dispatch."""

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

from similarity_release import (
    PACKAGE_PATHS, ROOT, archive_name, read_sources, release_tag,
    validate_dispatch, validate_version, verify_archive,
)


class GitHub:
    def __init__(self, repository: str):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise ValueError("Expected GitHub repository owner/name.")
        self.repository = repository

    @staticmethod
    def run(arguments: list[str], payload: dict | None = None) -> str:
        result = subprocess.run(
            ["gh", *arguments], input=json.dumps(payload) if payload is not None else None,
            text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"GitHub CLI failed: {result.stderr.strip()}")
        return result.stdout

    def api(self, endpoint: str = "", *, method: str = "GET", payload: dict | None = None, paginate: bool = False):
        path = f"repos/{self.repository}" + (f"/{endpoint}" if endpoint else "")
        arguments = ["api", path, "--method", method, "-H", "X-GitHub-Api-Version: 2022-11-28"]
        if paginate:
            arguments.extend(["--paginate", "--slurp"])
        if payload is not None:
            arguments.extend(["--input", "-"])
        return json.loads(self.run(arguments, payload))

    def pages(self, endpoint: str) -> list[dict]:
        pages = self.api(endpoint, paginate=True)
        if not isinstance(pages, list) or any(not isinstance(page, list) for page in pages):
            raise ValueError("GitHub returned an unexpected paginated response.")
        items = [item for page in pages for item in page]
        if any(not isinstance(item, dict) for item in items):
            raise ValueError("GitHub returned an unexpected list item.")
        return items

    def upload(self, tag: str, paths: list[Path]) -> None:
        self.run(["release", "upload", tag, *(str(path.resolve()) for path in paths), "--repo", self.repository])


def check_bundle(bundle: Path, version: str, commit: str, prerelease: bool, root: Path) -> tuple[str, list[Path]]:
    filename = archive_name(version)
    manifest = json.loads((bundle / "release-manifest.json").read_bytes())
    expected = {
        "version": version, "tag": release_tag(version), "commit": commit,
        "prerelease": prerelease, "archive": filename, "files": sorted(PACKAGE_PATHS),
    }
    if any(manifest.get(key) != value for key, value in expected.items()) or manifest.get("prerelease") is not prerelease:
        raise ValueError("Bundle identity does not match this release dispatch.")
    archive = bundle / filename
    checksum = bundle / f"{filename}.sha256"
    content = archive.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if manifest.get("sha256") != digest or checksum.read_bytes() != f"{digest}  {filename}\n".encode("ascii"):
        raise ValueError("Bundle checksum verification failed.")
    notes = (bundle / "release-notes.md").read_bytes()
    if manifest.get("notes_sha256") != hashlib.sha256(notes).hexdigest():
        raise ValueError("Bundle release notes changed after validation.")
    files, resolved = read_sources(root, commit)
    if resolved != commit:
        raise ValueError("Source commit changed after validation.")
    verify_archive(content, files)
    return notes.decode("utf-8"), [archive, checksum]


def validate_draft(response: dict, tag: str, version: str, prerelease: bool) -> None:
    if (
        response.get("tag_name") != tag or response.get("name") != f"Similarity {version}"
        or response.get("draft") is not True or response.get("prerelease") is not prerelease
        or type(response.get("id")) is not int or response["id"] <= 0
    ):
        raise ValueError("GitHub draft identity or flags do not match the request.")


def prepare_draft(
    github: GitHub, bundle: Path, version: str, commit: str, prerelease: bool,
    *, event: str, ref: str, root: Path = ROOT,
) -> str:
    validate_dispatch(event, ref, commit)
    tag = release_tag(version)
    notes, assets = check_bundle(bundle, version, commit, prerelease, root)
    if github.api().get("default_branch") != "main":
        raise ValueError("This workflow requires main to be the repository default branch.")
    tags = github.pages("tags?per_page=100")
    releases = github.pages("releases?per_page=100")
    if any(item["name"] == tag for item in tags) or any(item["tag_name"] == tag for item in releases):
        raise ValueError(f"Tag or release already exists: {tag}. Nothing will be overwritten.")

    reference = github.api("git/refs", method="POST", payload={"ref": f"refs/tags/{tag}", "sha": commit})
    if reference.get("ref") != f"refs/tags/{tag}" or reference.get("object", {}).get("sha") != commit:
        raise ValueError("Created tag does not identify the validated source commit.")
    draft = github.api("releases", method="POST", payload={
        "tag_name": tag, "target_commitish": commit, "name": f"Similarity {version}",
        "body": notes, "draft": True, "prerelease": prerelease, "make_latest": "false",
    })
    validate_draft(draft, tag, version, prerelease)
    github.upload(tag, assets)

    saved = github.api(f"releases/{draft['id']}")
    validate_draft(saved, tag, version, prerelease)
    if saved.get("body") != notes:
        raise ValueError("Saved release notes differ from the validated notes.")
    uploaded = saved.get("assets", [])
    if sorted(asset["name"] for asset in uploaded) != sorted(path.name for path in assets):
        raise ValueError("Draft is missing assets or contains unexpected assets.")
    for path in assets:
        asset = next(asset for asset in uploaded if asset["name"] == path.name)
        expected_digest = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        if asset.get("state") != "uploaded" or asset.get("size") != path.stat().st_size:
            raise ValueError(f"Upload is incomplete: {path.name}")
        if asset.get("digest") not in (None, expected_digest):
            raise ValueError(f"Uploaded digest differs: {path.name}")
    reference = github.api(f"git/ref/tags/{tag}")
    if reference.get("object", {}).get("sha") != commit or reference.get("object", {}).get("type") != "commit":
        raise ValueError("Release tag moved during draft preparation.")
    url = saved.get("html_url", "")
    if not url.startswith(f"https://github.com/{github.repository}/releases/"):
        raise ValueError("Unexpected draft URL from GitHub.")
    return url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("guard", "create"))
    parser.add_argument("--version", required=True)
    parser.add_argument("--prerelease", choices=("true", "false"), default="true")
    parser.add_argument("--bundle", type=Path)
    options = parser.parse_args()
    try:
        if os.environ.get("GITHUB_ACTIONS") != "true":
            raise ValueError("Draft preparation is only enabled inside GitHub Actions.")
        event = os.environ.get("GITHUB_EVENT_NAME", "")
        ref = os.environ.get("GITHUB_REF", "")
        commit = os.environ.get("GITHUB_SHA", "")
        validate_dispatch(event, ref, commit)
        validate_version(options.version)
        if options.command == "guard":
            print(f"Validated manual main dispatch: {release_tag(options.version)} at {commit}")
            return
        if options.bundle is None:
            raise ValueError("create requires --bundle")
        github = GitHub(os.environ.get("GITHUB_REPOSITORY", ""))
        url = prepare_draft(
            github, options.bundle, options.version, commit, options.prerelease == "true",
            event=event, ref=ref,
        )
        print(f"Draft ready for review: {url}")
        if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
            with Path(summary).open("a", encoding="utf-8") as stream:
                stream.write(
                    f"## Similarity {options.version}\n\n[Review draft]({url})\n\n"
                    f"Source commit: `{commit}`\n\nPrerelease: `{options.prerelease}`\n\n"
                    "Nothing has been published. Complete the Fabric smoke checklist, then publish manually.\n"
                )
    except (ValueError, OSError, RuntimeError, KeyError, TypeError) as error:
        parser.exit(1, f"Draft preparation failed: {error}\nInspect any existing tag/draft before retrying; no automatic cleanup or overwrite is performed.\n")


if __name__ == "__main__":
    main()