# B 方案雷达实现记录

初次实施按用户要求集中修改，当时为源码检查范围；`node --check` 对雷达核心与针对测试源码通过，`git diff --check` 通过。当时尚未运行测试、类型检查、构建、真实页面或真实服务验收；后续指定测试见下方收尾记录。

- `radarSampleRows` 从现有关键词搜索首屏候选池剔除已知时间、点赞、粉丝与赞粉比不符合冻结条件的作品，再应用平台最终份额。未知指标继续保留，零条也是有效结果。
- collector 和 broker 共用此函数派生作者资料白名单，时间依据是对应搜索响应的真实 `collectedAt`。仍只补入选作者，不翻页、不扩词、不改变冻结操作或 REQ 上限。
- 每个来源保留自身采集时间，缓存不借用新平台时间。作者资料另记采集时间到 evidence。新产物用 `sourceTimeVersion:1` 标识逐来源时间语义，显式非法、缺少候选时间或晚于报告的时间拒收；无标记旧产物沿用历史报告时间重算，保全已有报告信任与处理意图。
- 列表同 `sourceKey` 按候选真实时间选择最新观察；用户已加入／不合适的意图独立保留。初次实施未修改加入选题聚合流程；收尾追加可选证据角度，见下方记录。
- 抖音专门低粉榜接口未真实验证，当前仍明确标识关键词搜索首屏策略；不宣称低粉榜已支持。

## 设计规则记录

- **Layout-02、Foundation-03、Surface-01、Controls-01/02/03**：沿用现有页头、列表和 Semi 控件；此次只调整候选来源选择与说明文字，没有新增颜色、尺寸或控件。
- **Reading-02、Interaction-03**：原完整来源详情入口保留；来源时间与独立作者资料时间通过既有证据正文读取，用户决定仍走已有 mutation。
- **Acceptance-01**：新增针对测试源码，尚未执行；不得视为通过。
- **Acceptance-02/03**：真实页面、宽窄窗口、键盘与平台验收留待主线程统一执行。本次未生成安装包，未作跨平台或真实服务声明。

## 统一验证入口

```sh
node --test plugin-src/src/lib/file-library/test/radar.test.mjs plugin-src/src/lib/file-library/test/radar-multiplatform.test.mjs plugin-src/src/lib/file-library/test/radar-sampling.test.mjs
node --test workbench/test/radar-desktop.test.mjs workbench/test/radar-budget-validation.test.mjs workbench/test/radar-cli-scope.test.mjs
npm run typecheck:desktop
```

集成要求：`workbench/src/main/production-services.mts` 调用 `radarMissingAuthorIds` 时传入第五个参数 `result.collectedAt`，与 collector 的样本选择保持一致。


## 冻结前可选角度承接

- `normalizeRadarCandidate` 仅在 `raw.angle` 为非空字符串时写入 `angle`，去首尾空白并限制2000字；无字段、空白、null和非法类型保持完全省略，不给旧产物补 `angle:''`，保证历史信任重算一致。
- 固定提示要求依真实来源证据给出本条可借鉴角度，无依据可空或省略。沿用已有助手分析，不增加接口、采集或 REQ，也不新增个人角度表单或修改决定协议。
- **Foundation-03、Reading-02、Interaction-03**：通过既有来源详情正文显示完整角度，没有新控件、样式或颜色；角度到选题参考分析的承接由主线程 production 聚合实现（`d115392`），本次只通过集成测试核验。
- **Acceptance-01**：已运行 `node --test plugin-src/src/lib/file-library/test/radar-sampling.test.mjs plugin-src/src/lib/file-library/test/radar.test.mjs`，25条通过、0失败。覆盖可选角度规范化、旧产物不补字段、验收→收录→加入选题→重开后参考分析保留角度且正文为空；其余原有雷达回归亦通过。无真实服务调用。
- **Acceptance-02/03**：本次未另跑类型检查、构建或真实页面验收，交由主线程最终统一检查与冻结；未新增平台验收声明。
