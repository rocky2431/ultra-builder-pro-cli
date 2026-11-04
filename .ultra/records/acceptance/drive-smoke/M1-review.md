Reviewer: claude -p (opus), fresh session

# M1（slugify）整分支评审

依据：`.ultra/spec.md`（Direction 与 REQ-slug；spec 里没有单独的 Interface 一节，接口写在 REQ-slug 正文中：`require('./src/slug.cjs').slugify(title)`）、`.ultra/plan.json`、`.ultra/checks.json`、`.ultra/ledger/plan-log.jsonl`（只有一条 M1 baseline）、`.ultra/rulings.md`（一条 L2）、`.ultra/records/handoffs/N-slug.md`、`.ultra/.runtime/briefs/N-slug.md`，以及里程碑 diff。
`.ultra/ledger/milestones.jsonl` 从未存在（`git log -- .ultra/ledger/milestones.jsonl` 输出为空），所以里程碑 diff 取根提交到 HEAD：`bcfcc15`（搭建，红检查）→ `c4228ff`（plan 基线）→ `bc48843`（`src/slug.cjs`）→ `c6d2978`（handoff + ruling）。

所有实验都在仓库外的 `/tmp/m1rev.8UXWtL/` 下进行：`head/` 是 `git archive HEAD` 的未修改副本；`mutants/NN/` 是坏副本（各自 `git init` 后用真实引擎 `eval "$UBP check C-slug"` 跑过）；`scripts/` 是驱动与变异脚本。没有启动任何服务器。

## 发现

### F1 · L1 验收 · C-slug 证明不了 REQ-slug：12 个坏副本里有 7 个能让它变绿（主要问题）

C-slug 只钉住了 spec 的三个示例，外加 `slugify(42)` 抛 `TypeError`。我在坏副本上跑了 C-slug：先用与引擎相同的方式跑原始命令（在副本根目录执行 `sh -c`，判定标准是退出码加上 `expect` 正则 `^ℹ pass [1-9][0-9]*$`，带 `mu` 标志），再在 `git init` 后的副本里用真实引擎 `ubp check C-slug` 复核。两种方式结果一致：

| # | 坏副本（只改 `src/slug.cjs`） | C-slug | 违反 REQ-slug 的实际输出（HEAD vs 坏副本） |
|---|---|---|---|
| 00 | 对照：HEAD 原样 | pass | — |
| 01 | 先整体 `toLowerCase()` 再替换（就是 L2 裁决否决的那种写法） | **pass** | `'aKb'`：`"a-b"` vs `"akb"` |
| 02 | 数字也当分隔符（`/[^A-Za-z]+/g`） | **pass** | `'Top 10 Tips'`：`"top-10-tips"` vs `"top-tips"` |
| 03 | 用 `\W+`（保留 `_`） | **pass** | `'snake_case'`：`"snake-case"` vs `"snake_case"` |
| 04 | 删掉 `typeof` 守卫 | **pass** | `new String('A B')`：抛 `TypeError` vs 返回 `"a-b"` |
| 05 | NFD 去重音后再处理 | **pass** | `'café'`：`"caf"` vs `"cafe"`；`'aKb'`：`"a-b"` vs `"akb"` |
| 06 | `toLocaleLowerCase('tr-TR')` | **pass** | `'TITLE'`：`"title"` vs `"tıtle"`（输出里出现非 ASCII 字符） |
| 07 | 只查表返回三个 spec 示例，其余原样返回 | **pass** | `'Hello World'`：`"hello-world"` vs `"Hello World"` |
| 08 | 不抛错，改用 `String(title)` 强转 | fail | — |
| 09 | 不合并连续分隔符 | fail | — |
| 10 | 只去掉开头的 `-` | fail | — |
| 11 | 不转小写 | fail | — |
| 12 | 抛 `Error` 而不是 `TypeError` | fail | — |

引擎复核结果：01–07 是 `C-slug: pass (exit-0) M1 · 1/1 绿`，08–12 是 `C-slug: fail (exit-1)`。

REQ-slug 里没被钉住的条款有四条：
- `0-9` 要保留（02）。
- `_` 以及空格、`,`、`!`、`-` 之外的 ASCII 标点要变成 `-`（03）。
- 只转小写 ASCII 字母，非 ASCII 一律算分隔符（01、05、06；spec Direction 里的 "ASCII only" 边界也在这里）。
- 非字符串抛 `TypeError`：测试只用了 `42`，而删掉守卫后 `42.replace` 本来就会抛原生的 `TypeError`，所以这条测试分辨不出守卫在不在（04）。

07 说明这个检查目前只是示例检查，不是规则检查。

补强方案已在临时副本里验证过：把下面 5 条测试追加到 `test/slug.test.cjs` 后，HEAD 是 `ℹ pass 9 ℹ fail 0`，01–12 每个坏副本至少挂一条（01 挂非 ASCII 那条，02 挂数字和下划线，03 挂下划线，04 挂 boxed String，05 挂非 ASCII，06 挂只转 ASCII 那条，07 挂 4 条）：

```js
test('digits are kept', () => assert.equal(load()('Top 10 Tips 2026'), 'top-10-tips-2026'));
test('underscore and other ASCII punctuation become a dash',
  () => assert.equal(load()('snake_case.v2/final'), 'snake-case-v2-final'));
test('non-ASCII characters are separators, never letters', () => {
  assert.equal(load()('café au lait'), 'caf-au-lait');
  assert.equal(load()('aKb'), 'a-b'); // Kelvin sign must not fold to "k"
});
test('only ASCII letters are lowercased', () => assert.equal(load()('TITLE IN CAPS'), 'title-in-caps'));
test('a boxed String is not a string', () => assert.throws(() => load()(new String('A B')), TypeError));
```

改动成本：只改测试文件，`checks.json` 不动。检查指纹是 `sha256(JSON.stringify([run, timeout, expect]))`（engine `loading.cjs:14`，FORMATS.md:145），不包含测试文件内容，所以 plan-log 不会变。这是加强不是削减，也不需要 `ubp approve`。改动会改变代码指纹，C-slug 变 stale，之后重跑 `ubp check` 即可。
测试文件在 C-slug 的 `run` 里，writer 碰它会触发 drive 的 `check-touched`（engine `drive.cjs` `boundary()`），所以只能由验收作者或 Owner 来改。writer 在 handoff 里如实写了"另用临时脚本验证了 spec 之外的边界……测试文件在 scope 之外，不可改"，但没有按 brief 的 "If a check … looks wrong, stop and escalate" 升级。透明度没问题，只是没有走升级渠道。

### F2 · L2 设计 · 替换后再小写的裁决是对的，但没有检查守护

`.ultra/rulings.md` 里的 L2 裁决（先替换 `[^A-Za-z0-9]+` 再 `toLowerCase()`）推理正确。其实 spec 原文就要求这种行为："ASCII letters are lowercased" 加上 "characters other than `a-z` and `0-9` become `-`"，而 U+212A 不是 ASCII 字母，所以必须变成 `-`。实测 HEAD 输出 `slugify('aKb') === 'a-b'`，代码注释和提交信息与实现一致。
问题在于：裁决里写的"判断错了只需对调一行即可恢复"，前提是有人能发现。目前反向改动（坏副本 01）照样让 C-slug 变绿，所以这条裁决随时可能被悄悄推翻。F1 方案里的 Kelvin 断言能补上这个缺口。这里不需要单独改动，只是记下它与 F1 的关系。

### F3 · L2 设计（记录） · 引擎账本没有提交，HEAD 的新克隆看不到 N-slug 已完成

`.ultra/ledger/evidence.jsonl` 和 `.ultra/ledger/nodes.jsonl` 都是未跟踪文件（`git status --short --ignored` 只列出这两个 `??` 和 `!! .ultra/.runtime/`）。FORMATS.md:53 写的是 "The ledgers are committed project history, like the truth files"，并要求项目在 `.gitattributes` 里加 `.ultra/ledger/*.jsonl merge=union`，本仓库没有这个文件。
实测：工作树副本的 `ubp status` 是 `M1 · 1/1 绿 · 下一项 里程碑门`，而 `git archive HEAD` 后 `git init` 的副本是 `M1 · 0/1 绿 · 1 未知 · 下一项 N-slug`。也就是说，只看提交历史，N-slug 的完成记录和红→绿证据都不存在。
这不是代码问题。`evidence.jsonl` 在 writer 开始前就已经是未跟踪状态。writer 在报告里明确说了没提交，并询问是否需要提交（drive 的 `exempt` 允许提交这两个文件）。引擎不把自己的未跟踪账本算作 dirty，所以 `milestone close` 不会因此受阻；风险是历史丢失。建议在关闭 M1 的那次提交里一并提交这两个账本和 `.gitattributes`。

### F4 · L4 实现 · 未发现缺陷

- HEAD 未修改副本（`git archive HEAD`）：`node --test --test-reporter=spec test/slug.test.cjs` 输出 `ℹ pass 4 ℹ fail 0`，exit 0。`git init` 后 `ubp gate` 输出 `gate: pass`，`ubp check` 输出 `C-slug: pass (exit-0)`。工作树与 HEAD 在 `.ultra` 之外逐字节相同（`diff -r`），被忽略的只有 `.ultra/.runtime/`，不存在只活在被忽略文件里的修复。
- 手动驱动（`require(<head>/src/slug.cjs).slugify`，输入均按码位核对过）：
  - spec 三例分别得到 `"hello-world"`、`"a-b"`、`""`。
  - `'Top 10 Tips 2026'`→`"top-10-tips-2026"`；`'snake_case_title'`→`"snake-case-title"`；`'a.b/c\\d'`→`"a-b-c-d"`。
  - `''`、`'---'` 都得到 `""`；`'-a-'`→`"a"`；`'\tTab\nNew\r\nLine\n'`→`"tab-new-line"`。
  - `café au lait`→`"caf-au-lait"`；U+212A→`-`；U+0130、全角 `ＡＢ`、阿拉伯-印度数字、`ß` 都算分隔符；emoji 和孤立代理项各自变成一个 `-`。
  - 非字符串（`42`、`null`、`undefined`、`{}`、`[]`、`['a']`、`new String('A B')`、`Symbol()`、`10n`、`true`、带 `toString` 的对象、不传参数）全部抛 `TypeError`，消息形如 `slugify expects a string, got number`。
  - 所有字符串输出都匹配 `^[a-z0-9-]*$`。
- 性能：100 万个 `-` 用 0.6 ms；100 万字符的 `"a-"` 交替串用 27 ms；`"!a"` 交替串用 15 ms。是线性的，没有回溯问题。
- 范围：`bc48843` 只动了 `src/slug.cjs`（node scope `src/`）；`c6d2978` 只动了 handoff 和 rulings（brief 要求写，drive 也允许）。没有碰真值文件或检查文件。
- handoff 里的接口描述、"首尾各至多一个 `-`"、非字符串清单、红→绿证据（evidence 第 1–2 行在 code `b90c…` 上 fail，第 3–5 行在 code `cfc5…` 上 pass）都与实测一致。

### F5 · L0 方向 · 不需要改方向，但成功标准目前是空的

Direction 写的是 "Success: REQ-slug's check is green"，把成功等同于检查变绿。按 F1，现在一个查表实现也能满足这个标准。修完 F1 后，这句话就重新有意义了，Direction 本身不用改。

## What must be said to the Owner

1. 代码没问题，不用改。`src/slug.cjs` 在我能想到的所有输入上都符合 REQ-slug，包括非 ASCII、各种非字符串、百万字符输入。
2. 但 M1 的验收检查 C-slug 证明不了 REQ-slug。我做了 12 个故意改坏的副本，其中 7 个能让 C-slug 变绿：把数字当分隔符的、保留下划线的、把 Kelvin 符号折叠成 `k` 的，甚至一个只会背三条示例的查表实现。现在关闭 M1，C-slug 就会作为长期回归保护留下来，而它守不住这些条款。
3. 建议在 `test/slug.test.cjs` 末尾追加 F1 里的 5 条断言。已在临时副本验证：HEAD 9/9 通过，7 个漏网的坏副本全部被抓住。这只改测试文件，`checks.json`、plan-log 都不动，也不需要 `ubp approve`；但 writer 不能改这个文件，需要你或验收作者来加，加完重跑 `ubp check`。
4. 有一处需要你拍板：`new String('A B')`（boxed String）算不算"不是字符串"？现在的实现会抛 `TypeError`，我认为应该抛，也写进了建议的测试。如果你不想把它钉死，就删掉最后那条断言。代价是类型守卫基本测不到，不过风险很低。
5. 关闭 M1 时，请把 `.ultra/ledger/evidence.jsonl`、`.ultra/ledger/nodes.jsonl` 和一个含 `.ultra/ledger/*.jsonl merge=union` 的 `.gitattributes` 一起提交。否则从 Git 历史里看不到 N-slug 已完成（新克隆的 `ubp status` 会显示 `下一项 N-slug`）。
6. Direction 把成功定义为"检查变绿"，这句话只有在第 3 条做完之后才名副其实。

Verdict: revise
