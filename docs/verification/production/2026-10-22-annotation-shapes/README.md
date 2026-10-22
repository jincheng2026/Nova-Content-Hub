# 封面批注：点选、标框与自由划线

2026-10-22，main（基线 bd5e29a）上的源码验收，随本功能提交保存。没有切分支、打包、安装，也没有访问用户真实内容库；已安装的 0.3.40 不包含本次源码修改。

保留原有点选与中心位置按钮，新增标框和自由划线。使用 SVG 覆盖层，原图字节不变。矩形可以反向拖动；画笔以至少 2 CSS px 采样，释放时补端点。一笔达到 128 点时明确结束并提示确认后分段继续，最多 20 个已确认标记。画完仍须填写文字并确认，取消不写入列表。副指针不能污染或取消主指针。

数据继续存于 candidate.note：旧点语法不变，新增可读 rect / path 行，原图坐标为 0–100% 一位小数。未知或损坏语法整体回退原文，不部分解析；空行、缩进、伪批注行和伪分隔符原文保留。未增加请求 schema、内容库版本或 handoff 字段。批注、整体要求、附加要求和定位说明合计超过 10000 字时阻止生成，保留输入。

## 命令与结果

| 检查 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck:desktop` | native / renderer 通过 | typecheck.log |
| `node --test workbench/test/cover-gallery.test.mjs` | 10/10 | gallery.log |
| `node --test --test-name-pattern='candidate refinement attaches\|mixed annotations persist' workbench/test/covers.test.mjs` | 2/2 | persistence.log |
| `node --test --test-name-pattern='annotation intent' plugin-src/tests/native-handoff.test.mjs` | Codex / WorkBuddy 2/2 | handoff.log |
| `NOVA_PROBE_EVIDENCE_DIR=docs/verification/production/2026-10-22-annotation-shapes node workbench/scripts/cover-gallery-ui-probe.mjs` | 真实 React / Semi / Electron 输入回归通过 | ui-probe.log、gallery/*.png |
| HEAD 旧实现与当前实现对同一混合批注 round-trip 断言 | 旧实现失败，当前实现通过 | red-green.log |

主线程在实施代理停止写入后独立复核实际 diff，并重跑以下检查，退出码均为 0：

| 独立复核 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck:desktop` | native / renderer 通过 | independent-typecheck.log |
| `node --test workbench/test/cover-gallery.test.mjs workbench/test/covers.test.mjs` | 49/49 | independent-models.log |
| `node --test --test-name-pattern='annotation intent' plugin-src/tests/native-handoff.test.mjs` | Codex / WorkBuddy 2/2 | independent-handoff.log |
| `NOVA_PROBE_EVIDENCE_DIR=/tmp/nova-annotation-shapes-independent node workbench/scripts/cover-gallery-ui-probe.mjs` | 真实 React / Semi / Electron 输入回归通过 | independent-ui.log |

主线程另外查看独立复跑的 annotation-wide.png，核对三工具入口、编号、框线与原图对齐、批注文字及底部动作。独立截图为临时输出，目录中 gallery/*.png 是实施验收保留的同场景截图。以上为针对性回归，不代表整个工作台测试套件或已安装应用验收。

临时库测试真实保存 note，重新 openLibrary / controller 后重读；以该保存内容创建固定请求，context.request.prompt 与请求文件逐字相同。参考图输入、内容库资源的 SHA256 继续等于原始图。原候选与历史请求保持不变。两个 host 的固定 context 包含完整框、轨迹、批注和补充要求；URL 仍只包含短任务提示，不泄漏完整批注。

UI probe 使用可信 Electron mouseDown / mouseMove / mouseUp，拖动时保持 leftButtonDown。覆盖横图、竖图、宽图、长图，各在 1280×900、900×700、620×700 窗口（内容视口通常扣除 32px 标题栏）下点选、反向标框、折线轨迹、浮层取消；确认前不进入列表，确认后编辑/取消/删除，保存/重开、resize 对齐、图外起笔拒绝、捕获后越界约束。还覆盖 pointercancel、lostcapture、切工具、途中 busy / disabled、副指针事件、128 点提示、20 标记上限、note 和最终 prompt 预算、失败后的完整确认与重试。UI 的 IPC/素材为合成夹具；真实持久化依据上一段临时库测试。

## 设计规则与画面

| 规则 ID | 结果与证据 |
|---|---|
| Foundation-01 / Controls-01 / Controls-02 | 复用 Semi 按钮、输入框及既有蓝白主题，工具组 aria-pressed 标识选中；busy / disabled 保持禁用。annotation-wide.png |
| Foundation-03 / Reading-02 | 文本与批注保留空行和缩进，右侧列表可滚动，整体要求与底部动作可达；annotation-wide.png、annotation-confirmation.png |
| Image-01 | 原矩形完整等比显示，SVG 对齐图像本身；4 比例 × 3 尺寸的坐标断言通过。annotation-path-wide.png、annotation-rectangle-narrow-tall.png |
| Surface-03 | 复用 ManagementDialog、原脏数据保护与收起恢复；弹层在窄窗内可达，草稿编号在文字浮层下方，避免覆盖输入。annotation-rectangle-narrow-tall.png |
| Interaction-03 | 只移植 SVG / 指针绘制思路，未移植旅游文章长图裁切、截图持久化或业务模型；无新依赖 |
| Acceptance-01 / 02 | 类型、针对性回归、实际 Electron 组件与截图通过；窗口尺寸如上 |
| Acceptance-03 | 仅当前 macOS arm64 的隔离 Electron 源码级验证。最终安装包、已安装应用、Windows / Intel Mac 原生验收未执行 |

未验证真实助手生图、宿主审批/原会话恢复的现场调用、完整键盘 Tab / Esc 流程、所有原图背景的逐色对比值或系统减少动画；沿用现有实现，不把本次针对性证据扩展为这些能力通过。没有新增撤销、平滑、多笔合并、移动几何或裁图能力。
