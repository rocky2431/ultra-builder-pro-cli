# spec/ — 三层契约定义

Phase 1 产物。所有跨 Phase / 跨模块的 schema 在这里**单源**定义，后续 Phase
只引用，不再发明新 schema（PLAN R19）。

## 目录

```
spec/
├── README.md                   # 本文
├── mcp-tools.yaml              # MCP tool schema（OpenAPI 3 风格）
├── cli-protocol.md             # CLI 输入输出约定 + tool↔CLI 映射表
├── schemas/                    # JSON Schema / SQL schema
│   ├── state-db.sql            # SQLite 权威源 schema（7 表）
│   ├── tasks.v4.5.schema.json  # tasks.json 投影视图 schema
│   ├── context-file.v4.5.schema.json # context md 投影视图 schema
│   └── skill-manifest.schema.json    # skill frontmatter 规范
├── fixtures/
│   ├── valid/                  # 应通过校验的样例
│   └── invalid/                # 应被拒的样例（命名同 schema）
├── scripts/                    # 校验脚本（npm run test:spec 入口）
│   ├── test-all.cjs            # 聚合 runner
│   ├── validate-json-schemas.cjs
│   ├── validate-state-db.cjs
│   ├── validate-skills.cjs
│   └── check-cli-mapping.cjs
└── migration-notes.md          # skill / 数据格式过渡说明（按需追加）
```

## 命名约定

- JSON Schema 文件名：`<name>.schema.json`
- 对应的合法 fixture：`fixtures/valid/<name>.json`（可为单对象或数组）
- 对应的非法 fixture：`fixtures/invalid/<name>.json`（每条都应被拒）
- SQL schema：`<name>.sql`，fixtures 为 `fixtures/valid/<name>.fixtures.sql`
  和 `fixtures/invalid/<name>.invalid.sql`

## 跑校验

```
npm run test:spec
```

退出码 0 = 全绿，非 0 = 至少一处不一致。子脚本对缺失的 schema/fixture 静默
skip，方便 Phase 1.x 增量推进。

## 不要做

- 不要在代码里 hardcode 任何字段名/枚举值——从这里 import / generate
- 不要在 spec/ 之外另建 schema
- 不要手改 `.ultra/state.db` 投影出来的 tasks.json / context md（投影器会覆盖）
