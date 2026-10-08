"""Notebook 002 and the Fabric App must derive the same results from the same payload.

The 002 side runs its real renderer (similarity_parity_002.mjs); the app side runs in the app's
vitest suite (packages/frontend/src/lib/results/parity.spec.ts). Both compare with
similarity_parity_expected.json. Regenerate it from 002 with:

    python .github/scripts/test_similarity_parity.py --write
"""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

from similarity_results_preview import extract_template
from test_similarity_results import FIXTURE, SCRIPTS, Scripts

EXPECTED = SCRIPTS / "similarity_parity_expected.json"
RAW = SCRIPTS / "similarity_parity_raw.json"
PAYLOAD = SCRIPTS / "similarity_parity_payload_expected.json"
RAW_TABLES = {
    "run": "semantic_model_similarity_run", "models": "semantic_models", "signatures": "semantic_model_signatures",
    "pairs": "semantic_model_similarity_pairs", "tables": "semantic_model_tables", "columns": "semantic_model_columns",
    "measures": "semantic_model_measures", "relationships": "semantic_model_relationships",
    "datasources": "semantic_model_datasources", "queries": "semantic_model_queries",
    "reports": "semantic_model_report_dependencies", "reportScans": "semantic_model_report_scan",
}


def payload_002(raw):
    """Run notebook 002's real render_results() over raw lakehouse rows and return APP_DATA."""
    import re
    import types

    import pandas as pd

    def snake(name):
        return re.sub(r"([A-Z])", lambda match: "_" + match.group(1).lower(), name)

    lake = {RAW_TABLES[key]: pd.DataFrame([{snake(k): v for k, v in row.items()} for row in rows]) for key, rows in raw.items()}
    utils = types.SimpleNamespace(AnalysisException=type("AnalysisException", (Exception,), {}))
    sys.modules.setdefault("pyspark", types.SimpleNamespace())
    sys.modules.setdefault("pyspark.sql", types.SimpleNamespace(utils=utils))
    sys.modules.setdefault("pyspark.sql.utils", utils)
    captured = {}
    namespace = {
        "spark": types.SimpleNamespace(table=lambda name: types.SimpleNamespace(toPandas=lambda: lake[name].copy())),
        "displayHTML": lambda html: captured.setdefault("html", html),
    }
    from similarity_results_preview import RESULTS
    document = json.loads(RESULTS.read_text(encoding="utf-8"))
    exec("".join(next(cell for cell in document["cells"] if cell["cell_type"] == "code")["source"]), namespace)
    namespace["render_results"]()
    match = re.search(r"var DATA = (\{.*?\});\n", captured["html"], flags=re.S)
    return json.loads(match.group(1).replace("\\u003c", "<"))


def snapshot_002():
    parser = Scripts()
    parser.feed(extract_template())
    result = subprocess.run(
        ["node", str(SCRIPTS / "similarity_parity_002.mjs")],
        input=json.dumps({"script": parser.scripts[-1], "fixture": json.loads(FIXTURE.read_text(encoding="utf-8"))}),
        text=True, capture_output=True, timeout=60, encoding="utf-8",
    )
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return json.loads(result.stdout)


class ParityTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is required for the renderer parity snapshot")
    def test_notebook_002_matches_expected_parity_snapshot(self):
        self.maxDiff = None
        self.assertEqual(snapshot_002(), json.loads(EXPECTED.read_text(encoding="utf-8")))

    def test_notebook_002_payload_fixture_is_current(self):
        try:
            import pandas  # noqa: F401
        except ImportError:
            self.skipTest("pandas is required to run notebook 002's payload builder")
        self.maxDiff = None
        actual = payload_002(json.loads(RAW.read_text(encoding="utf-8")))
        expected = json.loads(PAYLOAD.read_text(encoding="utf-8"))
        actual.pop("generatedAt")
        expected.pop("generatedAt")
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    if "--write" in sys.argv:
        EXPECTED.write_text(json.dumps(snapshot_002(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {EXPECTED}")
        PAYLOAD.write_text(json.dumps(payload_002(json.loads(RAW.read_text(encoding="utf-8"))), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {PAYLOAD}")
    else:
        unittest.main()
