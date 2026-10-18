# 数据契约

本目录使用 JSON Schema 2020-12，供编辑器、接入者与独立校验使用；运行时仍经过工作台 core 和插件 CLI 守卫。

- request：现有生成请求 v1，保持兼容。
- handoff：明确的宿主、续接目标及最小项目上下文，v1。它包裹 request，不把宿主写回旧请求。
- workspace：浏览器备份 schema 1 的结构约束，允许旧记录扩展字段；不把备份内容视为安装、授权或内置模板可信证据。
- template-catalog：随包原创模板、版本、资源与来源。
- template-design：模板的场景分类、区域拆解、生成骨架、变量、AI 风格参考和逐项评审；由工作区与目录共同引用。

JSON Schema 负责结构。运行时还检查跨字段关系（pairId/授权模式、目标/库/模板版本一致）、引用唯一性、真实内置定义、路径、实际日期、UTF-8
字节及工作区容量，不能仅凭 Schema 通过执行。request 上限 16 KiB；handoff 上限 64 KiB；协议链接超过 6000 字节转为显式附件交接。

授权模式以本地构建为准。HANDOFF.json 的 authMode 不赋予权限，Hooks 不提交任务或标记成功。
