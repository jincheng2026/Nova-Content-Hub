# 0.5.2 第二大脑预览检查点

冻结源码 `46851c337ae72431827edb0356cf76ff44b774a2`。Apple Silicon / darwin-arm64 / disabled preview。最终DMG构建exit0，签名后市场与离线ASR完整性门禁通过；临时签名，无正式公证，productionReady=false。

- [全回归](desktop-full.log)：826项，824通过、0失败、2个本机PyAV环境跳过。随后按用户统一目录新要求的[23项](unified-directory-final.log)通过；不把跳过当成功。
- [实际React/Semi全流程](../2026-10-28-parity-review/card-ui/2026-10-28T07-00-15-096Z/result.json)：passed=true，版本0.5.2、独立fixture/profile。选题48条统一分页20/20/8，三状态10/7/31全量ID不丢；全部内容卡片/列表，搜索/筛选/页码返回，回收站切回正常内容，单击T041续写，T005/T019/T020/T046保留原源逻辑。任务数与目录事实不变。
- 新建调研红框说明删除，深度只粗体。1280/960宽截图无横向溢出；取消/重开保留输入后清理测试marker，未发模型任务。研究body487px，960窄窗内部滚动可到末项。直接原视频/素材目录走真实IPC，只stub外部浏览器/Finder终点，原卡ID与绑定目录有记录。
- 先前一次未知导航及两次探针断言不匹配保留于parity-review；全新profile+不可聚焦窗口的新run未再现，不声称已确定根因。
- [最终DMG的Finder显示简介](native-ui/finder-app-info.png)：名称/图标/Apple芯片/0.5.2/公司版权/实际大小与时间通过。Finder4,215,604,205字节，磁盘4.25GB；创建及修改为本机2026-10-28 15:00。逻辑普通文件字节另见[产物属性](artifacts.json)，不混为同一口径。
- [最终镜像应用签名核验](dmg-signature-verification.log)exit0。[插件ZIP](plugin-zip.json)解压后2054项与stage逐项相同，无AppleDouble额外条目。
- [桌面交付校验](delivery-artifacts.json)：DMG、blockmap、插件ZIP与SHA256。桌面目录 `/Users/mac/Desktop/自媒体工作台-0.5.2-交付`。

当前用户的已安装0.5.1正在使用；本轮未覆盖运行中的应用，未切换其日常库绑定，也未更新两宿主旧聊天缓存。0.5.2已构建、最终镜像元数据已验；安装/安装后独立运行、关于与Dock、0.5.2宿主缓存及真模型业务待验。0.5.1安装证明不当作0.5.2已安装证明。Intel Mac/Windows未验，不宣称支持结果。

这是先给同事对照的可用核心流程检查点。后续用户要求的全部增长集合分页、剩余原Skill适配缺口在0.5.3工作区继续；未计入0.5.2冻结包。模型独立安装仅后续登记，不拆本次ASR负载。
