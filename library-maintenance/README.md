# 本地库备份与恢复

维护命令共用文件核心的备份能力和 `browser-import` 的导入能力。它们服务于用户自己的本地数据，不调用模型、唤起助手或改变授权配置；正式界面会用文件/目录选择器提供入口。

```sh
node library-maintenance/cli.mjs backup --library /绝对路径/内容库 --destination /绝对路径/新备份目录
node library-maintenance/cli.mjs verify --backup /绝对路径/备份目录
node library-maintenance/cli.mjs restore --backup /绝对路径/备份目录 --destination /绝对路径/新恢复目录
```

Windows 使用对应的绝对盘符路径。路径带空格时作为一个参数传入。现有目录即使为空也不会覆盖；恢复生成新库，核对后再由工作台绑定它。CLI 输出一行 JSON，失败退出非零，磁盘原始错误保留错误分类。

备份为普通文件夹，包含原始 data、完整清单和最后发布的完成标志。没有 COMPLETE 的目录是未完成产物；不会被当作可恢复备份。失败现场保留，下一次选择新目标。核验可以发现缺失、额外文件、哈希/清单损坏及不安全路径；哈希不是来源签名，恢复前仍需确认备份来源。

备份保留软删除、原始正文和图片、模板历史、任务与事务现场，精确排除运行中的库锁。核心持锁并前后完整核对；外部编辑器和宿主 inbox 不守此锁，检测到变化会拒绝完成。这是稳定观测复制，不能冒充操作系统原子快照。

恢复先核验、暂存与恢复待完成事务；旧的未结束封面尝试保留历史并标记 RESTORED_INTERRUPTED，等待新尝试，不自动启动助手。最终内容库描述文件最后独占发布，原库与备份保持不变。详细规则与返回字段见 [文件核心](../file-library/README.md)。

原型导入的接口接入如下，完整能力随导入器交付一并验收：

```sh
node library-maintenance/cli.mjs import-browser --source /绝对路径/旧备份.json --destination /绝对路径/新内容库
node library-maintenance/cli.mjs import-status --destination /绝对路径/新内容库
node library-maintenance/cli.mjs resume-import --destination /绝对路径/新内容库 --id 导入结果中的操作编号
```

操作编号是 UUID；所有路径必须是绝对路径。查询尚未预约的目标返回 null，不创建目录；继续导入使用已存档的原始字节，不要求旧备份仍在原位置。同一目标重复操作按原 importId 查询/恢复；不同来源拒绝混入。提交后即使正常编辑了内容，查询或继续也不能重新覆盖。错误保留 importId、workDirectory、destination 与提交结果，供界面明确显示。

导入保留原始来源、ID映射、缺文件/未知历史报告。状态 committed 表示完成提交，具体不可用项仍需查看 issues；不能把缺失文件当成真实素材。模板内置参考只从精确目录及哈希解析，包不包含原型 data.js 或私人提示词示例。以上命令不改变生图执行器的权益校验。

源码可直接运行；实验执行包构建也会携带此 CLI，不依赖原型的演示登录。验证使用临时数据；跨平台、跨卷、断电和正式 Electron 界面分别验收。
