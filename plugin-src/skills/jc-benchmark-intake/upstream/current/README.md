# jc-benchmark-intake · 对标内容入库助手

把用户已经选中的抖音、小红书、视频号等社媒内容，连同复制的信息、图片和本地视频，去重后保存到第二大脑 `02_内容素材/未参考/{平台}/`。有视频时使用火山引擎豆包语音补齐逐字稿，并用识别时间给校正版生成同名时间码字幕（`.srt`）；验收通过后，正式素材只保留校正版逐字稿和字幕，中间版本移入项目 `.trash/`。

## 你可以直接这样说

- 「这是社媒助手复制的内容和下载好的视频，把它作为对标内容入库。」
- 「把这条小红书笔记保存到 `02_内容素材`，图片也一起放进去。」
- 「检查这条内容是否重复，没有重复就沉淀进素材库。」

## 不做什么

- 不替用户寻找或选择对标内容。
- 不分析爆款、不生成选题、不提取规律、不写稿。
- 不登录平台、不调用付费接口、不保存凭据。
- 只想转写、不需要入库时，使用 `jc-zhuanxie`。

## 安装

项目真源：`个人IP与内容/第二大脑/skills/jc-benchmark-intake/`。

个人安装目录：`~/.claude/skills/jc-benchmark-intake/`。Codex 和 NewMax 由 `~/.claude/scripts/sync-skills-all.sh` 建立同名软链。

## 本地验证

```bash
python3 ~/.claude/skills/jc-meta-skill/scripts/validate_skill.py .
python3 ~/.claude/skills/jc-meta-skill/scripts/trigger_eval.py . --cases evals/trigger_cases.json --output reports/trigger-eval.json
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/validate_workspace.py /path/to/vault --target '02_内容素材/未参考/抖音/目标目录' --strict --require-srt --json
python3 scripts/backfill_srt.py /path/to/vault   # 盘点旧素材能零成本补字幕的条目，不写文件
```

## Troubleshooting

- 提示重复：打开报告指出的现有目录，在原目录补资料，不新建第二份。
- 视频检查失败：先确认原视频能被 `ffprobe` 读取，不把下载残片送去转写。
- 缺少逐字稿：运行 `jc-zhuanxie`，先在 `.staging/` 保留完整证据并通过验收；正式入库后再清理中间版本，不能提前删除。
- 字幕检查报「文字和校正版逐字稿对不上」：逐字稿改过了，用 `python3 scripts/transcript_srt.py build --timing 现有字幕.srt --transcript 逐字稿.md --force` 重建，不用重新转写。
- 当前会话看不到 Skill：运行 `~/.claude/scripts/sync-skills-all.sh` 后新开会话；已开的会话通常不会热更新。

## 上游方法说明

参考了 `PostPlus social-media-extractor, benchmark-to-brief and video-transcription mechanisms; adapted to local private Vault and SenseVoice Small`。只借鉴了明确路由、证据分层、暂存产物和转写验收机制；没有复制其托管服务、付费确认或平台专用执行代码。
