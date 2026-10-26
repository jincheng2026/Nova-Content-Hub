# 0.3.48：模板生成按钮固定在卡片底部

2026-10-26，冻结源码 `97163ed20950060b2d31b45324d1ae6543dbb968`，本地 annotated tag `v0.3.48-preview-mac-arm64` 指向该提交。未推送远端。此版本替代本轮先安装的0.3.47；0.3.47归档及安装证据保留。

## 用户要求与设计核验

“用此风格生成”移出图片覆盖层，置于每张卡片的信息区底部，始终显示。按钮底沿同排对齐；取消模板卡片的悬停抬升与缩放，避免按钮随卡片跳动。标题保留详情按钮的空间；已有拆解状态、禁用条件、生成回调、整组预览及详情操作不变。

| 规则 | 证据与结论 |
|---|---|
| Controls-01 | 沿用蓝色Semi主按钮及原可访问名称、禁用与生成处理器；主按钮常驻。 |
| Template-01 / Image-01 | 5/4/3/2列、长短标题与不同图片比例检查通过，图片不裁切，主按钮与图片区矩形不相交；renderer/截图与density.log。 |
| Template-02 / Template-04 | 主动作固定在卡片底部，同排按钮底沿一致；键盘聚焦与鼠标悬停前后按钮的绝对坐标/大小不变。用户最新“固定住”的要求优先于原卡片抬升参考；叠图预览保留。 |
| Template-03 | 已拆解模板无重复AI拆解入口；未拆解模板仍有次级入口。原来源资料与人工验收边界保留，工作流回归通过。 |
| Acceptance-01 | 0.3.48的check、native+renderer typecheck、density及onboarding探针和原生构建通过；见root-verification.json。0.3.47刚完成的完整桌面378/378不冒充本版完整回归，本版仅布局与版本变更，未再跑全套。 |
| Acceptance-02 | 实际安装版模板页已核对五张真实模板：图片完整、按钮均在底部、常驻对齐。窗口1280×860，截图2560×1720；system/templates-installed.png、reopened-templates.png。 |
| Acceptance-03 | 独立记录源码、隔离renderer、DMG/归档、安装app与原生系统展示；仅本机darwin-arm64预览。 |

## 包、安装与本地一致性

- DMG：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.48-darwin-arm64-preview.dmg`；SHA256 `81fa278e0b07dceda25cb5a25cda4efb1234e4483fa9b25ce74491dc18db98b3`；286545576字节，mtime 2026-10-26T08:05:35.012Z。
- 归档：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-mW7AXm/mac-arm64/自媒体工作台.app`。DMG内、归档与安装应用全树一致，1647项，树SHA256 `cfd0e5a77b361cf84b669572f6082667121beb8e538230f7dc374914cd7a7e4d`。
- 安装：`/Applications/自媒体工作台.app`。Finder归档与安装版均显示N图标、Apple芯片、版本0.3.48、公司版权；大小 **536,537,210字节**（磁盘上539.6MB），创建/修改时间2026-10-26 16:05。普通文件逻辑合计536536917字节是另一个口径。应用关于显示0.3.48 (0.3.48)及公司版权，system/截图留档。
- 19个Mach-O均thin ARM64，应用ad-hoc签名strict通过；随包Node及两宿主缓存Node的原有签名分别验证。未做应用Developer ID签名或公证。
- Codex、WorkBuddy均用官方CLI同步0.3.48，完整负载核验通过，其他插件/启用设置保全。当前助手会话未重载；未执行真实AI生成。
- 原工作区日常启动阶段 `workbench/dist-desktop/auth-disabled` 同为0.3.48，pairId一致，见system/reopened-process.json；旧DMG、归档与恢复副本保留。
- Cmd+Q正常退出后无主进程，按系统应用名重开后唯一主进程指向主安装路径，版本0.3.48，原内容库可读。见system/normal-quit.json、reopened-process.json。
- Dock独立视觉检查因CUA系统接口超时未取得截图；未据此宣称Dock展示通过。Finder与应用关于的图标、名称已分别核验；system/dock-metadata.json记录限制。

## 数据保全与范围

备份来自真实machine-binding绑定路径，未从cwd推断内容库；备份目录见library-protection.json。最终收据final-integrity.json：artifactIntegrity=true、strictLibraryUnchanged=true、bindingUnchanged=true、pairedPluginsUnchanged=true、transactionPhase=complete。原库2573项全部不变，新增/修改/删除均为0；完整绑定字节及旧版本恢复身份保全。

构建使用干净冻结工作树；输出、原生负载已复制回主仓库release目录后归档临时worktree。主仓库无关main.js及同期其他文档未纳入源码提交。

未进行完整根verify、0.3.48全套desktop重跑、Intel/Windows、正式签名/公证、卸载及真实助手生成验收。构建保留既有大chunk与关闭ASAR提示，未新增依赖。系统展示与平台要求以根AGENTS.md为权威入口。
