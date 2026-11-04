# 冒烟运行：命令和来源

M-P5 门评审第 1 轮之后补做的一次真实 drive。这里记的是怎么启动的、用的是哪一版。结果见同目录的 `drive.json`、各日志和 `M1-review.md`。

- **时间**：从 2026-11-02T06:48:52Z 跑到 06:56:44Z（`drive.started`，`drive.stderr.log` 最后两行），drive 以 exit 1 结束。
- **项目**：`../ubp-v6-drive-smoke`。启动时 HEAD 是 `c4228ff`（计划门基线，提交于 06:48:39Z）。之后写者提交了 `bc48843` 和 `c6d2978`；控制者在 drive 停下后提交了证据和评审，即 `1547617`。
- **引擎**：v6 工作树的 `bin/install.js`，当时 HEAD 是 `5abe32d`。`git diff 5abe32d e61f668 -- engine docs/examples` 为空，所以跑的就是发布版的引擎和示例。
- **示例脚本**：
  - 启动前用 `git ls-files -s` 记下了两个 blob：`claude-reviewer.sh` 是 `04a866e8f7947a45c69dca51a051324e1c9188e9`，`claude-writer.sh` 是 `41fca3c4d28376f0f67e975f703cbe96fd6bd821`，都等于 `5abe32d` 里的版本。
  - 两个文件的修改时间都是 2026-11-01 21:22:19（-0800），早于这次运行，现在用 `git hash-object` 算出的仍是这两个 blob。所以运行时工作区里的脚本没有改过。
- **命令**：从会话记录原样摘出。`$V` 是 v6 工作树，`$S` 是本项目，`$L` 是 `v6/.ultra/.runtime/v6/p5`，原始输出写在那里，再复制到本目录。
  - 这次是在 Claude Code 会话里启动的，所以先用 `env -u` 去掉了会话自己的环境变量。在普通终端里启动不需要这一步。

```sh
cd "$S" && date -u +%FT%TZ > "$L/smoke-drive.started" && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_CODE_EXECPATH node "$V/bin/install.js" drive --root "$S" --writer "'$V/docs/examples/drive/claude-writer.sh'" --reviewer "'$V/docs/examples/drive/claude-reviewer.sh'" --json > "$L/smoke-drive.json" 2> "$L/smoke-drive.stderr.log"; echo "exit=$?" >> "$L/smoke-drive.stderr.log"; date -u +%FT%TZ >> "$L/smoke-drive.stderr.log"
```

- **模型**：用的是示例脚本的默认值，写者 sonnet，评审 opus。日志里记的分别是 `claude-sonnet-5-5`（`N-slug-1.log`）和 `claude-opus-5-5`（`review.log`）。事后检查过，启动它的会话 shell 里没有 `UBP_` 开头的变量。
- **没记下的**：写者日志看不出它调用引擎时走的是 `eval "$UBP …"` 还是 drive 放在 `PATH` 最前面的 shim。
