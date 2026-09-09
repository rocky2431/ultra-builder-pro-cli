# Project Brief

> **Authority**: raw owner intake captured by `ultra-init`. It preserves what the owner
> initially asked for and the broad outline needed to begin research. It is not an
> evidence-backed product baseline.
>
> **Lifecycle**: `ultra-research` reads this seed and promotes accepted conclusions into
> the North Star, specifications, domain language, or decisions. It does not rewrite the
> brief to make later conclusions look inevitable.

## One-line

我手机里和邮箱里的收据、账单一堆，帮我弄个能管起来的小东西吧。

## Initial Outline

- What it is: 一个用于管理收据和账单的小工具。
- Broadly for whom or what: 面向个人，管理个人持有的收据和账单记录。
- Intended result: 能把收据、账单集中记录并管理起来，方便日后查找和跟踪。
- Broad boundary: 第一版只支持手动录入；不连接邮箱，也不读取手机或邮箱里的文件。

## Explicit Inputs

- Owner明确选择先手动录入。
- 不连接邮箱。
- 不读取手机或邮箱里的文件。

## Open Questions for Research

- 第一版必须支持哪些记录字段、查询方式和管理动作，才算真正有用？
- 收据与账单是否需要不同的生命周期、分类或提醒规则？
- 数据是否只需保存在本地项目中，以及隐私、备份和导出方面有哪些必要要求？
