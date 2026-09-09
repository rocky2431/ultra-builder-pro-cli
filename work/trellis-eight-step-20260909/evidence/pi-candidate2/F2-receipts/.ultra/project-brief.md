# Project Brief

> **Authority**: raw owner intake captured by `ultra-init`. It preserves what the owner
> initially asked for and the broad outline needed to begin research. It is not an
> evidence-backed product baseline.
>
> **Lifecycle**: `ultra-research` reads this seed and promotes accepted conclusions into
> the North Star, specifications, domain language, or decisions. It does not rewrite the
> brief to make later conclusions look inevitable.

## One-line

做一个不连接银行或邮箱的本地个人记账小工具，用来记录收据和账单、查看本月总支出，并按商家找回某一笔消费。

## Initial Outline

- What it is: 个人使用的收据和账单记账、查询工具。
- Broadly for whom or what: 给本人管理手机里已有的收据、账单记录。
- Intended result: 能知道这个月一共花了多少，并能按商家找回某一笔消费。
- Broad boundary: 不报销，不连接银行或邮箱；录入和管理范围留给后续实现确定。

## Explicit Inputs

- 使用者：本人自己记账。
- 数据：手机里的收据、账单；本项目不连接银行或邮箱。
- 目标查询：本月总支出、按商家查找单笔消费。
- 明确不做：报销、银行连接、邮箱连接。

## Open Questions for Research

- 需要支持哪些录入方式（手动录入、拍照/附件，或仅保存结构化记录）？
- 单笔记录至少需要哪些字段，是否需要分类、备注或附件？
- 金额、日期和商家搜索的格式与筛选行为如何定义？
- 数据保存位置、备份与隐私边界如何满足本地个人使用？
