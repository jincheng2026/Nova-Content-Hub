# 工作区读取失败反馈与有限恢复

用户黄色横条场景的根因是refreshWorkspace catch把所有错误统一设置workspaceUnavailable，并要求内容库维护。现在BUSY/VAULT_BUSY保留旧workspace/草稿，显示简短占用状态，在后台最多两轮800/1800ms恢复；已耗尽可显式重试。READ_TIMEOUT提供重试，访问权限与源缺失指向目录恢复，CORRUPT/UNSAFE_PATH/锁不确定等保留维护提示。完整读取成功清除状态，未完整读取时不清除原有错误。

恢复信号绑定library epoch，切库/卸载/成功取消旧timer；晚到结果和晚到错误均不覆盖新库。正常nativeAction finally继续释放前台busy，恢复只重新读取，不重放已确认写入。

RED→GREEN，真实App hooks/action执行+既有managed/cover/detail/navigation/scheduler50/50，完整native/renderer typecheck exit0。覆盖占用→释放自动恢复、最多两轮、foreground busy释放、write一次、timeout后retry、切库晚失败、新旧草稿保全。所有夹具隔离，无真实库写入、GUI/网络或LLM。

Controls-01/02、Foundation-04、Reading-02行为已核；生产包截图场景仍待安装后CUA实际验收，不以hooks测试冒充实机UI。
