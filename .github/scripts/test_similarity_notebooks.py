"""Offline contracts and failure-path tests for the distributed notebooks."""

import ast
from collections import Counter
from contextlib import contextmanager
import hashlib
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from similarity_release import ROOT, validate_notebook


NOTEBOOK = ROOT / "similarity/notebooks/001_semantic_model_similarity.ipynb"
SCORING_FINGERPRINTS = {
    "collect_security_definition": "bfd6b18970d8a2ddb68ac69468d92d169f3a73cc7a6f449372582c8273986c24",
    "security_json": "0ea9afb10ce81e6d5749b92ab04ab5c491c67332d958c543309305844e2106c3",
    "normalize_score_weights": "53e002e19d161a2f39d930e8e293b34e3762c4404380c43e9f5891348cf8b2ce",
    "build_security_signature": "2f97505098d9529e57cff6cfac72f17a0bebbcc6f6e8ee5aa149fe9c447a24f4",
    "security_overlap": "290f93445b91438ae877d3029a8eb2364598b3844e105f492e5ea67a30cf6b5a",
    "security_weighted_average": "d5fad927a7349685ae47acbf785f3052c7d8a1c08a6505ecad6e18a19e216ffb",
    "score_security_pair": "f87ecc1e0f6d5cc9689d05ba1502a59a8206c880fffa6d247e1b1a9a03e90bf2",
    "combine_similarity": "1bc35614aac10d87f8949466f6ca0e6aab79a6d72d18560b25d19818b30d93ea",
    "classify_similarity": "51b7d6b72353387478c7e53f66ef3331f765b71c5bc114c06ef5d8f3a2f1d04d",
    "norm": "f1cdab5fb077b267ce7e05286c3f84e13e0f57c5f46e06cb8859dfe5989beefd",
    "norm_dax": "3926c5e3aa107ef679f9c47a43172bfd1779aaa3000ae789037eed0a016f9191",
    "jaccard": "06752d8c22a016f499688a0e694acdf422b9f3bad103930b18f8a308aaaaf954",
    "coverage": "a2aa43e1f2a5d70a7e52e8c132f855d225858f1ec9637ef57197bf48f0b67b28",
    "weighted_containment": "1266cd55374bfd462c15b233f7cc17265f185975d14c3d5c1de563cd9fd03a52",
    "classify_containment": "d6f95cde3c55688a24b5b6205cce0cd30ba345cc5d718ba1d20c121db7646a06",
    "find": "1e8934b9a635e4c2fb2bba4c0d96d02ab8a863ed398fed9a7d04cd2001c897d7",
    "union": "791a37f661e20d7afb15dcbdef5c5b82f1fbc4834e2f873866f9ec9b2b2763a0",
}
SCORING_STAGES = {
    "signatures = {}": "e5629e2a85390c316e310b43d96c18b8a307939b6b0ab074e5ef9a288debf1fc",
    "def jaccard(": "d435e50214c9398accffdc09089c0c0099decc204b89a6a2d457f61e1f888969",
    "TfidfVectorizer": "797b79b15ea8ee1543279c7ffe5e04f15de619ca4c38498fae07c57c6a7601a4",
    "analysis_run_id =": "8a8edf88863da2c2143310d82ff4c4d936836bd5c35131546215cb7fbe3fe266",
    "similarity_outputs =": "29b0e910dd4e40c68210c7b1221a337acd39629a448f5a62f466e7e3460196a2",
}


def notebook_nodes(path=NOTEBOOK):
    nodes = []
    for cell in json.loads(path.read_text(encoding="utf-8"))["cells"]:
        if cell["cell_type"] != "code":
            continue
        source = cell["source"]
        source = "".join(source) if isinstance(source, list) else source
        statements = [line.strip() for line in source.splitlines()
                      if line.strip() and not line.lstrip().startswith("#")]
        if len(statements) == 1 and statements[0].startswith("%pip install "):
            continue
        nodes.extend(ast.parse(source).body)
    return nodes


def load_helpers(path=NOTEBOOK):
    allowed_imports = {"contextlib", "datetime", "uuid", "json", "time", "math", "inspect", "hashlib", "email.utils"}
    nodes = []
    namespace = {}
    for node in notebook_nodes(path):
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            nodes.append(node)
        elif isinstance(node, ast.Import) and all(alias.name in allowed_imports for alias in node.names):
            nodes.append(node)
        elif isinstance(node, ast.ImportFrom) and node.module in allowed_imports:
            nodes.append(node)
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                namespace[node.targets[0].id] = ast.literal_eval(node.value)
            except (ValueError, TypeError):
                pass
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)
    return namespace


class Frame:
    def __init__(self, records, columns=None):
        self.records = records
        self.columns = columns if columns is not None else list(records[0]) if records else []

    def to_dict(self, orientation):
        assert orientation == "records"
        return self.records


class HttpError(Exception):
    def __init__(self, status=403, retry_after=None):
        super().__init__(f"HTTP {status}")
        self.response = SimpleNamespace(status_code=status, headers={})
        if retry_after is not None:
            self.response.headers["Retry-After"] = str(retry_after)


WORKSPACE_A = "11111111-1111-1111-1111-111111111111"
WORKSPACE_B = "22222222-2222-2222-2222-222222222222"
GROUP_ID = "33333333-3333-3333-3333-333333333333"
RUN_ID = "44444444-4444-4444-4444-444444444444"
NEXT_RUN_ID = "55555555-5555-5555-5555-555555555555"


def workspace_records():
    return [{"Id": WORKSPACE_A, "Name": "Reports", "State": "Active", "Type": "Workspace"},
            {"Id": WORKSPACE_B, "Name": "Models", "State": "Active", "Type": "Workspace"}]


def response(reports, continuation=None):
    payload = {"value": reports}
    if continuation is not None:
        payload["@odata.nextLink"] = continuation
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: payload)


class FakeAccess:
    def __init__(self):
        self.events = []

    def begin(self, scan_id, scope):
        self.events.append("begin")

    @contextmanager
    def workspace(self, workspace):
        self.events.append(("add", workspace["workspace_id"]))
        try:
            yield lambda operation: operation()
        finally:
            self.events.append(("delete", workspace["workspace_id"]))

    def finish(self):
        self.events.append("finish")


class FakeClock:
    def __init__(self):
        self.now = 0
        self.delays = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.delays.append(seconds)
        self.now += seconds


class MemoryFileSystem:
    def __init__(self):
        self.files = {}
        self.directories = set()
        self.reject_state = None

    def exists(self, path):
        return path.rstrip("/") in self.directories or path in self.files

    def mkdirs(self, path):
        parts = path.rstrip("/").split("/")
        self.directories.update("/".join(parts[:count]) for count in range(1, len(parts) + 1))
        return True

    def put(self, path, content, overwrite):
        document = json.loads(content)
        if document.get("state") == self.reject_state:
            self.reject_state = None
            return False
        if not overwrite and path in self.files:
            raise FileExistsError(path)
        self.files[path] = content
        return True

    def head(self, path, max_bytes):
        return self.files[path].encode()[:max_bytes].decode()

    def ls(self, path):
        prefix = path.rstrip("/") + "/"
        entries = []
        for name in sorted(self.directories | set(self.files)):
            if name.startswith(prefix) and "/" not in name[len(prefix):] and name != prefix:
                entries.append(SimpleNamespace(name=name[len(prefix):], path=name,
                                               isDir=name in self.directories, size=len(self.files.get(name, ""))))
        return entries


class FakeAdmin:
    def __init__(self):
        self.roles = {}
        self.events = []
        self.add_error = None
        self.apply_before_add_error = False
        self.delete_errors = []
        self.list_error = None

    def add_user_to_workspace(self, user, role, principal_type, workspace):
        assert role == "Member" and principal_type == "Group" and user == GROUP_ID
        self.events.append(("add", workspace))
        if self.apply_before_add_error:
            self.roles[(workspace, user)] = role
        if self.add_error is not None:
            raise self.add_error
        if (workspace, user) in self.roles:
            raise HttpError(409)
        self.roles[(workspace, user)] = role

    def delete_user_from_workspace(self, user, workspace, is_group):
        assert is_group is True and user == GROUP_ID
        self.events.append(("delete", workspace))
        if self.delete_errors:
            raise self.delete_errors.pop(0)
        self.roles.pop((workspace, user), None)

    def list_workspace_users(self, workspace):
        self.events.append(("list", workspace))
        if self.list_error is not None:
            raise self.list_error
        return Frame([
            {"Graph Id": group, "Identifier": group, "Principal Type": "Group", "Group User Access Right": role}
            for (workspace_id, group), role in self.roles.items() if workspace_id == workspace
        ], columns=["Graph Id", "Identifier", "Principal Type", "Group User Access Right"])


class AccessTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_helpers()
        self.admin = FakeAdmin()
        self.fs = MemoryFileSystem()
        self.clock = FakeClock()
        self.journal = self.helpers["LakehouseAccessJournal"](self.fs, GROUP_ID)
        self.access = self.helpers["TemporaryWorkspaceAccess"](
            self.admin, GROUP_ID, self.journal, timeout=60, interval=5, clock=self.clock, sleep=self.clock.sleep,
        )
        self.workspace = {"workspace_id": WORKSPACE_A, "workspace_name": "Reports"}
        self.scope = {"workspaces": [self.workspace], "report_scope": "admin_workspaces"}
        self.access.begin(RUN_ID, self.scope)

    def record(self):
        return self.journal.read_run(RUN_ID)[1][0]

    def test_direct_add_has_no_pregrant_assignment_check(self):
        with self.access.workspace(self.workspace) as read:
            read(lambda: self.admin.events.append(("read", WORKSPACE_A)))
        self.assertEqual(self.admin.events, [("add", WORKSPACE_A), ("read", WORKSPACE_A),
                                            ("delete", WORKSPACE_A), ("list", WORKSPACE_A)])
        self.assertEqual(self.record()["state"], "removed")
        self.access.finish()
        self.assertEqual(self.journal.read_run(RUN_ID)[0]["state"], "complete")

    def test_scan_exception_and_interrupt_both_remove_access(self):
        for error in (ValueError("scan failed"), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__):
                with self.assertRaises(type(error)):
                    with self.access.workspace(self.workspace):
                        raise error
                self.assertNotIn((WORKSPACE_A, GROUP_ID), self.admin.roles)
                self.assertEqual(self.record()["state"], "removed")

    def test_stale_member_assignment_is_reconciled_only_after_add_failure(self):
        self.admin.roles[(WORKSPACE_A, GROUP_ID)] = "Member"
        self.admin.roles[(WORKSPACE_A, WORKSPACE_B)] = "Admin"
        with self.access.workspace(self.workspace):
            pass
        self.assertEqual(self.admin.events[:2], [("add", WORKSPACE_A), ("list", WORKSPACE_A)])
        self.assertEqual(self.record()["origin"], "reconciled")
        self.assertEqual(self.admin.roles, {(WORKSPACE_A, WORKSPACE_B): "Admin"})

    def test_unexpected_existing_role_is_not_removed(self):
        self.admin.roles[(WORKSPACE_A, GROUP_ID)] = "Admin"
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                self.fail("Unexpected roles cannot be used")
        self.assertNotIn(("delete", WORKSPACE_A), self.admin.events)
        self.assertEqual(self.record()["state"], "uncertain")

    def test_ambiguous_add_without_visible_role_does_not_report_success(self):
        self.admin.add_error = TimeoutError("Unknown request outcome")
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                self.fail("Uncertain add cannot proceed")
        self.assertEqual(self.record()["state"], "uncertain")
        self.assertNotIn(("delete", WORKSPACE_A), self.admin.events)

    def test_ambiguous_add_with_visible_member_is_cleaned_up(self):
        self.admin.add_error = TimeoutError("Response lost")
        self.admin.apply_before_add_error = True
        with self.access.workspace(self.workspace):
            pass
        self.assertEqual(self.record()["state"], "removed")
        self.assertEqual(self.record()["origin"], "reconciled")
        self.assertEqual(sum(event[0] == "add" for event in self.admin.events), 1)

    def test_grant_authorization_failure_is_fatal(self):
        self.admin.add_error = HttpError(403)
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        self.assertEqual(self.record()["state"], "not_granted")

    def test_postgrant_journal_failure_still_removes_assignment(self):
        self.fs.reject_state = "granted"
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        self.assertNotIn((WORKSPACE_A, GROUP_ID), self.admin.roles)
        self.assertEqual(self.record()["state"], "removed")

    def test_intent_journal_failure_prevents_add(self):
        self.fs.reject_state = "intent"
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        self.assertEqual(self.admin.events, [])

    def test_delayed_access_retries_reads_not_adds(self):
        operation = Mock(side_effect=[HttpError(403), HttpError(404), "ready"])
        with self.access.workspace(self.workspace) as read:
            self.assertEqual(read(operation), "ready")
        self.assertEqual(self.clock.delays, [5, 5])
        self.assertEqual(sum(event[0] == "add" for event in self.admin.events), 1)

    def test_nonretryable_read_and_retry_after_beyond_budget(self):
        for error in (HttpError(400), HttpError(429, retry_after=600)):
            operation = Mock(side_effect=error)
            with self.assertRaises((HttpError, TimeoutError)):
                with self.access.workspace(self.workspace) as read:
                    read(operation)
            operation.assert_called_once()
            self.assertNotIn((WORKSPACE_A, GROUP_ID), self.admin.roles)
        self.assertEqual(self.clock.delays, [])

    def test_transient_delete_retry_honors_retry_after(self):
        self.admin.delete_errors = [HttpError(429, retry_after=12)]
        with self.access.workspace(self.workspace):
            pass
        self.assertEqual(self.clock.delays, [12])
        self.assertEqual(self.record()["state"], "removed")

    def test_cleanup_failure_keeps_original_failure_visible(self):
        self.admin.delete_errors = [HttpError(403)]
        with self.assertRaisesRegex(self.helpers["WorkspaceAccessError"], "after ValueError"):
            with self.access.workspace(self.workspace):
                raise ValueError("Failed collection")
        self.assertEqual(self.record()["state"], "cleanup_failed")
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            self.access.begin(NEXT_RUN_ID, self.scope)

    def test_unfinished_run_requires_recovery_and_only_its_group_is_removed(self):
        self.admin.delete_errors = [HttpError(403)]
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        self.admin.roles[(WORKSPACE_A, WORKSPACE_B)] = "Viewer"
        self.access.recover(RUN_ID, confirm_no_pending_add=True)
        self.assertEqual(self.admin.roles, {(WORKSPACE_A, WORKSPACE_B): "Viewer"})
        self.assertEqual(self.journal.read_run(RUN_ID)[0]["state"], "complete")
        self.access.begin(NEXT_RUN_ID, self.scope)

    def test_ambiguous_absent_recovery_requires_explicit_confirmation(self):
        self.admin.add_error = TimeoutError()
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            self.access.recover(RUN_ID)
        self.access.recover(RUN_ID, confirm_no_pending_add=True)
        self.assertEqual(self.record()["state"], "removed")

    def test_corrupt_journal_blocks_new_grants(self):
        path = self.journal._path(RUN_ID)
        self.fs.files[path] = "not json"
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            self.access.begin(NEXT_RUN_ID, self.scope)
        self.assertEqual(self.admin.events, [])

    def test_throttled_grant_stops_instead_of_hammering_other_workspaces(self):
        self.admin.add_error = HttpError(429, retry_after=300)
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                self.fail("A throttled grant must stop")
        self.assertEqual(sum(event[0] == "add" for event in self.admin.events), 1)

    def test_cleanup_failure_stops_collection_before_next_workspace(self):
        self.access.finish()
        self.admin.list_workspaces = lambda **kwargs: Frame(workspace_records())
        self.admin.delete_errors = [HttpError(403)]
        fabric = SimpleNamespace(list_datasets=Mock(return_value=Frame([])),
                                 PowerBIRestClient=lambda: SimpleNamespace(get=lambda url: response([])))
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            self.helpers["collect_catalog"](fabric, self.admin, Mock(), access=self.access, scan_id=NEXT_RUN_ID)
        self.assertEqual([event for event in self.admin.events if event[0] == "add"], [("add", WORKSPACE_A)])
        fabric.list_datasets.assert_called_once_with(workspace=WORKSPACE_A)

    def test_nested_or_out_of_scope_context_cannot_grant(self):
        with self.access.workspace(self.workspace):
            with self.assertRaises(self.helpers["WorkspaceAccessError"]):
                with self.access.workspace(self.workspace):
                    pass
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace({"workspace_id": WORKSPACE_B, "workspace_name": "Not in scope"}):
                pass
        self.assertEqual(sum(event[0] == "add" for event in self.admin.events), 1)

    def test_recovery_needs_confirmation_even_when_assignment_is_visible(self):
        self.admin.delete_errors = [HttpError(403)]
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            with self.access.workspace(self.workspace):
                pass
        events_before = list(self.admin.events)
        with self.assertRaises(self.helpers["WorkspaceAccessError"]):
            self.access.recover(RUN_ID)
        self.assertEqual(self.admin.events, events_before)

    def test_xmla_authorization_delay_is_retryable(self):
        xmla_error = type("AdomdErrorResponseException", (Exception,), {})("User does not have permission")
        operation = Mock(side_effect=[xmla_error, "connected"])
        with self.access.workspace(self.workspace) as read:
            self.assertEqual(read(operation), "connected")
        self.assertEqual(self.clock.delays, [5])

    def test_disabled_access_needs_no_group_runtime_or_admin_api(self):
        admin = Mock()
        access = self.helpers["configure_workspace_access"](False, None, 300, 15, admin)
        self.assertIsNone(access)
        self.assertEqual(admin.mock_calls, [])

    def test_invalid_runtime_group_and_timing_fail_before_permission_calls(self):
        factory = self.helpers["configure_workspace_access"]
        for context in ({}, {"defaultLakehouseId": WORKSPACE_A, "isForPipeline": True},
                        {"defaultLakehouseId": WORKSPACE_A, "isReferenceRun": True}):
            with self.subTest(context=context), self.assertRaises(ValueError):
                factory(True, GROUP_ID, 300, 15, self.admin, context, self.fs)
        for group_id, timeout, interval in ((None, 300, 15), ("not-a-uuid", 300, 15),
                                           (GROUP_ID, 0, 15), (GROUP_ID, 300, float("nan")),
                                           (GROUP_ID, 10, 15), (GROUP_ID, True, 1)):
            with self.subTest(group=group_id, timeout=timeout), self.assertRaises(ValueError):
                factory(True, group_id, timeout, interval, self.admin, {"defaultLakehouseId": WORKSPACE_A}, self.fs)
        self.assertEqual(self.admin.events, [])

    def test_old_delete_wrapper_signature_fails_before_any_grant(self):
        self.admin.delete_user_from_workspace = lambda user, workspace: None
        with self.assertRaises(TypeError):
            self.helpers["TemporaryWorkspaceAccess"](self.admin, GROUP_ID, self.journal)
        self.assertEqual(self.admin.events, [])


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_helpers()
        self.helpers["FabricHTTPException"] = HttpError
        self.helpers.setdefault("WorkspaceAccessError", type("WorkspaceAccessError", (RuntimeError,), {}))
        self.admin = Mock()
        self.admin.list_workspaces.return_value = Frame(workspace_records())
        self.fabric = Mock()
        self.fabric.list_workspaces.return_value = Frame(workspace_records())
        self.fabric.list_datasets.return_value = Frame([])
        self.fabric.PowerBIRestClient.return_value.get.return_value = response([])

    def test_admin_scope_uses_union_and_does_not_require_existing_visibility(self):
        scope = self.helpers["discover_collection_scope"](self.fabric, self.admin, "models", "REPORTS", True)
        self.assertEqual({row["workspace_id"] for row in scope["workspaces"]}, {WORKSPACE_A, WORKSPACE_B})
        self.fabric.list_workspaces.assert_not_called()
        self.admin.list_workspaces.assert_called_once_with(workspace_state="Active", workspace_type="Workspace")
        self.assertEqual(scope["report_scope"], "admin_workspace_filter:REPORTS")

    def test_admin_failure_cannot_fall_back_to_visible_workspaces(self):
        self.admin.list_workspaces.side_effect = HttpError()
        with self.assertRaises(HttpError):
            self.helpers["discover_collection_scope"](self.fabric, self.admin, temporary_access=True)
        self.fabric.list_workspaces.assert_not_called()

    def test_disabled_mode_retains_visible_report_scope_and_model_fallback(self):
        self.admin.list_workspaces.side_effect = HttpError()
        scope = self.helpers["discover_collection_scope"](self.fabric, self.admin)
        self.assertEqual(scope["report_scope"], "visible_workspaces")
        self.assertEqual(self.fabric.list_workspaces.call_count, 2)
        self.assertEqual(len(scope["workspaces"]), 2)

    def test_active_regular_workspace_filter_and_deduplication(self):
        records = workspace_records()
        records.extend([records[0].copy(), {"Id": "personal", "Name": "Personal", "Type": "Personal", "State": "Active"},
                        {"Id": "deleted", "Name": "Deleted", "Type": "Workspace", "State": "Deleted"},
                        {"Id": "monitoring", "Name": "Admin", "Type": "AdminWorkspace", "State": "Active"}])
        self.assertEqual(len(self.helpers["normalize_workspaces"](Frame(records), True)), 2)

    def test_cross_workspace_report_is_resolved_after_later_model_scan(self):
        access = FakeAccess()
        self.fabric.list_datasets.side_effect = lambda workspace: Frame(
            [{"Dataset ID": "model-b", "Dataset Name": "Sales"}] if workspace == WORKSPACE_B else []
        )
        self.fabric.PowerBIRestClient.return_value.get.side_effect = lambda url: response(
            [{"id": "report-a", "name": "Sales report", "datasetId": "model-b"}] if WORKSPACE_A in url else []
        )
        model = SimpleNamespace(Roles=[], Relationships=[], DataSources=[], Tables=[])

        @contextmanager
        def connect(**kwargs):
            self.assertTrue(kwargs["readonly"])
            access.events.append(("open", kwargs["workspace"]))
            try:
                yield SimpleNamespace(model=model)
            finally:
                access.events.append(("close", kwargs["workspace"]))

        result = self.helpers["collect_catalog"](self.fabric, self.admin, connect, access=access)
        report = result["reports"][0]
        self.assertEqual(report["binding_status"], "cataloged_model")
        self.assertEqual(report["model_workspace_id"], WORKSPACE_B)
        self.assertTrue(report["is_cross_workspace"])
        self.assertLess(access.events.index(("delete", WORKSPACE_A)), access.events.index(("add", WORKSPACE_B)))
        self.assertLess(access.events.index(("close", WORKSPACE_B)), access.events.index(("delete", WORKSPACE_B)))
        self.assertEqual(result["rows"]["security"][0]["scan_status"], "complete")
        self.assertEqual(access.events[-1], "finish")

    def test_model_enumeration_error_does_not_skip_reports(self):
        access = FakeAccess()
        self.fabric.list_datasets.side_effect = HttpError()
        self.fabric.PowerBIRestClient.return_value.get.return_value = response([{"id": "report", "datasetId": "unreadable"}])
        result = self.helpers["collect_catalog"](self.fabric, self.admin, Mock(), access=access)
        self.assertEqual(len(result["rows"]["errors"]), 2)
        self.assertEqual(len(result["reports"]), 2)
        self.assertTrue(all(report["binding_status"] == "uncataloged_model" for report in result["reports"]))
        self.assertEqual(sum(event[0] == "delete" for event in access.events if isinstance(event, tuple)), 2)

    def test_model_filter_does_not_narrow_report_only_workspaces(self):
        access = FakeAccess()
        result = self.helpers["collect_catalog"](
            self.fabric, self.admin, Mock(), workspace_name="Models", model_filter="Missing",
            report_workspace_name="Reports", access=access,
        )
        self.fabric.list_datasets.assert_called_once_with(workspace=WORKSPACE_B)
        self.assertEqual(len(result["report_scans"]), 1)
        self.assertEqual(result["report_scans"][0]["report_workspace_id"], WORKSPACE_A)

    def test_report_continuation_validation_is_preserved(self):
        client = Mock()
        client.get.return_value = response([{"id": "report", "datasetId": "model"}], "https://other.example/reports")
        reports, scans = self.helpers["collect_report_dependencies"](
            client, [{"workspace_id": WORKSPACE_A, "workspace_name": "Reports"}], [], "scan", "now",
        )
        self.assertEqual(len(reports), 1)
        self.assertEqual(scans[0]["scan_status"], "partial")
        client.get.assert_called_once()


class NotebookContractTests(unittest.TestCase):
    def test_helpers_have_unique_definitions(self):
        counts = Counter(node.name for node in notebook_nodes() if isinstance(node, (ast.FunctionDef, ast.ClassDef)))
        self.assertFalse([name for name, count in counts.items() if count > 1])

    def test_notebook_format_and_compilation(self):
        validate_notebook(str(NOTEBOOK), NOTEBOOK.read_bytes())

    def test_scoring_and_security_algorithms_are_unchanged(self):
        functions = {node.name: node for node in notebook_nodes() if isinstance(node, ast.FunctionDef)}
        for name, expected in SCORING_FINGERPRINTS.items():
            with self.subTest(function=name):
                actual = hashlib.sha256(ast.dump(functions[name], include_attributes=False).encode()).hexdigest()
                self.assertEqual(actual, expected)

    def test_complete_scoring_stages_are_unchanged(self):
        cells = json.loads(NOTEBOOK.read_text(encoding="utf-8"))["cells"]
        for anchor, expected in SCORING_STAGES.items():
            with self.subTest(stage=anchor):
                sources = ["".join(cell["source"]) for cell in cells
                           if cell["cell_type"] == "code" and anchor in "".join(cell["source"])]
                self.assertEqual(len(sources), 1)
                digest = hashlib.sha256(ast.dump(ast.parse(sources[0]), include_attributes=False).encode()).hexdigest()
                self.assertEqual(digest, expected)

    def test_all_fourteen_table_schemas_are_unchanged(self):
        names = {"identity_schema", "catalog_schemas", "similarity_schemas", "run_schema"}
        nodes = [node for node in notebook_nodes() if isinstance(node, ast.Assign)
                 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in names]
        namespace = {}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "<output-schemas>", "exec"), namespace)
        schemas = {name: namespace[name] for name in names}
        self.assertEqual(len(schemas["catalog_schemas"]) + len(schemas["similarity_schemas"]) + 1, 14)
        digest = hashlib.sha256(json.dumps(schemas, sort_keys=True).encode()).hexdigest()
        self.assertEqual(digest, "9f8de77e3696f90ab16958d3b8a531a979a6dda4e68db00ac445130ca5046b7a")

    def test_scoring_configuration_precedes_collection(self):
        nodes = notebook_nodes()
        settings = next(index for index, node in enumerate(nodes)
                        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
                        and node.targets[0].id == "SCORE_VERSION")
        writes = [index for index, node in enumerate(nodes)
                  if any(isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute)
                         and child.func.attr == "saveAsTable" for child in ast.walk(node))]
        self.assertTrue(writes)
        self.assertLess(settings, min(writes))


def code_cell_sources(path=NOTEBOOK):
    cells = json.loads(path.read_text(encoding="utf-8"))["cells"]
    return [(cell, "".join(cell["source"])) for cell in cells if cell["cell_type"] == "code"]


class NotebookParameterTests(unittest.TestCase):
    APP_PARAMETERS = {
        "WORKSPACE_NAME", "MODEL_NAME", "REPORT_WORKSPACE_NAME", "ENABLE_BLOCKING",
        "DUPLICATE_THRESHOLD", "SIMILAR_THRESHOLD", "CONTAINMENT_THRESHOLD",
    }

    def setUp(self):
        sources = code_cell_sources()
        self.parameter_cells = [(cell, source) for cell, source in sources
                                if "parameters" in cell["metadata"].get("tags", [])]
        self.scoring_source = next(source for _, source in sources if "SCORE_VERSION =" in source)

    def run_with(self, **overrides):
        namespace = {}
        exec(self.parameter_cells[0][1], namespace)
        namespace.update(overrides)
        exec(self.scoring_source, namespace)
        return namespace

    def test_single_parameters_cell_holds_only_literal_assignments(self):
        self.assertEqual(len(self.parameter_cells), 1)
        body = ast.parse(self.parameter_cells[0][1]).body
        self.assertTrue(all(isinstance(node, ast.Assign) for node in body))
        for node in body:
            ast.literal_eval(node.value)
        names = {node.targets[0].id for node in body}
        self.assertLessEqual(self.APP_PARAMETERS, names)

    def test_parameters_cell_precedes_scoring_settings(self):
        sources = [source for _, source in code_cell_sources()]
        self.assertLess(sources.index(self.parameter_cells[0][1]), sources.index(self.scoring_source))

    def test_defaults_are_unchanged(self):
        namespace = self.run_with()
        self.assertIsNone(namespace["WORKSPACE_NAME"])
        self.assertIs(namespace["ENABLE_BLOCKING"], True)
        self.assertEqual((namespace["DUPLICATE_THRESHOLD"], namespace["SIMILAR_THRESHOLD"],
                          namespace["CONTAINMENT_THRESHOLD"], namespace["HEATMAP_MIN_SCORE"]),
                         (0.95, 0.70, 0.95, 0.70))

    def test_injected_values_survive_scoring_settings(self):
        namespace = self.run_with(WORKSPACE_NAME="Sales", ENABLE_BLOCKING=False, DUPLICATE_THRESHOLD=0.9,
                                  SIMILAR_THRESHOLD=0.6, CONTAINMENT_THRESHOLD=1)
        self.assertEqual(namespace["WORKSPACE_NAME"], "Sales")
        self.assertIs(namespace["ENABLE_BLOCKING"], False)
        self.assertEqual((namespace["DUPLICATE_THRESHOLD"], namespace["SIMILAR_THRESHOLD"],
                          namespace["CONTAINMENT_THRESHOLD"], namespace["HEATMAP_MIN_SCORE"]), (0.9, 0.6, 1, 0.6))

    def test_blank_filters_mean_unfiltered(self):
        namespace = self.run_with(WORKSPACE_NAME="", MODEL_NAME="  ", REPORT_WORKSPACE_NAME="\t")
        self.assertEqual((namespace["WORKSPACE_NAME"], namespace["MODEL_NAME"], namespace["REPORT_WORKSPACE_NAME"]),
                         (None, None, None))

    def test_invalid_parameters_are_rejected(self):
        cases = {
            "non-string filter": {"MODEL_NAME": 5},
            "non-boolean blocking": {"ENABLE_BLOCKING": "false"},
            "non-boolean access": {"ENABLE_TEMPORARY_WORKSPACE_ACCESS": 1},
            "boolean threshold": {"DUPLICATE_THRESHOLD": True},
            "string threshold": {"CONTAINMENT_THRESHOLD": "0.9"},
            "zero threshold": {"SIMILAR_THRESHOLD": 0},
            "threshold above one": {"DUPLICATE_THRESHOLD": 1.5},
            "similar above duplicate": {"SIMILAR_THRESHOLD": 0.96},
        }
        for label, overrides in cases.items():
            with self.subTest(case=label), self.assertRaises(ValueError):
                self.run_with(**overrides)


if __name__ == "__main__":
    unittest.main()