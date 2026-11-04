# Handoff: N-slug (slugify)

## 创建的接口

- `src/slug.cjs` 导出 `{ slugify }`（CommonJS）。
- `slugify(title: string): string`：
  - 把每一段 `[^A-Za-z0-9]+` 替换成单个 `-`，再转小写，最后去掉首尾各至多一个 `-`。
  - `slugify('  Hello, World! ')` → `hello-world`；`slugify('A--B')` → `a-b`；`slugify('!!!')` → `''`。
  - 非字符串（数字、`null`、`undefined`、对象、数组、`String` 包装对象、Symbol）抛 `TypeError`。
- 没有依赖，没有其他导出。

## 依赖节点须知

- 当前计划里没有其他节点依赖 N-slug；若以后有，调用 `require('./src/slug.cjs').slugify` 即可。
- 非 ASCII 字符一律被当作分隔符（`café au lait` → `caf-au-lait`）。这符合 spec 的 “ASCII only” 边界，没有做音译或去重音。
- 实现顺序是“先替换、后转小写”，理由见 `.ultra/rulings.md` 的 L2 条目（开尔文符号 U+212A 不能被折叠成 `k`）。

## 验证

- `ubp check C-slug`：基线红（`src/slug.cjs` 不存在），实现提交后绿。
- `ubp check`（所有 stale 检查）：M1 1/1 绿。
- 另用临时 `node -e` 脚本验证了 spec 之外的边界：空串、纯数字、首尾已有 `-`、换行/制表符、U+212A、10 万个连续 `-`（无回溯问题）、各类非字符串；这些脚本没有留在仓库里（测试文件在 scope 之外，不可改）。

## 未完成 / 备注

- 没有未完成项。
- `.ultra/ledger/evidence.jsonl` 在我开始前就是未跟踪文件，由引擎写入；它在 scope 之外且属 engine-owned，我没有提交也没有改动。
