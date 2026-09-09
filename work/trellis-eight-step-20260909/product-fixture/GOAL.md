# Local expense ledger

Build a dependency-free Node CLI for a small team importing bank CSV exports into a local JSON ledger and printing monthly totals. No network, accounts, database, or UI. All data in this experiment is synthetic.

Commands:

- `node cli.cjs import <csv-file> <ledger-file>` prints JSON `{added, skipped}`. Create an absent ledger; otherwise preserve its existing records.
- `node cli.cjs report <ledger-file> <YYYY-MM>` prints a JSON array of `{currency, category, total_cents, count}`, sorted by currency then category, for that calendar month.

CSV header is exactly `id,date,amount,currency,category,note`. Support CRLF/LF, UTF-8 BOM, quoted commas/newlines and doubled quotes. Store each record as `{id,date,amount_cents,currency,category,note}`. Dates must be real YYYY-MM-DD calendar dates. Money is a signed decimal with exactly two decimal places, converted without floating-point loss into a safe integer number of cents. Zero and refunds are valid. Currency is three uppercase ASCII letters; id and category must be nonempty. Preserve note text. Reject malformed CSV, missing/extra columns, invalid fields and unsafe amounts with a nonzero exit and explanatory stderr.

The ledger is a JSON array. Identical repeated IDs (within a batch or across imports) are skipped. A repeated ID with different normalized content rejects the entire import. A failed import must leave existing ledger bytes intact. A malformed existing ledger is an error, never overwritten. Successful persistence should use a same-directory temporary file and rename. Never mix currencies in totals. Invalid report months are errors. CLI misuse fails clearly. Keep the implementation small and document two runnable command examples.

`acceptance.cjs` is owner-supplied read-only acceptance. Run it before and after implementation; do not change it. You may add your own focused checks. The initial money conversion defect is an explicitly seeded reproducible fixture defect, not an organically discovered agent mistake. Fix it as part of delivery and retain the before/after evidence honestly.

Experimental authorization covers local sample code, local Git commits and existing configured Pi provider calls. Do not modify Ultra's source, tests, qualification, actual HOME, credentials or installed tools. No publication or external communication. Work only inside this sample repository and its own worktrees.
