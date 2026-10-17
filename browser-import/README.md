# 原型备份导入（实施中）

目前提供 `inspectBrowserBackup(absoluteFile)`：稳定读取用户选定的普通 JSON，限原型4 MiB，严格UTF-8，复用仓库可信 validator 校验关系，返回数量/资源待解析情况/未知历史说明。不创建文件库、不执行备份内容、不读取 `srcPath`、不联网，不迁入演示授权或安装信任。

预检中的 embedded-unverified 只表示存在内嵌字节，尚未完整解码；reference-unresolved 不表示文件可用。报告不包含图片 base64、私有文案或模拟会话详情。真正导入仍需实际解码/哈希、受控内置资源解析、按作用域映射ID及保存原始备份，并在新目录发布前完整验证。

`importBrowserBackup()` 尚在下一阶段接入，依赖 schema5 的有限业务 CRUD。预检通过不是数据已迁移，也不是 Electron 验收。实施约束见 `docs/实施/08-文件模型增量与原型迁移设计.md`。
