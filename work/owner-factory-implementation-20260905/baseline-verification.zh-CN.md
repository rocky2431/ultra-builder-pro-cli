# 阶段实施前独立基线验证

源版本：`2e3273bf12f6493b3201fad3d9d1b802ae367a4f`。Codex 在独立 detached worktree 验证，避免 ZCode 修改候选时混入基线。

- `TMPDIR=/tmp npm run verify:release`：exit 0；712 Node tests、89 Hook tests 全过；依赖审计 0 vulnerabilities。
- `npm pack --dry-run --json`：exit 0；5.0.2，141 entries，1,438,101 unpacked bytes；work、docs/wip、.ultra/.runtime 均未进入 package。
- `node bin/install.js --all --global --doctor --json`：exit 2 / degraded；现有 OpenCode/Kimi/Grok/ZCode 安装报告为 5.0.1（源为 5.0.2）；Claude 报缺少 provenance/manifest/Skills，Codex 还报未发现插件。按 Doctor 实际解析路径记录，未进行安装或配置修复。详细诊断保留在本地 runtime JSON。

执行限制与排除：第一次检查工具 60 秒超时，不构成测试结论；随后长 TMPDIR 触发 10 个 Unix socket EINVAL 失败（含聚合父项），短 TMPDIR 消除。隔离副本使用 node_modules 软链又触发一项软链拒绝检查，改成现有依赖实体副本后全套通过。以上均未改产品或测试代码、未安装依赖。

日志：`.ultra/.runtime/owner-factory-implementation-20260905/baseline-verify-release-final.log`；结果：`baseline-result.json`；Doctor：`baseline-doctor.json`（同目录）。

测试基线通过不代表 D1 Host enforcement、真实 Owner 体验或任一工厂阶段通过。
