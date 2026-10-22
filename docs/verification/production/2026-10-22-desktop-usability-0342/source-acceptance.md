# 0.3.42 源码与风险审查

2026-10-22，目标 darwin-arm64 预览。五项反馈对应：共享缩放查看器；紧凑渠道搜索多选及长名完整提示；共享 Select 去重焦点与可用模板过滤；桌面移除原型导入能力；Finder 元数据不再触发全库 CORRUPT。

Finder 根因在真实 reveal → watcher → workspace 读取路径复现红灯，修复后通过；读取实际库的独立副本同样恢复可读。只放行普通 .DS_Store，符号链接、目录和未知条目仍拒绝。健康检查的预算限制单独报告，不把未检查完成当健康。核心/维护465项、揭示/监听/开库16项、新增旧库升级1项通过（执行代理记录）；后续本轮不重复未改变的全部业务套件。

模板策略经 GPT-6 Astra high 定向审查。最终保留历史文件原路径、schema、不可变包与原图，从当前和回收站目录排除精确15个旧内置ID，拒绝新任务/新修改；自建模板不被接管。原路径方案消除了搬目录导致 handoff 路径失效和旧版重建同ID的风险。最终退役6项通过，包括冻结 fe23cb8 旧读写器、真实 context 路径/hash、幂等重装及备份恢复。旧应用仍可能显示旧样式；不能把目录移除表述为物理清除。

桌面 IPC/preload/controller/worker 不再提供 chooseBackup、chooseDestination、importBackup、resumeImport；旧绑定里的历史字段仅兼容解析，不查旧文件、不执行原型任务、不阻止有效桌面绑定。维护CLI只保留backup/verify/restore。生产构建过滤 browser-import、旧 builtin-templates 与图库兼容资源；原型源与历史测试资料仅作设计/旧格式测试，不随桌面应用发布。保留桌面新建、开库、Finder查看、完整备份、恢复与旧桌面库升级。

全量桌面初跑368项：360通过、8失败。7项 managed-refresh 在冻结 fe23cb8 同样失败（VM测试夹具/旧全局刷新的预期过期），另1项是规范渠道名B站更新后的旧断言。更新测试以完整快照覆盖真实局部确认路径后，managed-refresh、workspace、desktop-only合计25项定向复验全部通过；不把这次记录写作一次全量全绿。保留局部更新、无全局忙锁、冲突草稿、失败重试与资产刷新范围断言。运行全套时版本配置切换至0.3.42，最终两个类型检查与source check在0.3.42重新通过。三项交付源过滤/内置资源/示例/导出检查通过。

UI隔离 Electron 探针：图片缩放、两视窗三极端比例、键盘、拖动、嵌套Esc/焦点、渠道多选与长名、单焦点、下拉圆角、表单、候选/批注以及增长列表全部通过。规则 Image-01/02、Controls-02、Surface-03、Reading-02、Interaction-03、Acceptance-01/02/03，对应截图与JSON见 ../2026-10-22-image-channel-controls-0341/README.md。增长探针旧fixture缺candidates曾空白，修复fixture单次重跑通过，未增加产品容错掩盖错误。

以上均为源码/隔离测试范围；最终包、原内容库、Finder和安装后重开由后续发布记录单列。未执行真实生成、Intel Mac、Windows、Developer ID签名或公证。
