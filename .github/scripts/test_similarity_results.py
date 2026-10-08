"""Results presentation checks using real notebook code and synthetic data only."""

import ast
import hashlib
import json
import shutil
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path

from similarity_results_preview import extract_template, notebook_nodes, render_preview


SCRIPTS = Path(__file__).parent
FIXTURE = SCRIPTS / "similarity_results_fixture.json"


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.inside = True
            self.scripts.append("")

    def handle_data(self, data):
        if self.inside:
            self.scripts[-1] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.inside = False


def run_renderer_checks(template):
    parser = Scripts()
    parser.feed(template)
    if len(parser.scripts) != 2:
        raise AssertionError("Expected the existing two self-contained scripts")
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = subprocess.run(
        ["node", str(SCRIPTS / "similarity_results_test.mjs")],
        input=json.dumps({"script": parser.scripts[-1], "fixture": data}),
        text=True, capture_output=True, timeout=30,
    )
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return json.loads(result.stdout)


class ResultsTests(unittest.TestCase):
    def test_report_and_security_validation_are_unchanged(self):
        expected = {
            "build_report_dependency_payload": "e27c5d547da4881c8c3bd19b0f752b39b37ccd75f0350e1d41f24fa6dadfc584",
            # Score version 3: refreshed deliberately with the Power Query signal.
            "build_security_results": "3a93466343814ce960a7d69d063b360a425fe43888f34436e39b2f1476495fed",
        }
        functions = {node.name: node for node in notebook_nodes() if isinstance(node, ast.FunctionDef)}
        for name, digest in expected.items():
            with self.subTest(function=name):
                actual = hashlib.sha256(ast.dump(functions[name], include_attributes=False).encode()).hexdigest()
                self.assertEqual(actual, digest)

    def test_power_query_normalization_matches_notebook_001(self):
        from test_similarity_notebooks import notebook_nodes as scoring_nodes

        def dump(nodes):
            return next(ast.dump(node, include_attributes=False) for node in nodes
                        if isinstance(node, ast.FunctionDef) and node.name == "norm_m")

        self.assertEqual(dump(notebook_nodes()), dump(scoring_nodes()))

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for the isolated renderer checks")
    def test_real_renderer_behavior(self):
        result = run_renderer_checks(extract_template())
        self.assertEqual(result["status"], "PASS")
        self.assertGreaterEqual(result["assertions"], 40)

    def test_preview_escapes_script_payload(self):
        preview = render_preview({"name": "</script><img src=x>"}, "<script>const data=__APP_DATA__;</script>")
        self.assertNotIn("</script><img", preview)
        self.assertIn("\\u003c/script>", preview)

    def test_preview_has_no_external_dependencies(self):
        preview = render_preview(json.loads(FIXTURE.read_text(encoding="utf-8")))
        self.assertNotIn('<script src=', preview)
        self.assertNotIn('<link ', preview)
        self.assertIn('data-theme="dark"', preview)


if __name__ == "__main__":
    unittest.main()