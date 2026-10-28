# 普通资料回收与原位恢复

独立模块、通用trash真实接点及注入UI已实现；本提交尚未挂入生产IPC/页面，不代表用户已能点击。

- Root真实trash API新回归经历RED；新请求将vaultId/root dev/ino放进requestHash，锁内复核源版本，恢复同锁核验原回执与bytes、原路径空闲。独立restore回执幂等，后来手改不被重放覆盖。
- 升级旧trash请求精确重放单独RED→GREEN，旧回执始终不提升为可恢复。Root曾引入嵌套锁导致NOT_READY，已定位runMutation自加锁，在持有同库锁的本地core路径使用private runMutationUnlocked；最终真实API+独立模块23/23。
- 既有Vault/pending-index与注入UI兼容回归47/47；组间有不同覆盖，不合并为一次全库通过。全部临时库，无作者原库写入、无网络/模型/GUI。
- 正式资产、内容专属回收、正式发布档案/分析来源、linked、跨库/换根、篡改/缺失/符号/硬链接、同名占用均拒绝普通恢复。原回收对象仍保留。

Controls-01/02、Reading-02：注入组件具备查询/分类/20-50-100分页、长路径换行、禁用与错误保留。Acceptance-01临时库已测；生产接线、页面视觉与各平台实际操作留待后续验收。
