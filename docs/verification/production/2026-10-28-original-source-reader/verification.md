# 原来源与原 HTML 隔离读取验收

2026-10-28；开发机器 macOS arm64。原始第二大脑和同事包仅只读，本次行为写入系统临时验收库；没有启动旧 43127/43139/43141/8769 服务。

## 实际浏览器结果

独立隐藏 Electron 窗口，1280×860；BrowserWindow 使用 sandbox、contextIsolation，禁用 nodeIntegration；页面通过 ProductionPages 能力 URL 载入。原报告与原来源脚本均仅在 `sandbox="allow-scripts"` 的 opaque iframe 中执行，connect-src none、frame-src none、form-action none，无 preload、Node 或同源保存权限。

- `report.png`：真实西门 3,335,857 字节评论报告保留 1,930 条评论、39 个折叠详情和表格。点击原“工具入口、版本与设备”按钮后，原脚本将列表筛选为 249 / 1,930；无运行脚本错误。
- `vi.png`：真实原视觉筛选目录显示 39 组、75 张图的来源元数据，原分类与详情可用。详情输入“原VI真实沙箱备注验证”后，外层回执“选择与备注已保存到当前第二大脑”，验收库 `.workbench/source-state` 中读回同一备注；原包 `data/reviews.json` 不变。
- `collection.png`：原封面目录显示 527 个候选、28 条内容，默认内容显示 60 张卡。点击第一张“选这张”后，验收库 `jincheng-all-cover-choices-v1` 读回 1 个选择，非仅内存或浏览器存储。
- `bookmarks.png`：真实 X 原页恢复 586 条来源快照、原主题/用途/处理类型/人工决策与列表。不是当前 X 实时同步；尚未取得原数据库的新 `X收藏.html` 页面不冒充已经恢复。
- `probe.json`：上述实际 DOM、主题筛选、保存回执、运行错误记录。X 选入素材的稳定 ID 幂等写入、备注重开由针对性测试验证。

原报告库按原 meta.pages 的顺序与标题恢复，实际 11 个可见分组、27 个声明页面；原 workbenchVisible=false 分组保留隐藏。原 meta.date 仍保留原日期，不伪造 collectedAt 时间。

## 来源缺口

同事包视觉 `public/assets`、`public/cover-collection-thumbs` 为空；旧 tech 和 research 独立来源目录未提供。相关图片明确报原件缺失；目录数字表示真实来源清单，不表示图片文件均已取得。旧 43139 选择恢复桥已停用，当前新选择独立保存到当前库。未测试 Windows、Intel Mac 或最终安装产物。

## 规则记录

- Foundation-01/03、Reading-02：新外层阅读壳使用既有冷灰/白底、14px正文、可读来源与完整 iframe 入口；原资料排版按原件保留。
- Interaction-03：原业务数据保留原来源；原脚本无主机权限。仅已冻结核验的原页面/依赖启用有范围的 CAS 选择/备注桥；未知改过的 HTML 仅只读。
- Acceptance-01：native 类型检查与针对性来源/报告测试执行；五个相关测试文件 41/41 通过（来源、资源回写、原HTML、reader与创作capability回归）；最终统一回归由主线程收口。
- Acceptance-02：上述四张真实 Electron 截图，1280×860。未声明窄窗、全键盘、系统减少动画或跨平台视觉全部通过。
- Acceptance-03：本证据限开发源与独立隐藏 Electron reader；不能代替主工作台入口接线、最终包、安装或系统展示验收。
