# 第五步测试输入隔离修复

2026-09-09。Codex实现并验证；这是第五步恢复中的测试修复，不是Stage B验收。

`worktree digest accepts an explicit project from outside the checkout` 原本读取真实ROOT。新增验收材料后，全量检查在257个观察文件处正确返回`ULTRA_SNAPSHOT_RESOURCE_LIMIT`，因而该测试无法在当前工作区通过。修复复用同文件已有`initializeDigestRepository`，创建带真实Git提交和active Change intent的独立项目；调用仍从另一个cwd进入，仍检查退出码、schema、实际HEAD、Change ID和intent digest。没有删除断言、忽略产品文件或提高物理上限。首次fixture状态误写`in-progress`造成intent未找到，纠正为已有`active`后通过。

当前组合源（含此前未提交Stage B修复）验证：

- 目标用例通过；整个`tests/v026-contract.test.cjs`通过。
- `npm run verify:release`：799 Node、104 Hook、0 skip、audit0。
- `npm pack --dry-run --json`通过。
- `node bin/install.js --all --global --doctor --json`执行完成，exit2、既有degraded；未安装或修改真实HOME。

原失败见`step5-current-release.log.gz`及`step5-current-release.json`；修复后的窄验证和完整日志分别为`step5-digest-isolation-narrow.*`及`step5-digest-isolation-release.*`。pack/doctor日志为`step5-current-pack.*`、`step5-current-doctor.*`。ACP回归显式使用此前保留的公共entry `/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs`，不隐式调用已消失的旧源码路径。原始失败日志与patch无损gzip保存（解压字节保持一致）；组合源patch与hash在`step5-digest-isolation-subject.*`，本次提交仅接受这处测试隔离及对应记录。
