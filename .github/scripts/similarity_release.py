"""Validate and package the independently versioned similarity project."""

import argparse
import hashlib
import io
import json
import posixpath
import re
import subprocess
import zipfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


NOTEBOOK_PATHS = (
    "similarity/notebooks/001_semantic_model_tom_catalog.ipynb",
    "similarity/notebooks/002_semantic_model_similarity.ipynb",
    "similarity/notebooks/003_semantic_model_similarity_results.ipynb",
)
PACKAGE_PATHS = (
    "similarity/README.md",
    "similarity/README.marketing.md",
    "similarity/CHANGELOG.md",
    "similarity/docs/reference.md",
    "similarity/docs/images/compare-desktop.png",
    "similarity/docs/images/groups-desktop.png",
    "similarity/docs/images/review-desktop.png",
    "similarity/docs/images/similarity-map-desktop.png",
    *NOTEBOOK_PATHS,
)
ROOT = Path(__file__).resolve().parents[2]


def validate_version(version: str) -> str:
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
        raise ValueError("Version must be MAJOR.MINOR.PATCH without a leading v or suffix.")
    return version


def release_tag(version: str) -> str:
    return f"similarity/v{validate_version(version)}"


def archive_name(version: str) -> str:
    return f"semantic-model-similarity-v{validate_version(version)}.zip"


def validate_dispatch(event: str, ref: str, commit: str) -> None:
    if event != "workflow_dispatch" or ref != "refs/heads/main":
        raise ValueError("Prepare Similarity Release must be run manually from main.")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Release source must be an exact Git commit SHA.")


def read_sources(root: Path, commit: str | None) -> tuple[dict[str, bytes], str | None]:
    files = {}
    if commit is None:
        for name in PACKAGE_PATHS:
            path = root / name
            if any((root / parent).is_symlink() for parent in (PurePosixPath(name), *PurePosixPath(name).parents)):
                raise ValueError(f"Symlinks are not distributable: {name}")
            if not path.resolve().is_relative_to(root.resolve()):
                raise ValueError(f"File escapes the project: {name}")
            files[name] = path.read_bytes()
        return files, None

    def git(*arguments: str) -> bytes:
        return subprocess.run(
            ["git", "-C", str(root), *arguments], check=True, capture_output=True,
        ).stdout

    resolved = git("rev-parse", "--verify", "--end-of-options", f"{commit}^{{commit}}").decode().strip()
    entries = git("ls-tree", "-rz", "--full-tree", resolved, "--", *PACKAGE_PATHS)
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, kind, object_id = metadata.decode().split()
        name = raw_name.decode("utf-8")
        if name not in PACKAGE_PATHS or kind != "blob" or mode not in {"100644", "100755"}:
            raise ValueError(f"Not an allowed regular file: {name}")
        files[name] = git("cat-file", "blob", object_id)
    require_inventory(files)
    return files, resolved


def require_inventory(files: dict[str, bytes]) -> None:
    if set(files) != set(PACKAGE_PATHS):
        missing = sorted(set(PACKAGE_PATHS) - set(files))
        extra = sorted(set(files) - set(PACKAGE_PATHS))
        raise ValueError(f"Package inventory mismatch; missing={missing}, extra={extra}")


def validate_metadata(metadata: object, name: str) -> None:
    binding_keys = {
        "dependencies", "lakehouse", "lakehouseid", "defaultlakehouse",
        "defaultlakehouseid", "defaultlakehouseworkspaceid", "knownlakehouses",
        "workspaceid", "notebookid", "tenantid", "environment", "environmentid",
        "environmentworkspaceid",
    }
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            normalized = key.lower().replace("_", "").replace("-", "")
            if normalized in binding_keys and value not in (None, "", {}, []):
                raise ValueError(f"Remove environment-specific binding metadata from {name}: {key}")
            validate_metadata(value, name)
    elif isinstance(metadata, list):
        for value in metadata:
            validate_metadata(value, name)


def validate_notebook(name: str, content: bytes) -> None:
    import nbformat
    from IPython.core.inputtransformer2 import TransformerManager

    document = json.loads(content)
    if not isinstance(document, dict) or (document.get("nbformat"), document.get("nbformat_minor")) != (4, 5):
        raise ValueError(f"Expected nbformat 4.5 in {name}")
    errors = list(nbformat.validator.iter_validate(document))
    if errors:
        raise ValueError(f"Notebook schema is invalid in {name}: {errors[0].message}")
    if document["metadata"].get("language_info", {}).get("name") != "python":
        raise ValueError(f"Expected Python notebook language in {name}")
    validate_metadata(document["metadata"], name)
    cell_ids = [cell["id"] for cell in document["cells"]]
    if len(cell_ids) != len(set(cell_ids)):
        raise ValueError(f"Duplicate cell IDs in {name}")
    for number, cell in enumerate(document["cells"], 1):
        validate_metadata(cell["metadata"], name)
        if cell["cell_type"] != "code":
            continue
        if cell["outputs"] or cell["execution_count"] is not None:
            raise ValueError(f"Clear saved outputs and execution counts in {name}, cell {number}")
        if cell["metadata"].get("language") != "python":
            raise ValueError(f"Expected Python cell language in {name}, cell {number}")
        source = cell["source"] if isinstance(cell["source"], str) else "".join(cell["source"])
        statements = [line.strip() for line in source.splitlines() if line.strip() and not line.lstrip().startswith("#")]
        if len(statements) == 1 and statements[0].startswith("%pip install "):
            source = TransformerManager().transform_cell(source)
        try:
            compile(source, f"{name}:cell-{number}", "exec", dont_inherit=True)
        except SyntaxError as error:
            raise ValueError(f"Python syntax error in {name}, cell {number}: {error.msg}") from error


class LinkCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"href", "src"} and value:
                self.links.append(value)


def validate_links(files: dict[str, bytes]) -> None:
    from markdown_it import MarkdownIt

    for name, content in files.items():
        if not name.endswith(".md"):
            continue
        collector = LinkCollector()
        collector.feed(MarkdownIt("commonmark", {"html": True}).render(content.decode("utf-8")))
        for link in collector.links:
            target = urlsplit(link)
            if target.scheme in {"https", "http", "mailto"} or (target.netloc and not target.scheme):
                continue
            if target.scheme or target.netloc:
                raise ValueError(f"Nonportable link in {name}: {link}")
            if not target.path:
                continue
            path = unquote(target.path)
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), path))
            if "\\" in path or (resolved not in files and not any(entry.startswith(resolved + "/") for entry in files)):
                raise ValueError(f"Link target is not in the package: {name} -> {link}")


def extract_release_notes(changelog: str, version: str) -> str:
    from markdown_it import MarkdownIt

    validate_version(version)
    tokens = MarkdownIt().parse(changelog)
    headings = []
    for index, token in enumerate(tokens):
        if token.type == "heading_open" and token.tag == "h2":
            headings.append((tokens[index + 1].content, token.map))
    sections = []
    lines = changelog.splitlines()
    for index, (heading, bounds) in enumerate(headings):
        if heading == f"[{version}]" or heading.startswith(f"[{version}] - "):
            end = headings[index + 1][1][0] if index + 1 < len(headings) else len(lines)
            sections.append("\n".join(lines[bounds[1]:end]).strip())
    if len(sections) != 1 or not sections[0]:
        raise ValueError(f"Changelog must contain exactly one nonempty ## [{version}] section.")
    return sections[0] + "\n"


def validate_sources(files: dict[str, bytes]) -> None:
    require_inventory(files)
    for name in NOTEBOOK_PATHS:
        validate_notebook(name, files[name])
    validate_links(files)


def build_archive(files: dict[str, bytes]) -> bytes:
    require_inventory(files)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    result = buffer.getvalue()
    verify_archive(result, files)
    return result


def verify_archive(content: bytes, files: dict[str, bytes]) -> None:
    require_inventory(files)
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if archive.namelist() != sorted(files) or archive.testzip() is not None:
            raise ValueError("Archive inventory or CRC verification failed.")
        if any(archive.read(name) != files[name] for name in files):
            raise ValueError("Archive content differs from its source files.")


def write_bundle(files: dict[str, bytes], version: str, commit: str | None, prerelease: bool, output: Path) -> dict:
    validate_version(version)
    validate_sources(files)
    notes = extract_release_notes(files["similarity/CHANGELOG.md"].decode("utf-8"), version)
    source_label = commit or "working-tree preview (not releasable)"
    notes += (
        f"\nSource commit: `{source_label}`\n\n"
        f"Download `{archive_name(version)}` for similarity only. GitHub's automatic source archives "
        "contain the entire repository.\n"
    )
    content = build_archive(files)
    digest = hashlib.sha256(content).hexdigest()
    filename = archive_name(version)
    manifest = {
        "version": version, "tag": release_tag(version), "commit": commit,
        "prerelease": prerelease, "archive": filename, "sha256": digest,
        "files": sorted(files), "notes_sha256": hashlib.sha256(notes.encode("utf-8")).hexdigest(),
    }
    output.mkdir(parents=True, exist_ok=True)
    outputs = {
        filename: content,
        f"{filename}.sha256": f"{digest}  {filename}\n".encode("ascii"),
        "release-notes.md": notes.encode("utf-8"),
        "release-manifest.json": (json.dumps(manifest, indent=2) + "\n").encode("utf-8"),
    }
    if any((output / name).exists() for name in outputs):
        raise ValueError("Bundle output already exists; use a new, empty output directory.")
    for name, data in outputs.items():
        with (output / name).open("xb") as stream:
            stream.write(data)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "package"))
    parser.add_argument("--root", type=Path, default=ROOT)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--commit", help="Read an immutable Git tree, ignoring working-tree edits.")
    source.add_argument("--worktree", action="store_true", help="Local checks/previews only; cannot create a release.")
    parser.add_argument("--version")
    parser.add_argument("--prerelease", choices=("true", "false"), default="true")
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    if options.command == "package" and (options.version is None or options.output is None):
        parser.error("package requires --version and --output")
    try:
        files, commit = read_sources(options.root, options.commit)
        if options.command == "package":
            result = write_bundle(files, options.version, commit, options.prerelease == "true", options.output)
            print(json.dumps(result, indent=2))
        else:
            validate_sources(files)
            if build_archive(files) != build_archive(files):
                raise ValueError("Archive is not reproducible with the current tooling.")
            print(f"Validated {len(files)} files, {len(NOTEBOOK_PATHS)} notebooks, links and archive; source={commit or 'worktree'}")
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Release validation failed: {error}\n")


if __name__ == "__main__":
    main()