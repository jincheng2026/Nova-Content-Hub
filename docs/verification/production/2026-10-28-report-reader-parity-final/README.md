# 原报告阅读链路限定验收证据

本记录不覆盖旧48页测量。只读检查冻结报告HTML与已提供源文件；新增来源附页在内存中登记，未刷新或写入Demo。

- 32份报告、49页；静态真实标签的38次相对引用 = 32次HTML + 4次CSV + 1次MD + 1次JSON，当前helper全部映射。
- 767个纯页内锚点；先前正则777包含脚本文本中的示例标签，应使用本次HTMLParser结果。
- 6个图片src均为data:；未发现相对或外网图片、音视频src。
- 6个附件均由当前只读helper重新核验并返回原字节，其SHA256和大小均与提供的源文件一致。

原research-reports服务不要求meta.pages成员，按库内文件存在与扩展白名单服务HTML/CSV/JSON；原second-brain reader从页面href/src固定附件白名单，支持MD/CSV/JSON。准确源码位置、49页身份与全部引用见同目录inventory.json。

## 最终安装点击定位

- 「珍妮丁丁说AI」博主拆解 / 作品资料表-60条.csv：reportId `f1fb0197-d563-4cd6-ad69-e4fafc6743b9`，pageId `92d7a457-9250-4b4b-a0d4-8fd4921334c6`，index `2`，42214 bytes，SHA256 `0c298ba3f2b2a84a1ba893008e3c8b86476e2aea632e3713eeb871b305d924d9`。
- 「珍妮丁丁说AI」博主拆解 / 评论主题聚类-179条.csv：reportId `f1fb0197-d563-4cd6-ad69-e4fafc6743b9`，pageId `92d7a457-9250-4b4b-a0d4-8fd4921334c6`，index `3`，48755 bytes，SHA256 `64c03db6db20ee15e2a08d574513cfd08cc92d2ae35e460c377255d71c9c63a3`。
- 「珍妮丁丁说AI」博主拆解 / 评论样本-179条.csv：reportId `f1fb0197-d563-4cd6-ad69-e4fafc6743b9`，pageId `92d7a457-9250-4b4b-a0d4-8fd4921334c6`，index `4`，19332 bytes，SHA256 `b017e6a8e08c32878c5dc9680cfa364e998fce2cce58ecc6fe6fd6805ec0a1f7`。
- research_report / 研究结论.md：reportId `ed40314a-acea-4e5f-afa6-54e105cd45e3`，pageId `d35d0e7e-d216-496a-a0d5-f1bb4cc5dbe0`，index `0`，10473 bytes，SHA256 `6ecdb01b129ed80d0092f94c0de76122af2085e0a88e410b56592b66f4ce4a2a`。
- research_report / 视频明细_99条.csv：reportId `ed40314a-acea-4e5f-afa6-54e105cd45e3`，pageId `d35d0e7e-d216-496a-a0d5-f1bb4cc5dbe0`，index `1`，50636 bytes，SHA256 `421639a0cdb4ee38364eaf9d03b01c970dfb93f51479c2b7508e8bec4fda6db5`。
- research_report / statistics.json：reportId `ed40314a-acea-4e5f-afa6-54e105cd45e3`，pageId `d35d0e7e-d216-496a-a0d5-f1bb4cc5dbe0`，index `2`，11368 bytes，SHA256 `a9077d3c2a9e886947193e006eea35a8e8e1780b465cb55898f982151521323e`。

真实最终安装包点击、锚点滚动与浏览器下载另由主线程验收；这里的字节证据来自实际helper，只读且无HTTP。


## 自动校验

- 最终24项专项通过（26.63秒）：附页注册、报告导航、原分页／创作capability、worker读取期限与外部来源。
- 先前资源投影整组48项通过（65.80秒）；最终href属性边界与附件变更由上述24项再验证。
- native与renderer类型检查、git diff --check均通过。准确命令与覆盖阶段在inventory.json的verification字段。
- projection-upgrade.json保留真实policy4旧缓存2页→policy5新缓存3页的独立临时库记录：报告ID和源hash不变，第二读稳定。
- 设计规则Interaction-03：沿用现有绑定库／capability／worker边界；Acceptance-01：针对性静态与行为验证通过。最终安装交付验收仍按AGENTS.md另记。
