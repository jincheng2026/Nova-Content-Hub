# 内容详情简化：实现与待验收项

参考：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/ui/components/workbench/work-detail.tsx`。本记录仅覆盖源码和针对性检查；不代表真实页面、安装包或跨平台验收。

## 适用设计规则

- **Layout-02**：一组内容标题；编号/原类型/已有事实、选题摘要与继续写稿在页头；五标签改为按需辅助入口。
- **Surface-01、Controls-03**：网页、参考与其他文件用白色承载面和逐行分隔；没有将整行做胶囊。
- **Controls-01**：继续写/原选题卡/稿件文件夹为明确动作；每个网页写清是否可编辑。
- **Reading-02**：网页与其他文件各预览8条，提供展开其余入口；完整路径可换行；原选题卡用既有Markdown阅读器完整阅读。
- **Interaction-02**：打开原页的滚动遵守系统减少动画偏好。
- **Interaction-03**：保留原助手任务启动/提交/继续协议。无HTML入口只选择既有writing方法并打开原任务表单，不在渲染时发起任务。来源未解决时主区域列出候选，作者选择，不按文件顺序猜当前稿。
- **Surface-03、Acceptance-01**：内联CreationFrame复用现有flush guard；关闭、换页和App全局guard都先flush，失败保留原页。辅助表单有未保存填写或App正文dirty时阻挡收起/切换。

## 已运行检查

- `npm run typecheck:renderer --prefix workbench`：通过。
- `node --test workbench/test/jincheng-work-detail-data.test.mjs`：3项通过。覆盖HTML/原卡/其他文件归类、来源冲突不隐式选稿、相对参考链接和未索引路径保留。
- `node --test workbench/test/jincheng-stage-actions.test.mjs`：2项通过。覆盖明确的新创作入口直接打开原writing表单、渲染不发起任务，以及原有菜单默认仍关闭。

## 明确待验收与能力差异

- **Acceptance-02**：主线程统一构建后进行真实页面、窄窗、键盘、单个内联页、关闭/切换时flush失败保护，以及截图验收。本执行阶段按分工未运行构建或CUA。
- 文档现有快照可提供bytes，没有可靠mtime；没有显示伪造的改动时间。引用目录没有可直接打开的受控folder身份时保留原路径，提示从原卡或文件夹核对。
- 当前无通用受控外链打开API且Electron禁止window.open，因此原视频入口显示“复制原视频链接”；未声称原视频已在浏览器打开。
- **Acceptance-03**：没有打包、安装、平台原生运行或系统元数据验收声明。
