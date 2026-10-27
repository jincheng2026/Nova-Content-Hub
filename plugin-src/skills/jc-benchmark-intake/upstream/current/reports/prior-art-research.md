# Prior-Art Research

- Researched at: 2026-08-27
- Queries: `social media content intake agent skill`; `benchmark content library ingestion`; `video transcript knowledge base skill`
- Catalogs: skills.sh, SkillsMP, GitHub source
- Rating evidence: unavailable

| Candidate | Relevance | Adoption or trust signal | Learned mechanism | Applied here |
| --- | --- | --- | --- | --- |
| `social-media-extractor` | 社媒输入路由 | skills.sh 约 2.7K installs，2026-08-27 观察；安装量只代表采用度 | 先缩小到最小任务，输入不足时只停在真正缺失项 | `SKILL.md` 的开工条件和近邻排除 |
| `benchmark-to-brief` | 对标证据交接 | 直接检查 GitHub 当前源文件；公开评分不可得 | 区分来源事实、推断和开放问题，不让后续创作越过证据 | 原始复制内容与结构化字段分区，禁止把对标说法当事实 |
| `video-transcription` | 视频转写产物管理 | 直接检查 GitHub 当前源文件；公开评分不可得 | 单文件先行、保留内部转写产物、最终产物单独交付 | `.staging`、分层转写目录和 `validation.json` 门禁 |
| `jc-zhuanxie` | 本机中文视频转写 | 锦成本机现有 Skill，SenseVoice Small 路线已可用 | 原始识别、分段复核、校正版、验收四层保留 | 视频入库强制使用本地转写并把校正版并入笔记 |

## keep / adapt / reject / invent

- keep：最小任务路由、输入不足时停止、分层产物、转写后验收。
- adapt：把托管媒体服务改为本机私有 Vault 和 SenseVoice Small；把研究交接改为对标素材入库。
- reject：平台专用托管 CLI、付费请求、云端转写、自动扩展采集范围。
- invent：作品 ID、稳定链接、媒体 SHA-256 三层去重；`.staging` 验收后改名；校正版逐字稿并入现有 `笔记信息.md`，直接兼容后续规律和选题 Skill。

## Evidence boundary

- 已检查相关 Skill 的当前源文件和本地既有 Skill。
- 目录设计和触发边界属于设计证据，不等于真实入库效果已经优于其他方案。
- 真实抖音、小红书、视频号各 1 条的完整运行和用户验收仍是 `missing evidence`。

