# Project Brief

> **Authority**: raw owner intake captured by `ultra-init`. It preserves what the owner
> initially asked for and the broad outline needed to begin research. It is not an
> evidence-backed product baseline.
>
> **Lifecycle**: `ultra-research` reads this seed and promotes accepted conclusions into
> the North Star, specifications, domain language, or decisions. It does not rewrite the
> brief to make later conclusions look inevitable.

## One-line

"我每天开会记的东西到处都是，帮我弄个能整理会议记录的小东西吧。"

## Initial Outline

- What it is: 一个本地的会议记录归档 + 关键词检索工具（命令行）。
- Broadly for whom or what: 只有 owner 一个人用。owner 原话："就我一个人看，不共享。"
- Intended result: owner 原话："我要的是过后能找回'上次那个决定'——按关键词找出来，还能看到是哪天记的。"
  → 检索命中时必须同时给出命中片段和该条记录的日期。
- Broad boundary: 不做共享、不做多人协作、不做权限；不改动 owner 的原始文件；
  不连接任何外部服务。第一版只在本机、只处理纯文本。

## Explicit Inputs

- 单人使用，不共享（owner 明确说明）。
- 成功判据由 owner 给出：按关键词能找回过去的决定，并看到记录日期。
- 剩余技术形态由 owner 交给模型判断：owner 原话："你判断就好，按你觉得合适的做。"
- 未由 owner 提供、因此不得假设的材料：既有会议记录当前的真实落点（具体目录、
  具体服务）。owner 未回答该问题，因此导入源一律由 owner 在运行时以参数给出，
  工具不内置任何默认扫描路径，也不访问 Notion 等已连接的外部服务。

## Open Questions for Research

- 既有历史记录的真实落点与格式仍未知；`import` 目前接受 owner 运行时指定的目录/文件，
  尚未针对任何特定来源（如 Notion 导出、飞书导出）做格式适配。
- 是否需要从记录里进一步自动提炼"待办/责任人/截止日"。owner 当前的成功判据只要求
  检索到决定本身，此项未被要求，也未被排除。
- 检索规模上限：当前实现为子串扫描，未做全文索引（见 `docs/decisions` 记录的取舍）。
  若记录量增长到检索明显变慢，需要重新评估索引方案。
