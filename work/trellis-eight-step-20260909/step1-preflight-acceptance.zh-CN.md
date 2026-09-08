# 第一步前置修复：独立验收

接受范围只有三个文件：`tests/owner-journeys-eval.test.cjs` 用显式测试文件参数修复 Node 25 下目录参数无法运行缺陷断言的问题；`package.json` 与 lock 将 js-yaml 从 4.3.1 补到 4.3.2，解决当前高危审计失败。实际 Claude Code 作者分别为 fb8502f225fa42138d3e437bfff1171e、c9ac1f65444d43b8a183c427a8b8e346。未改原 fixture 与断言，未升级到 5.x。

Codex 从 b765b55 建立隔离副本，只复制这三份作者文件及既有本地依赖，未混入 Stage B。Node 25/26 旧旅程检查各 5/5；完整 verify:release exit 0，729 Node、104 Hook 全过、audit 0；pack --dry-run exit 0、142 files；diff --check 通过。精确摘要与日志见同目录 `step1-preflight-acceptance.json`。

只读全 Host Doctor exit 2/degraded：Claude 目标不存在或未发现；其余既有安装仍 5.0.1，Codex 还有 discovery 缺口。这不构成当前机器安装完成；没有进行真实 HOME 安装。为新的日常试跑单独生成的临时 Claude 5.0.2 已通过 Doctor 与原生 discovery。

原始失败不删除：纯基线 audit 高危、Node 25 目录参数；Root 初次符号链接 setup 和本次误缩窄 PATH 选中 Python 3.9 导致的失败均保留。后者恢复原 Python 3.12 后通过，未改断言。此验收只闭合前置修复，不表示八步的第一步或任何新产品路径已通过。
