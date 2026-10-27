# 飞书画板落地参考

落到飞书画板时读。命令细节以 lark-whiteboard、lark-doc 两个 Skill 为准，这里只写流程图专用的路线、骨架和坑。

## 路线选择

| 情况 | 路线 |
| --- | --- |
| 新建流程图 | DSL 路径（本文骨架） |
| 已有画板由 DSL 或手工绘制，只改排版 | `+export --output-type raw --output raw.json` 导出原生节点，改坐标写回，先说明 `--overwrite` 会整板重建 |
| 已有画板由 Mermaid 绘制，只改排版 | 在 Mermaid 源码上只改方向和分组，见下方「Mermaid 在飞书的坑」 |
| 用户点名要 Mermaid | 按用户，但先说明居中做不到精确控制 |

## DSL 骨架

[flowchart-skeleton.json](flowchart-skeleton.json) 是已验证的骨架，渲染结果见 [flowchart-skeleton.png](flowchart-skeleton.png)：顶部目标框，中间三列（左侧沉淀栏、居中主线、右侧分工栏），底部居中回流栏。复制后只改节点文字、数量和 id，不改布局属性。

结构要点：

- 根 frame `layout: vertical` + `alignItems: center`，保证目标框、三列行、底部栏都居中。
- 中间行 frame `layout: horizontal`，三个子 frame 分别是左栏、主线、右栏；主线 frame `alignItems: center`，主线节点自然落在同一条竖轴。
- 所有 `connector` 放在根 `nodes` 数组里，不能放进 children。主线连线 `fromAnchor: bottom` 到 `toAnchor: top`，`lineShape: straight`。
- 侧栏虚线 `lineColor: #BBBFC4`、`lineStyle: dashed`、`endArrow: none`，连到最近的主线节点；侧栏项目顺序尽量和主线节点顺序对齐，避免长斜线横跨整图。
- 菱形判断框宽度至少 260，两行文字才不折断。
- 每个 frame 显式写 `gap` 和 `padding`；没有 fillColor 和 borderColor 的 frame 会被编译器吃掉，被连线引用时会失效。

## 命令

本地渲染看图：

```bash
npx -y @larksuite/whiteboard-cli@^0.2.13 -i diagram.json -o diagram.png
```

取画板 token：文档里已有画板时 `lark-cli docs +fetch --doc <URL> --as user`，从 `<whiteboard token="..."/>` 取；需要新建时 `lark-cli docs +update --doc <doc_id> --command append --content '<whiteboard type="blank"></whiteboard>' --as user`，从返回的 `new_blocks` 里取 `block_type == whiteboard` 的 token。

写入分两步，中间必须跑补丁脚本：

```bash
npx -y @larksuite/whiteboard-cli@^0.2.13 -i diagram.json --to openapi --format json -o openapi.json
python3 <本目录>/patch_openapi.py openapi.json openapi.patched.json --panel-ids <左栏id>,<主线id>,<右栏或底栏id>
lark-cli whiteboard +update --whiteboard-token <token> --source @./openapi.patched.json \
  --input_format raw --idempotent-token <日期加标识，至少 10 位> --as user
```

右侧还有标注栏时加 `--outer-x <标注栏右边缘 + 30>`，否则回流线会穿过标注栏。`--panel-ids` 填 openapi.json 里面板框的 id（通常是 `o001:3`、`o001:10`、`o001:23` 这类没有文字的大圆角矩形）；不填时脚本按「无文字且宽高都大于 200」自动识别。

补丁脚本做四件事，每一件都是 2026-09-14 在飞书网页端实测出来的，服务端预览和 SVG 导出对这些问题一概不报错：

1. 文字 `vertical_align: "mid"` 改成 `top`。节点用 `height: "fit-content"` 时 whiteboard-cli 会内嵌文字并写 `mid`，网页端遇到它整块画板空白、页面脚本卡死，Chrome 标签页跟着挂。`middle` 会被 API 拒绝。
2. 删掉白底白边的纯布局容器（root、row、spacer 这类 frame）。它们在飞书里是实实在在的白色大方块，叠放顺序一变就盖住别的图形。
3. 直角折线拆成「4 像素白色拐点方块 + 直线」。网页端不画 `right_angled_polyline`，改成 `curve` 会卡死，只有 `straight` 可靠。连线上的标签改成独立文本放在线旁。
4. 按「面板框 → 节点 → 连线 → 文字」顺序写 `z_index`。不写时服务端自己分配，面板框有时会压在节点上面。

[content-loop-board-annotated.dsl.json](content-loop-board-annotated.dsl.json) 是在同一张图右侧加「现在怎么做 / 用了什么 / 判断」四色标注卡、下方加图例的版本，三列用 `alignItems: stretch` 加 `justifyContent: space-between` 对齐。[content-loop-board.dsl.json](content-loop-board.dsl.json) 是一张实际交付过的内容闭环图的 DSL，[content-loop-board.openapi.json](content-loop-board.openapi.json) 是它补丁后写入飞书并在页面上验证过的最终节点，改同类图时可以直接拿来对照。

已有内容的画板加 `--overwrite`，加之前告诉用户会整板重建。

回读核对：

```bash
lark-cli whiteboard +export --whiteboard-token <token> --output-type preview --output ./preview --as user
lark-cli whiteboard +export --whiteboard-token <token> --output-type svg --output ./board.svg --as user
```

`--output-type preview` 的输出是 jpg，`--output` 不要带 .png 后缀；预览图按图形外框裁切，绕到图外的连线会被裁掉，核对连线用 svg。`--output-type source` 只对 Mermaid 或 PlantUML 画的画板有内容。`lark-cli auth status` 没有 `--as` 参数。

## 树状图（能力地图、盘点图）的骨架

要画「根节点下面几个分支，每个分支下面若干项」的树时，不要给每个叶子画连线：叶子放进分支的 frame 里（浅灰底、有边框），只画根节点到各分支表头的直线，层级靠包含关系表达。原因：叶子竖着排时，父节点连到下面叶子的线会穿过上面的叶子；网页端又只可靠画直线。已验证的骨架见 [capability-map-tree.dsl.json](capability-map-tree.dsl.json)：图例行、根节点、七个分支列，34 张叶子卡按状态换底色，2026-09-14 在真实页面核对过。补丁时把分支 frame 的 id 全部传给 `--panel-ids`。

## Mermaid 在飞书的坑

只在处理已有 Mermaid 画板、或用户坚持用 Mermaid 时看。

- `flowchart TB` 只保证总体方向；嵌套 `subgraph` 里的节点不会自动居中，主线常被推到一侧。改法：主流程节点不放进任何 subgraph，只把侧栏放 subgraph。
- 回流线和回退线会把主线推偏。改法：改成节点内文字（如「不够回核对缺口」），或只保留一条从底部绕回的线。
- `~~~` 隐形连线在飞书画板里会画成实线。可行的补救：先带隐形线写入让飞书排版，再 `+export --output-type raw` 导出，删掉这些 connector 节点，用 `--input_format raw --overwrite` 写回。
- 菱形默认太窄，第二行文字会折断。补救：导出 raw 后把 diamond 的 width 改到 300 再写回。
- `+update --input_format mermaid --overwrite` 会整板重建；只改排版时输入源码必须逐字保留原节点文字。
- 用户说「刷新了没变化」或页面空白：先确认写的是用户指的那份文档和那块画板，再打开页面截图核对，而不是复述接口返回 ok。页面空白而服务端预览正常时，先查上面的 `vertical_align` 补丁有没有打。
- 连线从 frame 容器出发（如 `from: "UPGRADE"`）本地能渲染，飞书页面不画；回流线要从容器里的具体节点出发。
