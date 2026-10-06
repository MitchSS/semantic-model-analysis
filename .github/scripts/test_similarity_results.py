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
            "build_report_dependency_payload": "8f5d3dd68cd235699e31d11eb29fa08d33e7493e435d66d2998bb18c444a025b",
            "build_security_results": "9072279c308134d5f80f7837210aa9259f53c55105d9b9090de1991161e9e5bb",
        }
        functions = {node.name: node for node in notebook_nodes() if isinstance(node, ast.FunctionDef)}
        for name, digest in expected.items():
            with self.subTest(function=name):
                actual = hashlib.sha256(ast.dump(functions[name], include_attributes=False).encode()).hexdigest()
                self.assertEqual(actual, digest)

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