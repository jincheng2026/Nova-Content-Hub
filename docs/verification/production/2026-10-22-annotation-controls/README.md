# 候选操作栏与位置批注

本轮是已冻结0.3.42之后的源码增量，基线为f9e6965；不改动已安装应用、原图或真实用户内容库。

对应用户截图三项反馈：候选卡不再插入完整批注/坐标正文，备注沿用现有信息入口；Semi TextArea只保留外层边框与焦点；标注工具使用图标，并新增选择／移动以拖动已有点、框和划线。移动继续使用现有百分比坐标与文字序列化协议。

设计规则：Image-03、Controls-02/03、Surface-03。工具入口参考本地旅游工作台 `workbench/src/renderer/components/editor/AnnotateMode.vue` 的选择／框／画笔；保留本项目点选工具与显式保存流程。

## 验证

主线程审查真实diff，并独立执行以下检查，退出码均为0：

- `npm run typecheck:desktop`，原生与渲染端类型检查通过，见typecheck.log。
- `node --test workbench/test/cover-gallery.test.mjs`，11/11通过，包含移动边界、文字/框尺寸/线段间距、原对象不变、原协议往返，以及高精度位置零移动不产生修改。
- `NOVA_PROBE_EVIDENCE_DIR=docs/verification/production/2026-10-22-annotation-controls/probe node workbench/scripts/annotation-layout-move-ui-probe.mjs`，见probe.log及probe/evidence.json。
- `git diff --check`通过。

执行代理另运行原有cover-gallery-ui-probe通过，主线程检查gallery-regression-agent.log；related-tests-agent.log另记录11项同一几何/序列化回归。旧探针只调整被本次UI改动影响的定位与结构断言，原有图片坐标、绘制、预算、草稿保存及提示词完整性检查保留。新证据写入 ../2026-10-22-annotation-layout-move/regression/gallery，没有覆盖既有发布目录。

| 规则与反馈 | 本轮观察和断言 | 主线程检查的截图/证据 |
|---|---|---|
| Image-03、Controls-03：候选动作错位 | 混合有注释、无注释、长备注及不同图片比例，同排动作栏顶部差小于0.01px；卡片不再展示坐标正文，完整内容保留在信息/批注编辑入口 | probe/gallery-1280x860.png、probe/gallery-960x680.png、probe/evidence.json |
| Controls-02：输入叠层 | 整体与位置输入内部边框0，整体输入外层边框1px、内部margin0、最小高度100px；聚焦仅外层显示蓝环。公共Semi autosize从50px增长至130px，禁用态保留 | probe/annotation-focus-960x680.png、probe/evidence.json |
| Image-03：图标与移动 | 四个可命名/悬浮提示/选中态图标；实际指针从编号点、框内部、路径中部拖动，框宽高及划线形状/文字保留；边缘编号可从可见外缘抓取 | probe/moved-point-box-path.png及探针断言 |
| Image-03、Surface-03：操作保护 | 单击选择不产生修改；pointercancel、lostcapture、blur仅取消当前移动，已有草稿保留；不自动保存，关闭有未保存提示；删除清除旧选择 | probe/evidence.json、probe.log |
| Image-03：原业务契约 | 满20处仍可移动；移动后编辑文字、保存、重开、原格式解析与按批注修改提示词均保留对应坐标和完整文字；原点/框/线创建仍可用 | probe/cap20-moved-refinement.png、probe/evidence.json |

两种视窗为实际内容尺寸1280×860和960×680；合成图片与隔离IPC，不接触真实用户内容库。本轮没有改版本、打包或安装；真实助手生成、安装后验收、Windows与Intel实机未检查。已安装0.3.42与本轮源码分别记录。
