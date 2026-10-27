# 用户充值后TikHub八项真实能力复验

用户明确授权充值后“所有用到TikHub功能、最小成本”，包括本轮唯一一次评论首屏。当前safeStorage解密Key的SHA256先与用户提供hash比对成功；只在临时加密配置副本开启必要预算，每operation独立真实调研任务1REQ，评论仅该task显式授权。原实际预算/comments仍OFF，云模型及Key保全。

8项各真实请求一次：profile、user-posts、video、comments、user-search、douyin-search、xhs-search、xhs-profile，均HTTP200且供应商内层业务状态成功。全部没有翻页/重试，真实broker账本各1REQ；每项submit、accept及accepted archive均成功。`summary.json`和`business-verification.json`留有非secret结果，`*.shape.json`为响应结构，`*.fixture.json`为字符串哈希/保留数值的脱敏结构fixture，绝不可作为真实来源ID重发请求。原始临时cache已删除。

用户指定真实抖音账号：[在下小曾 o](https://www.douyin.com/user/MS4wLjABAAAA_MwbLwyLnMARlAErwvPwmlhVlvG_NOgc80_3TeHIj-E)，粉丝24651。profile与user-posts均用此真实sec_user_id；video/comments复用其首屏真实作品7683351511748840740；两类抖音search用profile返回昵称。XHS search“人工智能”后，profile只使用真实search作者ID。

作品首屏返回21条（请求count20，供应商实际多返回一条），评论首屏20条。官方评论文档建议保持默认count，否则可能异常，因此未额外减count/重复请求：[TikHub官方文档](https://docs.tikhub.io/186826225e0)。XHS search20条；成功空列表也接受，此次实际均有数据。

这是八个底层operation及真实调研任务回执验收，不等于完整账号分析内容质量或雷达全流程。`radar-parser-replay.json`仅为离线结构回放；随后真正双平台雷达任务见`../radar-multiplatform-live/`。本次8REQ加最终双search2REQ=本阶段10次HTTP；金额账单未知。早期HTTP402记录仍为真实历史，充值后的结果更新当前可用状态，未绕过402。
