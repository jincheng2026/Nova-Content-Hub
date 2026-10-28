# P1 参考对象分组与链接解析

日期：2026-10-28。范围独立于 P0 原 HTML 保存诊断；本记录不声明构建、安装、跨平台或完整 UI 验收通过。

## 实现与依据

- 根 `AGENTS.md`、账号切换交接第 7 节 P1、设计标准已读。旧准确参考：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/ui/components/workbench/work-detail.tsx` 第 807–844 行，以及只读 `lib/works.mjs` 的 `parseReferences`。
- 参考视频按真正作品聚合；同一素材根的原链接、素材笔记、逐字稿合为一组。表格行与嵌套列表项提供局部关联证据，作品 ID 提供跨段关联依据；歧义时保留分开的来源。保留原卡顺序。
- 平台具体作品 URL 与明确标为原视频的本机视频可构成作品对象；跨选题、飞书、文章、档案、普通资料路径、主页及 localhost 链接进“参考资料”。T046 的真实图文作品沿用旧详情页的“参考视频”区，原卡标签仍完整可查。
- 可阅读／定位只使用 `VaultDocument.id`。已索引的同作品校正版逐字稿全部保留，不按文件名猜最新。未索引位置只展示、复制，不推断存在或失效。
- Markdown 平衡括号和尖括号路径正确解析；绝对本机路径与越出库的相对路径保留原位置，禁止 URL 路径归一化把它们夹回库内并错误关联文档。裸 URL 去正文尾标点，Markdown 明确目标保留作者地址。
- UI 沿用现有 Semi 按钮、白卡和细分隔，增加准确的“复制位置”；仍调用原 `copyPrompt`，没有新增路径 IPC、外链打开权限、助手协议或依赖。

## 验证

1. 先添加失败数据回归：3 旧项通过、4 新项失败，见 `red.txt`。另先观察到 UI 3 项缺少分组显示失败，以及顺序、索引逐字稿、全角尾标点回归失败后实施相应修复。
2. `node --test workbench/test/jincheng-work-detail-data.test.mjs workbench/test/jincheng-work-detail-references.test.mjs workbench/test/jincheng-stage-actions.test.mjs`：15/15，通过输出 `green.txt`。组件测试用真实 JSX 的 SSR 和实际事件回调；仅 Semi Button 以简单按钮替身渲染，不模拟分组数据变换。
3. `npm run typecheck:renderer`（workbench）：通过，见 `typecheck-renderer.txt`。
4. `node docs/verification/production/2026-10-28-reference-groups/verify-real-sources.mjs`：原 A/B 只读扫描并执行实际数据变换，来源卡片 SHA256 前后相同。完整来源和文档 ID 见 `real-sources.json`。脚本只用 `scan`、原卡读文件和纯数据变换，不打开／绑定／投影／写入原业务库。
5. `git diff --check`：通过。

| 编号 | A 作品 / 参考资料 | B 作品 / 参考资料 |
| --- | --- | --- |
| T041 | 4 / 7 | 4 / 7 |
| T046 | 3 / 4 | 3 / 4 |
| T020 | 4 / 31 | 4 / 31 |
| T048 | 2 / 7 | 2 / 7 |
| T005 | 2 / 0 | 2 / 0 |

T041 第一条为水球泡的 `/Users/hejincheng/Downloads/下载 (47).mp4`；路径完整但没有绑定文档 ID，不宣称原片可播放。A 中该条逐字稿未索引，B 中已索引，UI 能力按各自真实索引区分。两条“视频档案”、T042 和 localhost 均在参考资料。T048 嵌套 vibecoding 素材树的两条作品分别成组，两条统计／复盘资料与主页保持在参考资料。

## 设计规则验收边界

| 规则 ID | 本轮结果 |
| --- | --- |
| Foundation-01/02/03 | 复用既有颜色和正文层级，没有新颜色；来源标签 13px，路径沿用 12px。代码核对通过，屏幕对比／可读性待主线程真实 UI 检查。 |
| Surface-01 / Controls-03 | 一条真实作品一个细分隔承载面，作品数来自聚合结果；没有胶囊包整行或虚构文件数。组件结构通过，视觉待验。 |
| Controls-01 | Semi Button 保留 busy/disabled，可读动作文字；测试证实索引 ID 阅读／定位，原 URL／位置复制且 render 不发任务。 |
| Reading-02 | 完整标题／路径保留并 `overflow-wrap:anywhere`，子来源与动作允许换行；960px 实际页面、键盘与长路径视觉待主线程检查，CSS 不能替代视觉结果。 |
| Interaction-03 | 无业务库写入、来源选择、助手协议、IPC、外链权限或依赖变更；P0 保存链路保持独立。 |
| Acceptance-01 | 15 项专项与 renderer 类型检查通过；本轮按主线程范围不构建。 |
| Acceptance-02/03 | 本轮未跑全 UI、未截图、未构建打包安装、未进行各 OS/架构验收；主线程接续独立 UI probe。 |

目录定位与原片播放仍由现有受控后端能力决定；复制位置不能冒称“打开素材文件夹”。本轮未宣称完整三入口或完整磁盘扫描能力。


## T019 接着写可见性续修

主线程真实 UI 发现：发布面板切到 body 后正文虽已渲染，但133份其他文件／历史将编辑器推到视野外，截图仍在页头。局部修改仅在 jincheng-work-detail.tsx：顶部 Markdown／纯文本“接着写”发起焦点请求，等父组件 body 提交、辅助面板收起、busy/working解除后，在下一动画帧从本详情的 scoped ref 找 textarea#content-body，执行 focus(preventScroll) 与 scrollIntoView(center)。系统减少动画使用 instant；正常沿用 smooth。contentId变化／卸载取消待执行回调；原HTML frameRegion逻辑不变，保存协议不变。

新增 jincheng-work-detail-body-focus.test.mjs 运行真实组件hooks与事件动作，独立控制父组件commit和animation frame，验证不提前聚焦旧面板／其他编辑器、同body重复点击有效、减少动画、切内容／卸载取消、保存保护失败不切换。先观察2失败／2通过后修复至4通过；加既有数据、参考组件与stage整组19项通过，见body-focus-green.txt；renderer类型检查通过。

规则：Reading-02与Controls-01按明确动作将完整正文带入视野；Interaction-01在提交后移动焦点并尊重系统减少动画。Acceptance-02的真实viewport相交、视觉与键盘结果由主线程独立probe记录；本单元DOM边界模拟不能替代截图或真实Electron验收。本续修未构建或commit。
