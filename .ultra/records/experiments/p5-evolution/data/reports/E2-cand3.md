N-search 完成：`C-search` 变绿，前面八条检查仍然全绿，`ubp node done N-search` 通过，工作区已干净。

## 提交（本地 `main`，没有安装任何东西）
- `b59ca01` feat(search): find links by their target (REQ-search)
- `0f2428a` docs(ultra): hand off N-search and record its rulings
- `375ff1a` chore(ultra): record N-search evidence and completion

第三条是引擎自己写的账本（`evidence.jsonl`、`nodes.jsonl`），我没有手改，只是提交，和 N-delete 的做法一致。

任务启动时的通用说明写着“不要提交”，但任务书明确要求本地提交，所以我按任务书做了。

## 检查结果
- 改动前，在已提交的树上：`C-search: fail (exit-1)`。
- 改动后（`b59ca01`、`0f2428a` 之上）：
  - `ubp check C-search`：`C-search: pass (exit-0)`，退出码 0。
  - `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`：八条都是 `pass (exit-0)`，退出码 0。
  - `ubp node done N-search`：`node N-search: pass`，退出码 0。
- 引擎状态：`M3 · 1/1 绿 · 下一项 里程碑门`。

## 改了什么
- 只改了 `src/server.cjs`（+36/-12）。新函数 `findLinks(text)` 同时服务 API 和网页，`store.cjs` 没动。
- 网页多了一个 `GET /` 的搜索表单，字段 `q` 会把搜索文字原样显示回来。
- 搜索没有结果时，页面显示“没有链接包含这段文字。”，不再说“还没有链接。”。

## 检查没覆盖、我手工探出来的问题
- **原有 bug**：原来的 `request.url.split('?')` 会在第二个 `?` 处截断，`?q=a?b` 会被读成 `a`。我改成只在第一个 `?` 处切分。对比改动前的服务器，没带 `q` 的 22 个请求，状态、头和正文都没变。
- **大小写**：每边各 `toLowerCase()` 再 `includes` 对希腊字母会漏找。例如链接里是 `οδοσ`，用 `ΟΔΟΣ` 搜就找不到。我改用转义后的 `iu` 正则，这样能找到。
- **检查的缺口**：`C-search` 的两个测试，在没转义、旧切分、`toLowerCase` 这三个故意写坏的副本上全部通过，所以它盯不住这些情况。我的手工探针在这三个副本上都变红。
- **手工探针**（脚本在仓库外）：123 个用例全过，涵盖字面匹配、非 ASCII 大小写、`+`、`%2B`、坏的 `%`、HTML 转义、超长 `q`、新建/点击/过期/删除后的结果、重启后的结果。另外 400 个随机查询与对照实现一致。
- **真实 Chrome**：我用 Playwright 驱动 Chrome，在搜索框里输入内容并提交，结果列表和回显都正确。

## 裁决和升级
- 没有需要升级给 Owner 的事项。
- `.ultra/rulings.md` 新增 6 条 L2 裁决：
  - `findLinks` 放在 `server.cjs`
  - 用 `iu` 正则做大小写
  - `q` 的解码方式（`+` 是空格，只含空白的 `q` 按字面匹配）
  - 在第一个 `?` 处切分
  - 页面新增文字
  - 只搜存下来的 `url` 原文，过期的照常能搜到

## 未验证和需要你知道的
- 只在一个 Chrome 里试过。
- 探针脚本不在仓库里，位置是 `/tmp/ns-probe/scripts/`（`probe.cjs`、`diff.cjs`、`browser.py` 等）。
- 没有运行里程碑门，那是下一步。
- `/tmp/ns-probe/` 里有四个不是我写的文件和一份 `probe.cjs`：`fuzz.cjs`、`readonly.sh`、`run1.log`、`run2.log`，时间戳落在我这次会话期间，像是别的进程也用了同名目录。我只删过自己建的子目录，没有碰它们，也没有用 pattern 杀进程；所有服务都按 PID 停掉，最后确认没有残留。

交接记录在 `/tmp/evo/E2-cand3/.ultra/records/handoffs/N-search.md`。
