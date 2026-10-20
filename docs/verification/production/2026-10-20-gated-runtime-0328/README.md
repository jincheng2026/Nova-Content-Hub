# 0.3.28 原先跳过的运行时集成验证

2026-10-20。上轮完整verify仍保持原始1065通过/2跳过的结果。本轮确认两项开关只控制隔离集成测试，不要求操作真实宿主或业务库，因而显式开启、串行执行：两项各1/1通过、0失败、0跳过。

```sh
NOVA_BUNDLED_NODE_INTEGRATION=1 node --test --test-name-pattern='^real pinned Node runs outside' plugin-src/tests/bundled-node.test.mjs
NOVA_MARKETPLACE_INTEGRATION=1 node --test --test-name-pattern='^real native market and simulated host cache' plugin-src/tests/marketplace.test.mjs
```

第一项实际执行固定Node 24.20.0，在无PATH及污染NODE_OPTIONS的环境使用受控launcher，检查损坏manifest、缺CLI、许可证篡改、目标冲突和失败提取清理。所有损坏发生于临时副本。

第二项把两模式真实运行时构建成临时marketplace，再复制到临时的模拟宿主缓存，删除分发副本后从无关cwd执行doctor、cover help及各Skill的summary；检查哈希、运行时、清单、Skill路径和pairId。测试不读写真实Codex/WorkBuddy缓存，不发送宿主任务，也不读取业务库或发起生成。

执行输入为0.3.28两模式运行时，共享index均匹配已验证SHA256 `04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1`。命令、逐项统计、日志哈希与pairId记录在`verification.json`。源码参考提交为`6b739b385e01931bd26962f229c853da2317a37c`。

这补齐原先两个测试开关的证据，不改写上一轮完整命令的历史结果，也不等于真实宿主已重载、接单或产出图片。
