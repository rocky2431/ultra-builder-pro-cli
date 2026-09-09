"""Tests for mnotes: the owner's acceptance is "find a past decision by keyword and
see which day it was recorded", so every test here asserts against that."""

import contextlib
import io
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import mnotes


def run(*argv, stdin=""):
    """Run the CLI, returning (exit_code, stdout)."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = mnotes.main(list(argv), stdin=io.StringIO(stdin))
    return code, out.getvalue()


class NotesTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.db = self.tmp / "notes.db"
        self.addCleanup(self._tmp.cleanup)

    def add(self, body, **kw):
        argv = ["--db", str(self.db), "add"]
        for key, value in kw.items():
            argv += ["--" + key.replace("_", "-"), value]
        return run(*argv, stdin=body)


class TestAddAndFind(NotesTestCase):
    def test_find_two_character_chinese_keyword(self):
        self.add("我们决定把预算砍掉一半，下周上线", date="2026-09-08", title="周会")
        code, out = run("--db", str(self.db), "find", "预算")
        self.assertEqual(code, 0)
        self.assertIn("预算砍掉一半", out)

    def test_find_reports_the_day_it_was_recorded(self):
        self.add("决定延后发布", date="2026-09-08", title="周会")
        code, out = run("--db", str(self.db), "find", "延后")
        self.assertEqual(code, 0)
        self.assertIn("2026-09-08", out)

    def test_multiple_keywords_must_all_match(self):
        self.add("决定砍预算", date="2026-09-01", title="A")
        self.add("决定加人力", date="2026-09-02", title="B")
        code, out = run("--db", str(self.db), "find", "决定", "预算")
        self.assertEqual(code, 0)
        self.assertIn("砍预算", out)
        self.assertNotIn("加人力", out)

    def test_ascii_keyword_is_case_insensitive(self):
        self.add("Decided to ship on Friday", date="2026-09-03", title="Standup")
        code, out = run("--db", str(self.db), "find", "DECIDED")
        self.assertEqual(code, 0)
        self.assertIn("Friday", out)

    def test_no_match_says_so_and_exits_nonzero(self):
        self.add("决定砍预算", date="2026-09-01", title="A")
        code, out = run("--db", str(self.db), "find", "招聘")
        self.assertEqual(code, 1)
        self.assertIn("没有", out)

    def test_defaults_to_today_when_no_date_given(self):
        self.add("随手记一条")
        code, out = run("--db", str(self.db), "find", "随手")
        self.assertEqual(code, 0)
        self.assertIn(mnotes.today(), out)

    def test_title_falls_back_to_first_line(self):
        self.add("季度复盘\n结论：不改架构")
        code, out = run("--db", str(self.db), "find", "不改架构")
        self.assertIn("季度复盘", out)

    def test_rejects_malformed_date(self):
        code, out = self.add("x", date="2026/09/08")
        self.assertEqual(code, 2)
        self.assertIn("YYYY-MM-DD", out)

    def test_rejects_empty_note(self):
        code, out = self.add("   \n  \n")
        self.assertEqual(code, 2)
        self.assertIn("空", out)

    def test_show_prints_the_full_body(self):
        self.add("第一行\n第二行\n第三行", date="2026-09-08", title="长会")
        _, out = run("--db", str(self.db), "find", "第二行")
        note_id = out.split("#", 1)[1].split()[0]
        code, out = run("--db", str(self.db), "show", note_id)
        self.assertEqual(code, 0)
        self.assertIn("第一行", out)
        self.assertIn("第三行", out)

    def test_show_unknown_id_exits_nonzero(self):
        code, out = run("--db", str(self.db), "show", "999")
        self.assertEqual(code, 1)
        self.assertIn("999", out)

    def test_list_shows_newest_day_first(self):
        self.add("旧的决定", date="2026-01-01", title="旧会")
        self.add("新的决定", date="2026-09-08", title="新会")
        code, out = run("--db", str(self.db), "list")
        self.assertEqual(code, 0)
        self.assertLess(out.index("新会"), out.index("旧会"))


class TestImport(NotesTestCase):
    def write(self, name, text):
        path = self.tmp / "src" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_imports_markdown_and_text_files(self):
        self.write("2026-09-08-周会.md", "决定把预算砍掉一半")
        self.write("随记.txt", "决定换供应商")
        code, out = run("--db", str(self.db), "import", str(self.tmp / "src"))
        self.assertEqual(code, 0)
        self.assertIn("2", out)
        _, found = run("--db", str(self.db), "find", "供应商")
        self.assertIn("换供应商", found)

    def test_date_comes_from_the_filename_when_present(self):
        self.write("2026-09-08-周会.md", "决定延后发布")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "find", "延后")
        self.assertIn("2026-09-08", out)

    def test_title_drops_the_date_prefix_the_heading_already_shows(self):
        self.write("2026-09-08-产品周会.md", "决定延后发布")
        self.write("20260901_架构评审.md", "决定不换数据库")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "list")
        self.assertIn("2026-09-08  产品周会", out)
        self.assertIn("2026-09-01  架构评审", out)

    def test_title_keeps_the_stem_when_it_is_only_a_date(self):
        self.write("2026-09-08.md", "决定延后发布")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "list")
        self.assertIn("2026-09-08  2026-09-08", out)

    def test_compact_date_in_filename_is_understood(self):
        self.write("20260908_周会.md", "决定延后发布")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "find", "延后")
        self.assertIn("2026-09-08", out)

    def test_falls_back_to_file_mtime_when_filename_has_no_date(self):
        path = self.write("周会.md", "决定延后发布")
        stamp = 1136214245
        os.utime(path, (stamp, stamp))
        expected = datetime.fromtimestamp(stamp).strftime("%Y-%m-%d")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "find", "延后")
        self.assertIn(expected, out)

    def test_reimport_is_idempotent(self):
        self.write("2026-09-08-周会.md", "决定延后发布")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        code, out = run("--db", str(self.db), "import", str(self.tmp / "src"))
        self.assertEqual(code, 0)
        self.assertIn("跳过 1", out)
        _, listed = run("--db", str(self.db), "list")
        self.assertEqual(listed.count("#"), 1)

    def test_edited_source_file_is_added_as_a_new_version_not_an_overwrite(self):
        path = self.write("2026-09-08-周会.md", "决定延后发布")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        path.write_text("决定延后发布\n补充：延两周", encoding="utf-8")
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        _, out = run("--db", str(self.db), "find", "延后")
        self.assertEqual(out.count("#"), 2, "the original wording must still be findable")

    def test_import_never_modifies_the_source_files(self):
        path = self.write("2026-09-08-周会.md", "决定延后发布")
        before = (path.read_bytes(), path.stat().st_mtime)
        run("--db", str(self.db), "import", str(self.tmp / "src"))
        self.assertEqual((path.read_bytes(), path.stat().st_mtime), before)

    def test_importing_a_single_file_works(self):
        path = self.write("2026-09-08-周会.md", "决定延后发布")
        code, _ = run("--db", str(self.db), "import", str(path))
        self.assertEqual(code, 0)
        _, out = run("--db", str(self.db), "find", "延后")
        self.assertIn("2026-09-08", out)

    def test_missing_path_exits_nonzero(self):
        code, out = run("--db", str(self.db), "import", str(self.tmp / "nope"))
        self.assertEqual(code, 2)
        self.assertIn("nope", out)

    def test_skips_unreadable_binary_and_reports_it(self):
        (self.tmp / "src").mkdir(parents=True, exist_ok=True)
        (self.tmp / "src" / "note.md").write_bytes(b"\xff\xfe\x00bad")
        code, out = run("--db", str(self.db), "import", str(self.tmp / "src"))
        self.assertEqual(code, 0)
        self.assertIn("读不了 1", out)


class TestFindOutput(NotesTestCase):
    def test_shows_only_the_matching_lines_of_a_long_note(self):
        body = "\n".join(["无关行"] * 30 + ["决定：砍预算"] + ["也无关"] * 30)
        self.add(body, date="2026-09-08", title="长会")
        _, out = run("--db", str(self.db), "find", "预算")
        self.assertIn("决定：砍预算", out)
        self.assertLessEqual(out.count("无关行"), 1)


if __name__ == "__main__":
    unittest.main()
