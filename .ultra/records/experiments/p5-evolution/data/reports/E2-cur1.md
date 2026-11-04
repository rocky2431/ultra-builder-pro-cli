N-search 已完成：`ubp node done N-search` 输出 `node N-search: pass`，退出码 0，REQ-search 实现并通过。

## 提交（本地 `main`，未安装任何东西）

- `afc52f7` feat(search): find links by their target (REQ-search)，只改了 `src/server.cjs`
- `ec89bf0` docs(ultra): hand off N-search and record its rulings
- `d0f220c` chore(ultra): record N-search evidence and completion，这是引擎写的账本行（`.ultra/ledger/`），我没有手改

## 检查结果（全部在已提交的树上，经 `ubp check`）

- `ubp check C-search`：输出 `C-search: pass (exit-0)`，退出码 0。我在改动前用 `node --test` 单独跑过，当时 2 个测试都红，原因是服务忽略了 `q`，API 返回了全部 3 条链接。
- `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`：八项都是 `pass (exit-0)`，退出码 0。

## 实现要点

- **API 与页面共用一个函数**：新增 `find(text)` 和 `searchText(query)`，两者都在 `src/server.cjs`，`store.cjs` 没动（仍是九个导出）。
  - `GET /api/links?q=` 和 `GET /?q=` 都只列出 `url` 含该文本的链接。
  - 匹配把两边转小写后做子串包含，按字面，不用通配符，最新的排在前面。
  - 没有 `q`，或 `q` 为空，就列出全部。
- **页面**：在创建提示之后、列表之前加了一个 `GET /` 搜索表单，字段名 `q`，会回显搜索文字。搜不到时显示 `没有包含“…”的链接。`，不再是“还没有链接。”，文字已转义。
- **顺手修了一个真问题**：原来 `request.url.split('?')` 会丢掉第二个 `?` 之后的内容。结果 `?q=a?x` 被当成搜 `a`，而被搜的链接里带 `?` 很常见。我在 C-search 变绿之后先用探针复现了这个问题（API 和页面各 1 处失败），再改成只在第一个 `?` 处切，之后全部通过。这个改动作用于所有路由，只影响含第二个 `?` 的请求。

## 手工验证

- **探针**：56 项全部通过，涵盖字面匹配、编码和坏的 `%`、重复的 `q`、过期链接、XSS 转义、拒绝页，以及模拟浏览器提交表单。
- **真实浏览器**：用 headless Chrome（独立临时 profile）渲染了 `/?q=EXAMPLE.com` 和 `/?q=nothing-here`，版式正常。没有人在真实浏览器里真正敲字，提交这一步是用 `URLSearchParams` 模拟的。
- 探针脚本和数据都在 `/tmp` 下，仓库之外；起过的两个服务都按 PID 停掉了。

## 裁决与升级

- 升级给 Owner 的：无。
- 在 `.ultra/rulings.md` 记了三条 L2 裁决：
  - 匹配规则：只做简单转小写，不做 Unicode 完整折叠（实测 `ß` 与 `SS`、`İstanbul` 与 `istanbul` 互相找不到），过期链接也能搜到。
  - 参数解析：`+` 和 `%XX` 解码，重复的 `q` 取第一个，参数名区分大小写，以及上面那个 `?` 切分的改动。
  - `find` 放在 `server.cjs`、搜索表单放在列表上方，创建后的跳转不带搜索文字。

## 需要控制者注意（超出我的边界，没改）

- **M3 没有 journey 检查**：`plan.json` 里 M3 只列了 REQ-search，“输入长链接的一部分，只看到包含它的链接”这条验收，只靠 C-search 的页面测试和我的手工探针覆盖。
- **C-search 只钉住了很小一部分行为**：`?`、`+`、`%XX`、`*`/`%`/`_` 字面、坏 `%`、重复 `q`、过期链接、`q` 转义、无匹配文案都没有检查覆盖，这些写在了交接记录的未完成项里。
- 提交 `d0f220c` 里有 18 行证据，其中 9 行是我开工时就已存在的未提交基线（含那次红的 C-search）。

交接记录：`/tmp/evo/E2-cur1/.ultra/records/handoffs/N-search.md`
