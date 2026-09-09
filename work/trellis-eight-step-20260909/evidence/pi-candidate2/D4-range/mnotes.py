#!/usr/bin/env python3
"""mnotes — a single-person archive for meeting notes, built for one job:
find a past decision by keyword and see which day it was recorded.

Stdlib only. Nothing leaves this machine. Source files are only ever read.
"""

import argparse
import hashlib
import os
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

TEXT_SUFFIXES = {".md", ".markdown", ".txt", ".text"}

# Search is a substring scan in SQL, not a full-text index. Ceiling: fine for one
# person's notes (tens of thousands of entries scan in well under a second); it
# degrades linearly past that. Upgrade path: an FTS5 index — but NOT the trigram
# tokenizer, which silently returns zero hits for two-character Chinese keywords
# like 预算 or 决定. A CJK-aware tokenizer (jieba/ICU) would be required, which
# means a dependency this version deliberately avoids.
SCHEMA = """
CREATE TABLE IF NOT EXISTS notes (
    id           INTEGER PRIMARY KEY,
    occurred_on  TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    source       TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (source, content_hash)
);
CREATE INDEX IF NOT EXISTS notes_by_day ON notes (occurred_on DESC);
"""


def today():
    return datetime.now().strftime("%Y-%m-%d")


def default_db():
    return os.environ.get("MNOTES_DB") or str(Path(__file__).resolve().parent / "data" / "notes.db")


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def parse_day(text):
    """Return a normalized YYYY-MM-DD, or None if it is not a real date."""
    try:
        return datetime.strptime(text, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def day_from_filename(name):
    for pattern, fmt in ((r"\d{4}-\d{2}-\d{2}", "%Y-%m-%d"), (r"\d{8}", "%Y%m%d")):
        match = re.search(pattern, name)
        if not match:
            continue
        try:
            return datetime.strptime(match.group(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def title_from_filename(stem):
    """The heading already prints the day, so drop a leading date from the title."""
    trimmed = re.sub(r"^(\d{4}-\d{2}-\d{2}|\d{8})[\s_.-]*", "", stem)
    return trimmed or stem


def first_line(body):
    for line in body.splitlines():
        if line.strip():
            return line.strip().lstrip("# ").strip() or "(无标题)"
    return "(无标题)"


def store(conn, *, occurred_on, title, body, source):
    """Insert a note. Returns its id, or None when this exact content from this
    exact source is already archived. Never updates or deletes an existing row."""
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    cursor = conn.execute(
        "INSERT OR IGNORE INTO notes"
        " (occurred_on, title, body, source, content_hash, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (occurred_on, title, body, source, digest, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    return cursor.lastrowid if cursor.rowcount else None


def search(conn, keywords):
    clauses = " AND ".join(["(title || char(10) || body) LIKE '%' || ? || '%'"] * len(keywords))
    return conn.execute(
        f"SELECT * FROM notes WHERE {clauses} ORDER BY occurred_on DESC, id DESC",
        list(keywords),
    ).fetchall()


def matching_lines(body, keywords, limit=3):
    lowered = [k.lower() for k in keywords]
    hits = [line.strip() for line in body.splitlines()
            if line.strip() and any(k in line.lower() for k in lowered)]
    if not hits:
        hits = [first_line(body)]
    return hits[:limit], len(hits) > limit


def note_heading(row):
    return f"#{row['id']}  {row['occurred_on']}  {row['title']}"


# --- commands ---------------------------------------------------------------

def cmd_add(args, stdin):
    body = (args.message if args.message is not None else stdin.read()).strip("\n")
    if not body.strip():
        print("笔记是空的，没有存。用 --message 传内容，或把内容从标准输入喂进来。")
        return 2

    occurred_on = today() if args.date is None else parse_day(args.date)
    if occurred_on is None:
        print(f"日期 {args.date!r} 认不出来，请用 YYYY-MM-DD，例如 2026-09-08。")
        return 2

    title = args.title.strip() if args.title else first_line(body)
    conn = connect(args.db)
    note_id = store(conn, occurred_on=occurred_on, title=title, body=body, source="stdin")
    if note_id is None:
        print(f"这条内容已经存过了（{occurred_on}  {title}），没有重复存。")
        return 0
    print(f"已存 #{note_id}  {occurred_on}  {title}")
    return 0


def cmd_import(args, stdin):
    root = Path(args.path).expanduser()
    if not root.exists():
        print(f"找不到 {root}，没有导入任何东西。")
        return 2

    if root.is_file():
        candidates = [root]
    else:
        candidates = sorted(p for p in root.rglob("*")
                            if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES)

    conn = connect(args.db)
    imported = skipped = unreadable = 0
    for path in candidates:
        try:
            body = path.read_text(encoding="utf-8").strip("\n")
        except (UnicodeDecodeError, OSError):
            unreadable += 1
            print(f"  读不了，跳过：{path}")
            continue
        if not body.strip():
            skipped += 1
            continue
        occurred_on = day_from_filename(path.name) or datetime.fromtimestamp(
            path.stat().st_mtime).strftime("%Y-%m-%d")
        title = title_from_filename(path.stem)
        note_id = store(conn, occurred_on=occurred_on, title=title,
                        body=body, source=str(path.resolve()))
        if note_id is None:
            skipped += 1
        else:
            imported += 1
            print(f"  + #{note_id}  {occurred_on}  {title}")

    print(f"导入 {imported} 条，跳过 {skipped} 条（已存在或为空），读不了 {unreadable} 个文件。")
    print("原文件一个字都没改。")
    return 0


def cmd_find(args, stdin):
    conn = connect(args.db)
    rows = search(conn, args.keywords)
    if not rows:
        print(f"没有找到同时含 {' '.join(args.keywords)} 的记录。")
        return 1

    for row in rows:
        print(note_heading(row))
        lines, truncated = matching_lines(row["body"], args.keywords)
        for line in lines:
            print(f"    {line}")
        if truncated:
            print(f"    …（还有更多命中，用 show {row['id']} 看全文）")
        if row["source"] != "stdin":
            print(f"    来源：{row['source']}")
        print()
    print(f"共 {len(rows)} 条。")
    return 0


def cmd_show(args, stdin):
    conn = connect(args.db)
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (args.id,)).fetchone()
    if row is None:
        print(f"没有 #{args.id} 这条记录。")
        return 1
    print(note_heading(row))
    if row["source"] != "stdin":
        print(f"来源：{row['source']}")
    print("-" * 40)
    print(row["body"])
    return 0


def cmd_list(args, stdin):
    start = parse_day(args.date_from) if args.date_from else None
    end = parse_day(args.date_to) if args.date_to else None
    if (args.date_from and start is None) or (args.date_to and end is None):
        print("日期认不出来，请用 YYYY-MM-DD，例如 2026-09-08。")
        return 2
    if start and end and start > end:
        print("起始日期不能晚于结束日期。")
        return 2

    conn = connect(args.db)
    conditions = []
    params = []
    if start:
        conditions.append("occurred_on >= ?")
        params.append(start)
    if end:
        conditions.append("occurred_on <= ?")
        params.append(end)
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    params.append(args.limit)
    rows = conn.execute(
        f"SELECT * FROM notes{where} ORDER BY occurred_on DESC, id DESC LIMIT ?", params
    ).fetchall()
    if not rows:
        print("这段时间里没有记录。")
        return 0
    for row in rows:
        print(note_heading(row))
    print(f"共 {len(rows)} 条。")
    return 0


def build_parser():
    parser = argparse.ArgumentParser(
        prog="mnotes", description="会议记录归档与关键词检索（单机、单人）")
    parser.add_argument("--db", default=default_db(), help="数据库路径（默认 ./data/notes.db）")
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add", help="存一条会议记录（内容来自 --message 或标准输入）")
    add.add_argument("-m", "--message", help="记录正文；省略则从标准输入读取")
    add.add_argument("-d", "--date", help="这条是哪天记的，YYYY-MM-DD，默认今天")
    add.add_argument("-t", "--title", help="标题，默认取正文第一行")
    add.set_defaults(func=cmd_add)

    imp = sub.add_parser("import", help="把已有的 .md/.txt 文件导进来（只读原文件）")
    imp.add_argument("path", help="一个文件或一个目录（目录会递归）")
    imp.set_defaults(func=cmd_import)

    find = sub.add_parser("find", help="按关键词找回记录，结果带日期")
    find.add_argument("keywords", nargs="+", help="多个关键词是「都要命中」")
    find.set_defaults(func=cmd_find)

    show = sub.add_parser("show", help="按编号看某条记录的全文")
    show.add_argument("id", type=int)
    show.set_defaults(func=cmd_show)

    listing = sub.add_parser("list", help="按日期倒序列出记录，可按时间段筛选")
    listing.add_argument("-n", "--limit", type=int, default=20)
    listing.add_argument("--from", dest="date_from", help="起始日期（含），YYYY-MM-DD")
    listing.add_argument("--to", dest="date_to", help="结束日期（含），YYYY-MM-DD")
    listing.set_defaults(func=cmd_list)

    return parser


def main(argv=None, stdin=None):
    args = build_parser().parse_args(argv if argv is not None else sys.argv[1:])
    return args.func(args, stdin if stdin is not None else sys.stdin)


if __name__ == "__main__":
    sys.exit(main())
