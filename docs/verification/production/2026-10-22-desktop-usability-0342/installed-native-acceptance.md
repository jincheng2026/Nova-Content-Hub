# 0.3.42 安装后的原生验收

2026-10-22，真实 macOS Apple Silicon。主线程通过 CUA 操作用户的实际窗口；没有借用隔离探针截图作为安装后证据。安装源固定为 a9eb3cc788f7e557b93dce9390a4f5a4b7a1aaca。图片是实际捕获的系统/应用截图；除 installed-reopened.txt 为完整树外，其余.txt是连续读取的AX增量回执（含“无变化”和焦点），不是完整页面导出，具体观察同时记录于本表与操作会话。

## 系统与启动

最初运行的是旧事务中的 previous.app（PID77764、local bundle ID），不是标准安装目录的新应用。其维护页出现用户截图相同 CORRUPT；使用应用菜单正常退出，没有强制结束或放弃新草稿。新版首次启动短暂 CUA 超时后重新选择成功；进程精确来自 /Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台，未从旧恢复副本启动。

Finder 显示简介同时检查归档与安装后应用：名称「自媒体工作台」、已确认N图标、Apple芯片、版本0.3.42、© 2026 杭州新岛橙灵智能科技有限责任公司、536,525,709字节、修改时间2026-10-22 16:44。Finder显示的目录属性大小与文件字节合计分别记录，不互相替代。证据 finder-archive.png/.txt、finder-installed.png/.txt。应用内设置显示0.3.42/macOS/ARM64及WorkBuddy插件连接就绪，未实际调用生图。

## 交互逐项核验

| 规则/反馈 | 已安装应用的观察 | 证据 |
|---|---|---|
| Image-01、Layout-03 | 首页封面等比贴合实际边缘，无固定白框，原计划仍明确“不带图” | installed-overview.png |
| Image-02 | 首页点击图片进入统一查看器，显示适合窗口49%；点击放大后61%，提供缩小、适合窗口、原始尺寸与拖动/滚动提示；关闭回到原页 | installed-zoom.png |
| Controls-02 | 内容资料渠道改为单行多选，可输入“微信”过滤至微信公众号；未选变或保存原内容 | installed-channel-multiselect.png/.txt、installed-channel-search.txt |
| Controls-02、Surface-03 | 偏好模板下拉只有一个外层圆角焦点环，无内部矩形蓝框；选项仅当前五组内置与三组自建 | installed-preference-options.png/.txt |
| 模板范围 | 模板页明确5组内置、3组我的模板；当前内置为同事五组。旧15组不进入可选清单，历史原目录保留 | installed-five-builtins.png/.txt、post-update-library-report.json |
| 桌面能力范围 | 维护弹层仅原生新建/打开/Finder/检查/备份恢复/旧桌面库升级，无网页迁移区域 | installed-maintenance-after-finder.png、CUA完整维护树 |
| Finder回归 | 实际点击“在文件管理器中查看”，短暂等待后控件恢复，无CORRUPT；关闭维护后模板、设置与已保存内容可读取 | installed-maintenance-after-finder.png/.txt |
| Acceptance-01/02/03 | CmdQ正常退出，检查所有副本主进程均无结果；只读数据快照后从确切安装位置重开，原库加载出5篇内容、1合集、原封面及2条当天安排 | installed-reopened.png/.txt |

内置更新只改两个渠道名称，并增加正常事务记录；未保存内容资料、未改变封面选用或收藏，独立差异报告确认原内容/资产/模板历史未变。安装前备份保留。本记录不把可打开原库等同于健康检查全量完成，也未声称测得启动或图片加载耗时提升。

其余图片入口、长名提示、极端长宽图、键盘/拖动及嵌套焦点由源码隔离Electron探针覆盖，见 source-acceptance.md；未逐个在真实用户库制造极端样本。未验收真实生成、Intel Mac、Windows、正式签名或公证。当前宿主会话仍是启动时加载的旧插件上下文，新会话才会重新加载.42技能。
