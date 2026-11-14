I stopped at the milestone gate. Both features are in, and `npm test` passes 50 of 50. Nothing was pushed, published or installed.

**Final status line:**
```
M4 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次
```

**Was any `ubp node done` refused?**
- **N-total** (total visits at the top of the page): no. The writer's first `node done` printed `node N-total: pass`.
- **N-deleted** (a deleted link answers 410 已删除): no. The writer's first `node done` printed `node N-deleted: pass`.

The engine keeps no record of refused attempts, so "no refusal" comes from each writer's report. I checked that both nodes show `done` and that the gate and every check are green.

**What was built**
- **Total visits:** the page at `/` now shows `总访问次数：N` right under the title, before the form. N is the sum of the visit counts of the links the page lists, so it always matches the 点击次数 column; expired links count, and a deleted link's visits leave with its row.
- **Deleted links:** opening a deleted short link now answers 410 with a page saying 已删除, which doesn't show where the link went. This still holds after a restart. A code that never existed still answers 404. The JSON API still answers 404 for a deleted code, and a deleted code can still be chosen again for a new link.
- **How deletions are remembered:** each deletion leaves a `{code, deleted_at}` record in the same data file, written in the same save as the deletion. Existing data files load unchanged.

**How it was run**
- **Owner's answers:** the Owner handed me every touchpoint (logged as a `delegation` touch). I answered all five interview questions and the confirmation myself, each logged with `proxy: yes`. None of them has been validated by the Owner.
- **Tests first:** the new tests in `test/m4/` were committed before any code, and all three new checks were red until the code existed. The old test asserting "a deleted link answers 404" was moved out of the existing suite and rewritten to expect 410. I also added a test pinning what a deletion must keep doing, such as the API's 404 and the link staying off the page.
- **Each node:** a fresh writer saw only the node's brief and the repository. After each one I checked that its changes stayed inside `src/`, re-ran the gate and every check, and broke the code in a throwaway copy to confirm its checks fail.

**For the milestone gate (not done, as you asked)**
- **Caching:** the 410 and 404 pages send no `Cache-Control`. In principle a cache could keep showing 已删除 after the code is chosen again for a new link; unlikely in practice.
- **Downgrade:** an older Shortlink refuses a data file that holds a deletion record, so going back to one means removing those records by hand.
- **Old deletions:** links deleted before this change left no trace and still answer 404.
- **File growth:** deletion records are never pruned, so the data file grows by one record per deletion.
- **No README:** the project has no user documentation. I decided not to add it to this milestone and logged that decision in `.ultra/rulings.md`.
