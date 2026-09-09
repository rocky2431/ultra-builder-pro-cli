# Stage B 共享绑定 Root 增量复核

本轮不构成 Stage B 最终验收。实际作者 Kimi6f427666… timeout，无end_turn；现存源码、交接和运行结果已独立复核。原生Codex补充lens因账户额度结束、无最终报告，不记为通过。

Root读取实际生产选择、共享launcher、worker启动和conformance调用路径，并运行既有四套件126/126，0skip，39.614s；15源前后稳定。原始日志及完整SHA在 `.ultra/.runtime/owner-factory-implementation-20260905/stage-b-root-launch-binding-narrow.json`，raw SHA06cd6109655da1edc7c8ccd93f3f641f5bb4aa5b95459918d0619b3d1c3cfddd。

1. native runtime更新：选择阶段先解析实际路径，候选argv及身份观察共用该路径；spec保留路径和内容绑定，启动复核runtime/adapter/entry/SDK后才标记writer launching。既有新增回归证明启动前runtime漂移拒绝。原缺口在当前代码已修复。
2. conformance override：真实caller携带实际entry绑定，共享launcher要求具有留存资格的profile必须有executionIdentity，不能再省略字段绕过绑定。该缺口已关闭，但conformance override对未来qualified profile也会拒绝，这是明确可用性限制，不是资格成功；Claude若需要正常conformance，由实际作者接现有selector，不能恢复绕过。
3. symlink entry：SDK package解析由entry realpath开始，通过Node require.resolve向上查找并realpath package.json，与当前entry实际默认Node模块加载语义一致；既有symlink/祖先目录回归通过。只覆盖package元数据身份，不声称完整node_modules attestation。

当前两项launcher缺绑定抛出普通Error，不是typed HostEnforcementUnavailableError；交接的typed表述过宽。缺绑定在worker/fence前拒绝是实证；面向具体consumer的机器可读错误仍需后续集成审查，不凭措辞建立通过结论。

保留限制：内容哈希和spawn之间有普通文件替换窗口；旧无记录路由仍保留兼容行为；Task1历史验收不替代当前Task2/aggregate。Root已经修正自己漏写Task Review正文的记录错误，原全量失败保留、定向原断言1/1通过，未改测试。新的全量release在Claude路径稳定后执行。
