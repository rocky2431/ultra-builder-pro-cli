# Decision: 5.0.2 closeout under the current three-stage Goal

> **Status**: accepted / active for local closeout
> **Grant ID**: `ubp-v502-zcode-closeout-2026-09-01`
> **Date**: `2026-09-01`
> **Repository**: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`
> **Base HEAD**: `adb7bfe89f40e107d0c9c490076a6e74294b9337`
> **Change**: `chg-ultra-5-0-2-authority-reconciliation`

## Owner record

Owner 当前指令：

> 「设定成目标循环完成好了 当前这个任务 代码部分由zcode完成 你负责review给到修改意见 并且在每个阶段去和cc（claudecode）讨论当前的情况和需要优化的部分（阶段大型review需要你和cc一起 开发过程中的review你自己完成）三个阶段都需要有全部跑通……最终交付……自动化coding agent 软件工厂为止。」

该指令为 Ultra 自身的当前开发选择了一个 **work-package governance topology**，
不是 R2 产品运行时的 `Profile v0`，也不是永久产品角色：

- ZCode 是唯一产品实现写入者；
- Codex 负责协调、开发过程 Review、验证和修改意见，不写产品实现；
- Claude Code 只读参与阶段讨论，并在后续三个阶段与 Codex 做阶段 Review；
- Host、provider 和角色以后仍可由 Owner 通过新的 work-package topology、产品
  versioned Profile 或 per-run override 替换，不写死在产品架构中。

## Exact closeout package

本 grant 只重新激活当前 5.0.2 Change 的本地收尾：依据 Codex Review 修复阻断项，重跑有影响的验证，冻结候选并完成正式 task Review。它不把 vNext 三阶段目标折入当前 Change，也不授权创建第二个 active Change。

目标架构输入仍是 `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`，本次观察到的 SHA-256 为 `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`。该 WIP 在当前 Change 关闭前不是 canonical product authority；后续 D0 必须重新稳定读取并由新的 active Change 绑定。

## Allowed topology and local effects

- ZCode 可只在 Codex Review 明确列出的文件和验收边界内编辑本地 repository，并运行相关测试、validator、pack dry-run 和隔离 Doctor。
- Codex 可写本 grant、task/review/evidence/恢复等协调产物，执行只读 Review 和验证，并把 P0/P1 修改意见发回同一 ZCode work package。
- Claude Code 只读讨论；它的 transport 或模型结论不是语义验收。
- Review budget：一次 initial Review，加最多两次只覆盖未解决 P0/P1 的 delta Review。P2/P3 保留报告，不自动修复。

## Not authorized

- commit、push、force-push、tag、npm publish、GitHub Release、deploy、生产或真实 HOME 安装；
- credentials、identity、billing、provider purchase 或其他外部 effect；
- 当前 Change 的 `delivery.md`、版本姿态决定或 archive。即使本 grant 可跨 session 验证，最终化仍需要当时 Owner 对 `ultra-deliver` 的明确调用；
- 第二个 active Change、North Star 接受、vNext scope 扩张或把当前开发 topology
  固化为产品运行时角色。

## Durability and invalidation

这是一个仅覆盖上述 closeout package 的 `durable work-package` grant。fresh Agent 必须稳定核对本文件、repository、Base HEAD、active Change、当前 dirty diff 和 Owner 指令后才能继续。

以下任一情况立即停止：scope/topology/effect 边界需要变化；R2 或本 grant 字节无法验证；同一根因三次修复仍失败；Review budget 用尽仍有 P0/P1；需要任何未授权 effect；Owner 暂停、撤销或替换本决定。

本 grant 在正式 task Review `APPROVE` 后结束。它不因结束而自动授权 Deliver 或 release。
