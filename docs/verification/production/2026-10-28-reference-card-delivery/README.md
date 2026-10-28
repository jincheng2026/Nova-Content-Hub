# 参考洞察卡静态交付

本轮修复生成器返回Markdown但production-report只接受HTML的真实不一致。保留L2校验及Markdown原件，HTML主relativePath/sha256用于CLI import，sourceMarkdown路径/hash与findingsHash保留证据。生成frontmatter仅在原件保留，阅读页不显示。

真实临时库runtime→固定handoff/claim→CLI import→submit通过，Markdown直接导入、错误claim、提交后late import均拒绝；HTML/MD外改重新render拒绝覆盖。未知钩子、cid/原引文、评论实证/推测、本人判断空入口均保留，错误引文/HTML注入拒绝。

RED→GREEN，runtime相关13/13，后续加强链组7/7，不合并重叠组。无真实付费、真实评论采集或作者洞察质量验收。视觉仍pending；该代码在完整主线开发分支，不进入急用12d89328的0.5.4修复包。
