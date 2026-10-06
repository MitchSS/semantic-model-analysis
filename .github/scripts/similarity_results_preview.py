"""Extract the real results renderer without running notebook or Fabric code."""

import argparse
import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "similarity/notebooks/002_semantic_model_similarity_results.ipynb"


def notebook_nodes(path=RESULTS):
    document = json.loads(path.read_text(encoding="utf-8"))
    nodes = []
    for cell in document["cells"]:
        if cell["cell_type"] == "code":
            source = cell["source"]
            source = "".join(source) if isinstance(source, list) else source
            nodes.extend(ast.parse(source, filename=str(path)).body)
    return nodes


def extract_template(path=RESULTS):
    renderer = next(node for node in notebook_nodes(path)
                    if isinstance(node, ast.FunctionDef) and node.name == "render_results")
    assignment = next(node for node in renderer.body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == "app_template" for target in node.targets))
    template = ast.literal_eval(assignment.value)
    if template.count("__APP_DATA__") != 1:
        raise ValueError("Expected one results data placeholder")
    return template


def render_preview(data, template=None):
    payload = json.dumps(data, ensure_ascii=True, allow_nan=False).replace("<", "\\u003c")
    content = (template if template is not None else extract_template()).replace("__APP_DATA__", payload)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Semantic Model Similarity - Synthetic Preview</title>'
            '<style>body{margin:0;background:var(--cp-bg);}</style></head><body>' + content + '</body></html>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--template", type=Path)
    options = parser.parse_args()
    data = json.loads(options.fixture.read_text(encoding="utf-8"))
    options.output.parent.mkdir(parents=True, exist_ok=True)
    template = options.template.read_text(encoding="utf-8") if options.template else None
    options.output.write_text(render_preview(data, template), encoding="utf-8")
    print(f"Preview: {options.output}; models={len(data['modelList'])}; saved pairs={len(data['allPairs'])}")


if __name__ == "__main__":
    main()