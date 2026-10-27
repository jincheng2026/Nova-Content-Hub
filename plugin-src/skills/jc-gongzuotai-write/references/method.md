# jc-gongzuotai-write 运行映射

完整方法以 [原文](../upstream/current/METHOD.md) 及其引用资源为准。执行前读取 [映射契约](../../../plugin-src/resources/method-adaptation-contract.md)。

- 原件的库路径与输出文件对应固定 context 的显式源、当前 contentId 与正式对象；保留原始证据和同一 T 编号，不从 CWD 或旧机器路径取值。
- 原件的用户确认、分段推进、独立分析、手改唯一基准、版本与日志依原分支执行；阶段信息经允许的 checkpoint 或产物证据保存，现有 schema 不支持时保留完整文本并记录运行缺口。
- 原件的直接文件/服务命令只读；真实读写由 registry.executor 和已验收 adapter 负责。缺 adapter 时先交候选与缺口，不假称已完成写入。
- 对照映射契约逐条核对范围、媒体、费用、发布事实与权限；最后核对 task/attempt/requestHash/receipt，不把回复结束当提交成功。

原 schema/creation-page.md、creation_doc.py、brain_page.py、build_page.py、模板和保存服务完整随包供协议核对。原 Python 服务未安装；用当前工作台 Node jc-doc adapter 读写，是否已验收以当前运行结果为准。保留未知字段、稳定ID、order、版本和CAS，不把只抽取正文的新文件冒充无损迁移。
