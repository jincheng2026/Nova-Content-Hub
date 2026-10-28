# D1 最终资产后端检查点

范围：本机独立测试Vault与明确fixture图片。源码/行为验收，不代表真实模型、安装版或跨平台通过。

- 同T不可变版本包含精确逐字稿、标题、简介、封面文字与实际选图字节；来源/清单自包含，当前指针最后CAS发布。重试与恢复只用原mutation冻结字节，保留旧版本，不制造录完或发布事实。
- 生成图验证committed attempt、request/receipt/report/captured字节及decoded/hash链。旧导入图在锁外由当前Sharp解码，重锁核对选用与完整字节，仅缓存最多128项进程内proof；没有磁盘自签证明、renderer proof或旧脚本执行。
- 当前稿与录完稿显式分开，封面版本按本次实际选稿hash判断；异文需确认，同文不误报。托管包所有内容只读，普通save/trash/restore及通用内容编辑不能改写包内资产；仍可读取或显式选为只读来源。
- 历史清单有界读取，未核验历史明确标记；所选版本完整校验。大图独立64MiB reader未扩大通用8MiB读边界；两个新reader均有O_NONBLOCK、regular/single-link及前后identity检查。

结果：`final-assets-tests.txt`39/39、`affected-tests.txt`71/71、pending专项1/1、录完稿实际确认保存2/2。各组有重叠，不相加声称独立总量。64MiB保存/导出、64MiB+1拒绝、raw80MiB/receipt120MiB在stage前拒绝、6处断电恢复、外部CAS冲突、真实FIFO替换快速拒绝均覆盖。macOS执行的FIFO不能替代Windows原生验收。

后续A0 token v2去除物理descriptorHash，显式迁移后同业务来源保持token一致，根身份核验继续独立执行；相应包装/封面28项及迁移/身份2项通过。原T044三项final原文核对仍见上级`t044.json`。

实际React/Semi页面、最终安装产物、Codex/WorkBuddy真实模型任务和其它设备均单独留门禁。UI首次运行器在启动后直接openLibrary，与应用背景读锁竞争；`../ui/attempt-1-seed-race/result.json`如实保留，运行器已改为启动前准备fixture，不能把该失败说成产品保存失败。
