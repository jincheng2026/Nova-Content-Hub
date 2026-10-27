# Creation Handoff

## Result

- Skill: `jc-benchmark-intake` 1.2.0
- Job: 把用户已选中的社媒内容、复制信息和本地媒体可靠放入第二大脑 `02_内容素材/`。
- Status: local private package; not published.

## Reference skills studied

- `social-media-extractor`：学习最小任务路由和缺失输入停止点。
- `benchmark-to-brief`：学习来源事实、推断和开放问题分开。
- `video-transcription`：学习单文件先行、在暂存区保留内部产物并完成验收。
- `jc-zhuanxie`：复用本机 SenseVoice Small 的四层转写与验收。

## Absorbed and rejected

- keep：清楚路由、证据分层、转写验收。
- adapt：改为本地 Vault、用户提供媒体和本机转写。
- reject：托管服务、付费请求、云端转写、自动扩采。
- invent：三层去重、暂存区、严格验证、逐字稿并入笔记，以及正式入库后只保留校正版的可恢复清理。

## Advantages and highlights

- design advantage：补上现有内容系统「外部内容进入 `02_内容素材`」的唯一责任人。
- design advantage：视频没有校正版逐字稿时不能冒充完成入库。
- validated advantage：15/15 触发边界通过；3/3 单元测试通过；校验脚本能在现有抖音素材上识别「视频存在但缺逐字稿和验收结果」。
- hypothesis：预计能减少重复目录和只有视频描述、没有口播内容的浅入库；真实跨平台运行仍是 `missing evidence`。

## Verification and limits

- Package validation: 0 failures, 0 warnings.
- Trigger evaluation: 15/15 passed.
- Unit tests: 3/3 passed.
- Existing-material check: ordinary check returned warnings; strict check correctly blocked a video item without corrected transcript and validation evidence.
- Install verification: project source and Claude copy are identical; Codex and NewMax symlink bridges point to the Claude copy.
- Deliberately excluded: platform login, paid API calls, benchmark search, content analysis, topic generation, pattern extraction and writing.
- Missing evidence: one real completed intake each for Douyin, Xiaohongshu and WeChat Channels; provider-backed or human blind output review; public release.

## 1.2.0 更新（2026-09-27）

- 新增：有视频的素材入库时，用 `scripts/transcript_srt.py` 把校正版逐字稿对齐到 `jc-zhuanxie` 原始识别的字级时间，生成与逐字稿同名的 `.srt`，正式目录保留；不重新转写、不花钱。
- 入库检查：暂存区严格检查和正式目录 `--require-srt` 复验要求字幕存在、时间码递增不重叠、条数合理、不超出视频时长、文字与校正版一致；旧素材没有字幕不报。
- 旧素材：`scripts/backfill_srt.py` 盘点并按指定范围补字幕，时间来源是项目 `.trash/` 里的逐字稿中间版本；全库补齐需锦成同意。
- 验证：单元测试 20/20 通过；18 条可零成本补的旧素材在草稿目录试生成全部通过，原样对上比例 94% 到 100%；2 条（T026 拉斐尔、T029 千雪AI）已正式补上，3 处抽句用本机模型回原片核对起点一致。
