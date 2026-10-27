# 抖音与小红书真实双平台雷达联调

2026-10-27 15:40:54–15:41:04（北京时间），darwin-arm64。使用当前源码隔离编译、真实配置的加密临时副本、真实文件库/controller/worker/broker/采样器；未替换安装版、未修改用户内容库。宿主GUI与新聊天启动不在此脚本覆盖内。

用户授权充值后最小验证全部TikHub能力，以及一次多平台采集。前轮8项操作已各调用一次；本轮仅剩2次真实HTTP，分别为抖音douyin-search与小红书xhs-search，均HTTP200、各1REQ、cacheHit:false。合计本阶段10次HTTP。没有profile、评论、分页、重试或模型调用；不存在可复用的前轮原始cache，已保存的脱敏fixture只用于离线回归。

冻结方向“AI 工具教程”、平台[抖音,小红书]、全局sampleLimit2、全局预算2REQ、comments:false。总候选按授权平台均分，每平台一条；先搜索全部有份额平台，再用剩余额度补资料，本次额度用尽所以没有补资料。供应商搜索时间筛选覆盖较宽，最终本地仍按冻结的近30天逐条判断，未降低门槛。

- 抖音真实来源：[卡卡AI控作品](https://www.douyin.com/video/7663441916159167798)。供应商粉丝407198、点赞15556，且发布时间超出30天，资格unqualified。
- 小红书真实来源：[喵笔三花作品](https://www.xiaohongshu.com/explore/6accd6d8000000001b01ceb8)。点赞148437、收藏28365、评论572、分享1896；搜索未提供粉丝，followers:null、likeFollowerRatio:null、eligibility:unknown。没有声称已完成低粉资格核验。

`radar.json`为真实采集器输出，`accepted-report.json`为真实adopt后的雷达报告，`accepted-archive.json`从真实accepted任务归档读取。`summary.json`记录冻结请求、两次实际HTTPS状态、ledger、receipt及原设置保护：原加密文件SHA256与受保护keys/model/budget/comments均未变；原预算/comments仍OFF。临时配置、库、broker描述符与cache已删除，证据保留。费用仅实测2REQ，具体人民币账单未知。

本轮验证采集→提交→回执→accept→adopt→归档，不验证选题分析质量、完整视频内容阅读或宿主助手GUI。测试结束不再发送外部请求。
