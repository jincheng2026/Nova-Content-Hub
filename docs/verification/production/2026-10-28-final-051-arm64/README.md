# 0.5.1 最终封装与本机验收

源码冻结：`87af6342220cb92cd1eac7c5e9106d993017e1eb`。本目录后续文档提交与冻结源码分别记录。环境为 macOS 26.4.1 / darwin-arm64；最终包为 disabled 预览，ad-hoc 签名、未公证、productionReady=false。

## 结果分层

| 层级 | 结果与证据 |
|---|---|
| 原源码与专项 | D1后端39/相关71、桌面64、token迁移28+2已在相邻D1目录留证；本轮分发/资源/原生负载39/39见 distribution-tests.log，各组不重复相加 |
| 最终构建 | dist-final.log 最终exit0，保留原crypto externalized、bundle体积警告；签名后2054市场项与封存目录相同，ASR/报告资源通过原完整门禁 |
| 分发复制修复 | 首轮漏一个0字节.gitkeep而拒绝交付，见 attempt-1.md 与差异JSON；真实固定builder复制12组先RED后GREEN，完整快照/hash未放宽 |
| 开发构建UI | development-ui：T044/T099各保存和独立重开，导出文件hash、原件hash与录完/发布事实保持；真实图片加载。其后分发修复前后desktop产品134项相同，见 product-build-equivalence.json |
| 最终包UI | packaged-ui-apfs/result.json：最终封装APFS应用再次完成T099重开/图片/导出。来自压缩DMG的直接运行曾READ_TIMEOUT，packaged-ui-attempt-1保留失败；未改读取截止 |
| 原生安装 | installation.json：从最终只读DMG按现有事务复制、全树比对、签名验证后发布到/Applications；原0.5.0有恢复归档 |
| 原生应用 | native-acceptance.json：实际安装可执行文件在隔离profile打开同一库，原生连续输入关闭、重开读回、恢复原字段、退出与独立新进程重开通过；库ID/根身份一致，无pending，最后已退出 |
| 原生导出 | native-export.json：真实macOS目录选择器选库外目录，8个实际文件逐项匹配不可变清单和manifest hash，UI等待完成提示后再验文件 |
| 系统展示 | native-ui/finder-app-info.png/.ax.txt与about.png/.ax.txt：名称、N图标、Apple芯片、0.5.1、完整公司版权、实际大小与时间；签名信息另见installed-signature-info.txt |
| 两宿主插件 | installed-plugins.json：0.5.1启用、缓存完整比对、1034来源子集与五项禁入通过；两宿主×四能力共8个doctor/空callback。当前聊天未热加载，不是真实模型业务成功 |
| 配置保全 | settings-before.json、settings-after-install.json及native-acceptance.json：原库选择/绑定/偏好/服务四文件的实际hash未变；只在隔离副本写入 |
| 最终交付副本 | delivery-artifacts.json：桌面DMG/ZIP与已核源产物hash一致，均有实际字节/时间/SHA；目录附SHA256SUMS.txt |

## 真实界面与设计规则

开发构建JSON记录的实际viewport为1440×948、1280×828、960×648；相应外窗为1440×980、1280×860、960×680。原生验收窗口截图为2560×1720物理像素（1280×860外窗），以实际截图和JSON为准。

| 规则 | 本轮实际证据与边界 |
|---|---|
| Foundation-01/03/04、Surface-01 | 最终资产白卡、层次与文字；成功反馈使用普通状态文本，错误保留警告语义；开发与原生截图均已查看 |
| Layout-01/02、Controls-01/02 | 960/1280/1440宽度无文档横向溢出；原页包装在封面弹层中只读，基础控件和提交动作可达；真实原生库选择与导出选择器可用 |
| Surface-03、Reading-02 | 原创作页输入关闭时等待保全，完整输入回到源文件并可重开；合成原字段经正常保存恢复，id/kind/locked/fields对账相同。保存历史等元数据按正常编辑流程处理 |
| Image-01/02、Cover-01 | 真实已加载样张与已保存封面、比例完整；未用破图/空白截图当通过。测试候选是明确的120×160蓝色fixture，不是模型生成或实际发布素材 |
| Acceptance-01/02 | 定点测试、实际React/Semi、最终包与原生可执行文件分层留证；原生paste后关闭的API间隔2616ms见native-close.json，同事件循环/IME合成门禁另见P0，物理IME未验 |
| Acceptance-03 | Finder与关于已按根AGENTS检查；Dock专用CUA读取两次超时(-10005)，该项待人工。其他系统/架构、完整键盘/系统减少动画与清洁新机没有本轮通过声明 |

## 产物与配置说明

- 桌面镜像3212291347字节，SHA256为 `4ee796616fcb1880b35e322ec6b5b1d316fe0ff5dca8ae440c1d95dfd98d2954`。ZIP95848001字节，SHA256为 `00aee26129d0447799f6a6376de42cb4e42223b2bee59967d3e4e98fee144f88`；blockmap及全部时间见delivery-artifacts.json。
- Finder实报应用4215603688字节/磁盘4.27GB，创建/修改时间2026-10-28 13:31；常规文件逻辑字节合计另在artifacts.json，未把镜像、应用或参考图数值混用。
- 用户原A/B知识库只读。T044为合并测试副本内容；T099是专用合成内容，48篇属于该测试副本，不代表原A/B数量。开发阶段保存/导出的源hash核对和后续原生主动编辑/恢复分开记录。
- 全局codebuddy命令当时缺失；WorkBuddy自带普通入口缺少full bundle，按其实际代码支持的CODEBUDDY_FORCE_LITE_WB_BUNDLE=1调用现有lite变体完成更新和验证，使用临时PATH包装，未写全局CLI。两份失败日志与最终成功日志均保留。
- 首次CUA绑定窗口超时；确认实际实例和准确/Applications路径后继续。最终原生验收只有明确隔离profile，原配置四文件hash相同。浏览器/其他应用的盘点内容不纳入本目录。
- installation-backup-state.json核对complete记录、旧应用归档凭据和移除授权一致；恢复目录仍有暂存收尾项，原样保留，未手工删除、未另称旧版本恢复运行通过。

真实助手模型成功、双等待/恢复、终态/续接/切换、真实制图、空库首篇完整旅程、真实新设备、其他架构、卸载、正式签名公证、可信权益和第三方资料分发依据，仍按交付台账留缺口。后续模型拆包仅登记需求，不改变本轮冻结产物。
