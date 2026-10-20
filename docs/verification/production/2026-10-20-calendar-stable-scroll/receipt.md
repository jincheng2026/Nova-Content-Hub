# 日历选日保持阅读位置

基线：`e81b283`，产品版本仍为 `0.3.28`。本次仅修复 renderer 与回归探针，不提交、不发版、不安装，也未读取或修改真实用户库。

## 可重复的红点

- `node workbench/scripts/semi-calendar-ui-probe.mjs`：小日历选择跨月无计划日期后，页面 `scrollY` 从 `0` 变成 `205.5`。见 `red.log`、`red-scroll-samples.json`。
- 扩展同一探针：计划详情保持打开、库暂不可用后恢复时，刷新选中日计划把 `scrollY` 从 `80` 拉到 `698`；滚动调用目标为 `publication-plan is-focused`。见 `refresh-red.log`、`refresh-red-scroll-samples.json`。
- 扩展同一探针：25 条安排的深分页 focus 后重复选择当天，`scrollY` 从 `110.5` 变成 `313.5`；滚动调用目标为 `daily-plan-row ... is-focused`。见 `day-focus-red.log`、`day-focus-red-scroll-samples.json`。
- 既有 `daily-publication-ui-probe.mjs` 补齐历史列表默认 20 条的过期断言后，10k 深分页定位刚挂载即点击页 1，会被未消费的定位 effect 拉回深页。明确翻页、改每页数量现会取消旧定位。见 `daily-publication-pagination-red.log`。

## 最小修复

1. 普通选日只更新日期与当天列表页码；“查看全部”使用独立 `showDayPlans` 保持明确导航。
2. 日列表的 focus 只消费一次，等目标页挂载后再定位；普通选日、主动翻页与调整每页数量取消旧请求。数据刷新不重放旧 focus。
3. 已展开的计划详情也只为一次明确 focus 请求定位，避免数据恢复或刷新把读者拉回详情。

保留日历 DOM、原有数据缓存与事件键更新策略，未增加滚动恢复计时器、重挂载或额外产品功能。初始跨页请求、显式计划详情与查看全部仍会导航。

## 最终验证

下列命令在仓库根目录执行，均退出 0：

```sh
node workbench/scripts/semi-calendar-ui-probe.mjs
node workbench/scripts/daily-publication-ui-probe.mjs
npm run typecheck --prefix workbench
node --test workbench/test/schedule-view.test.mjs workbench/test/publication-model.test.mjs workbench/test/daily-publication-wiring.test.mjs
```

- `green.log`：真实 React / Semi / Electron，隔离临时 userData、合成数据与桥。24 个选日、重复选择、空白格、主月/主周导航、月周切换及有无计划刷新样本，动作前后 `scrollX/Y` 全部相同，动作内 `scrollIntoView` 调用均为 0。见 `scroll-samples.json`、`sample-summary.json`。
- 同一探针验证有计划/无计划的当天列表原位变化，日历 DOM 保留；跨月周日期联动、筛选、时间精度、合集归属、忙碌禁用和无业务写入继续通过。
- `daily-publication-ui.log`：发布记录、草稿保护、历史定位、10k 数据下有界 DOM、深分页与重复明确 focus、1280/560 布局继续通过。
- `typecheck.log` 与 `calendar-model-tests.log`：最终源码类型与相关模型/接线测试通过。
- `git diff --check` 通过。

`npm run build --prefix workbench -- --auth both` 退出 0（`build.log`），但构建过程中追加了最后的日列表主动翻页回调修复，故此日志不能证明两个 auth 产物都包含最终相同源码。最终两个组件探针与 typecheck 均在此修复后执行；最终安装应使用主线程后续组合构建产物。首次不带 `--auth` 的命令被构建脚本直接拒绝，保留于 `build-command-error.log`。

既有 daily 探针的默认历史页数断言由 10 对齐现有源码的 20。首次失败保留于 `daily-publication-stale-assertion.log`。

边界：未重复仓库全量 verify，未覆盖 Windows 或真实安装应用/真实用户数据；截图仅为合成组件证据，不代表安装验收。
