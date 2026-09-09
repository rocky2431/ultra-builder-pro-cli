# Pi candidate3 recovery 独立 QA

结论：**PASS（限定范围）**

## 验证结果

- **Native D4 recovery：PASS**。首次成功工具结果后等待 10 秒并 SIGINT；进程组清空，中断前后文件 manifest 不变。随后以同一 native session、仅使用冻结 continuation 续接，最终 native exit 0。该结果只证明 active-turn recovery，不证明半写入产品文件恢复，也不是 W4 或可靠性统计。
- **日期修正能力：PASS**。在 disposable copy 中新增两条记录；`edit-date 1 2026-09-10` 后，新的 `show`、`find 供应商`、`list -n 20` 和全新 Python 进程读取均显示新日期。另一条记录的日期、标题、正文未变。
- **错误输入：PASS**。真实日历无效日期 `2026-02-30` 返回 exit 2；未知 ID 返回 exit 1；两次拒绝操作前后数据库 SHA-256 均为 `aa78e1bee6e0257713d06450efeab4bff38909d55fb2972afefbc87e3c353839`。
- **原有测试保留：PASS**。独立运行 28/28；对 baseline 与结果 `test_mnotes.py` 的全部原始方法做 AST 比较：baseline 29、结果 32，`missing=[]`、`changed=[]`，新增 3 个日期修正方法。
- **Fixture/hash：PASS**。candidate3 manifest 的 7 个 changed-path SHA-256 全部匹配；中断观察中列出的 stopped artifact 文件也全部匹配，包括原始 `mnotes.py`、`test_mnotes.py`、数据库和 `.ultra` 文件。
- **重复实现检查：PASS**。仅发现一个日期更新命令、一个 SQL 更新路径和一个 parser 注册。

## Candidate3 entry delta

仅审查最终 ordinary-entry 段落，并结合此前 launcher review 与 final764Node/104Hook 成功证据。未发现具体 P0/P1 回归；该段要求对比起始文件、保留旧回归检查并解释合理断言变更，没有引入新的 mode/grant/state 路径。

## 保留的历史更正

candidate2 D4 删除旧测试方法的失败及此前 QA 报告中的 append-only correction 保持不变，未被本次 PASS 覆盖或改写。

详细命令、输出、hash 和限制见：
`pi-candidate3-recovery-qa-evidence/qa-commands-and-results.txt`
