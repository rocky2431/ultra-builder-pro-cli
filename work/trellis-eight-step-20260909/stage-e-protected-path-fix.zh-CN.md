# 共享保护路径修复与 Pi 重新资格

已复现并修复：在整棵 worktree 可写时，内部 symlink 指向 `.ultra`，或在大小写不敏感卷使用 `.ULTRA`，可能绕过 protected authority 拒绝。修复位于所有相关原生写入共用的 ACP canonical path 检查，使用 Node native realpath 校验实际受保护祖先；测试先红后绿。未扩展读隔离或声称 OS 沙箱。

Pi 0.85.1 原生试验 x1g7Nn 保留八个工具：合法 write/read 成功；七项实际调用在效果前拒绝，包括大小写及 symlink。独立 QA APPROVE 仅覆盖这次重新资格，结果、源码和原始散列封存于 `.ultra/evidence/vnext-d-operational/native-qualification.json`、stage-e-pi-qualification-review.json 和 stage-e-pi-qualification-raw-index.json。原始压缩归档保留在本地，不包含在 npm 包中。旧资格漂移先拒绝，新资格记录后，公开生产 gate 的 wYI41n 未移除 enforcement 即 finished。角色模型保持原选择，只有资格摘要更新。

本修复可以独立提交；D task 和 Change 仍为 in_progress，登记共享资格路径并不代表 D 收益验收或 E 正式交付。当前源码整包检查、pack、Skill 和隔离插件结果另见 stage-e-release-current.json 等记录；真实 HOME 未安装。没有 push、tag、发布或生产操作。
