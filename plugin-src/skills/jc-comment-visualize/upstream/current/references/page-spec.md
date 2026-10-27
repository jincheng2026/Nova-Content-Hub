# 页面规范（P4 写 HTML 前必读）

页面采用白底、蓝色强调和清楚的阅读层次。实际模板在 `assets/report-template.html`，数据入口与检查见 [report-contract.md](report-contract.md)。大李、西门旧页用于核对分析和材料，不再作为整页复制的起点。

## 阅读与布局

- 首屏说明研究对象、材料范围和最值得关注的发现。只展示帮助判断的数字，不固定三张金句卡或待拍板框。
- 单行粘性导航，名称简短清楚，窄屏可横向滚动；锚点滚动避开导航。章节由内容决定，通常控制在 5 至 7 个。
- 标题可以是清楚的问题或有依据的判断。不把心理推测写成标题，不固定「现状＋转机」「所以→」等句式。
- 正文允许连贯短段落，补齐对象、背景和解释。关键原话在对应发现旁直接可见，完整明细再折叠；不按两行强制隐藏内容。
- 数量、比较与分布用图；解释关系可用短段落或对照卡。查询精确值用表格，不设置表格数量配额，不为每章配一张图而制造关系。
- 蓝色用于重点和交互，灰色用于参照与范围说明。没有明确比较主角时可统一数据色，不强制每图恰好强调一条。避免连续大蓝横幅和渐变色块。
- 对象分析与个人建议分成明确章节。建议放在分析之后，每项能回到原发现和本人材料；有实际待决事项才列出来。

## 页面结构

1. 标题、采集日期、材料范围及简短结论。
2. 单行导航。
3. 主题数量与获赞，分别标单位、实际值、样本数。图旁有原文入口，允许切换排序和视频/层级范围。
4. 具体发现：判断、代表原话、解释及必要的其他解释。没有证据的板块说明缺口，不填空卡。
5. 对个人的建议：引用发现和本人材料，说明行动与检查方法。用户未要求写稿时不生成口播脚本或口令。
6. 原文、范围、未取得材料与采集说明。机器检查结果保存在数据审计字段或检查记录里，不作为正文内容。

## CSS 令牌

```css
:root { color-scheme: light;
  --page:#f5f5f7; --surface:#ffffff; --ink:#1d1d1f; --ink2:#606873; --muted:#747b85;
  --line:#e8eaf1; --border:rgba(18,20,26,.07);
  --navy:#0071e3; --navy2:#287dce; --navy3:#83b3e2; --navy4:#d7e7f7; --navy5:#eff6fd;
  --grad:linear-gradient(120deg,#2251ff,#00a6ff);
  --warn:#e88b0e; --warn-soft:#fdf4e0;
  --red:#e5484d; --red-soft:#fdedee;
  --hl:#fdf0b3; }
/* 暗色两段（@media prefers-color-scheme + [data-theme="dark"]）：
   --page:#0e1016 --surface:#171a22 --ink:#f3f4f8 --ink2:#b8bdcc --muted:#818699
   --line:#282c3a --navy:#a7b8ff --navy2:#6d8bfa --navy3:#4459c9 --navy4:#28325e --navy5:#1d2340
   --grad:linear-gradient(120deg,#4d74ff,#00b7ff) --warn:#f0a33c --red:#f26d71 --hl:#45390f */
body { font:15px/1.7 system-ui,-apple-system,"PingFang SC","Segoe UI",sans-serif;
  font-variant-numeric:tabular-nums }
section { background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:24px 26px; box-shadow:0 1px 3px rgba(18,20,26,.05) }
mark { background:var(--hl); padding:0 3px; border-radius:3px; font-weight:600 }
```

## 证据与解释卡

数据绑定的组件由生成器输出，下面展示阅读顺序，不手写真实 cid 或样本数字。引文保留原字词和标点，允许高亮；来源、获赞和层级放在引文旁边。

```html
<article class="finding">
  <h3>具体、能被证据支持的判断</h3>
  <p>说明观察到了什么，读者需要的背景也放在这里。</p>
  <blockquote><p data-original="source-id">原话逐字呈现</p><cite>来源 · 评论层级 · 获赞</cite></blockquote>
  <p>解释这些材料怎样支持判断，补齐中间发生了什么。</p>
  <p class="scope">有必要时说明其他解释与适用范围。</p>
</article>
```

方法论的层数、情绪词和图形轮廓都不是必填项。尤其不能把「最深处」「不愿承认」等推演填进卡片，再用颜色深浅表示它更确定。

长报告使用共享的 `scripts/reading_layout.py` 和 `assets/reading.css`：桌面并列关键原话与解释，窄屏依次展开；建议并列具体做法与检查办法。输入可在独立的 `presentation` 对象中指定 `version: 1`、`emphasis` 精确文字片段、按来源 ID 指定的 `quote_emphasis` 与 `source_labels`，以及 `default_level`。强调片段必须来自已确认原文，不能把 HTML 或改写文字放进这些字段。生成器只插入句末阅读间隔与强调标记，保留原文字词和顺序，分析与统计的冻结内容不随排版更改。

`presentation.evidence_styles` 可将已核对的发现 ID 指定为 `thread`，把同一楼中按先后顺序排列的主引文连起来；必须核对根评论、回复对象与发言账号，不能把不同的人串成一个人的心理历程。其他情况使用并列原话。主引文保持可见，补充依据和大量原始评论可折叠，来源链接仍需展开并定位对应原文。此阅读组件也供账号报告使用，不向 Skill 文件写入具体研究对象的数据。

## 应用建议卡

一项建议包含：它源自哪个发现、在什么前提下适用、具体做什么、怎样判断有效。个人建议还要有本人材料。建议数量由证据决定，不固定两份脚本；没有实际领取资料或转化任务时不加口令。

## 定性比较

原话支持的差异可以用并列卡或简表表达。没有数量时不把弱、中、强换成 25、50、75 的条长，也不相加判断哪种心理力量获胜。只有真实的步骤与先后关系才画流程；并列信息不加因果箭头。

## 对比模板：并列材料

左右采用同一比较维度，各自保留来源和样本范围。纯文字差异可用并列卡；精确值较多时用表格。不同分母、不同单位不能用同一条长刻度暗示可比。

```css
.duel { display:grid; gap:11px; margin-top:12px }
.dlabel { font-size:11.5px; font-weight:700; color:var(--muted); margin-bottom:3px }
.drow { display:grid; grid-template-columns:1fr 26px 1fr; gap:6px }
.dl,.dr { border-radius:8px; padding:8px 12px; font-size:12.5px; line-height:1.55 }
.dl { background:var(--grey-soft,#eceef3); color:var(--ink2) }
.dr { background:var(--navy5); border:1px solid var(--navy4) } .dr b { color:var(--navy) }
.dvs { display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:800; color:var(--muted) }
```

```html
<div class="duel">
<div><div class="dlabel">对比项</div><div class="drow"><div class="dl">对方/市面…</div><div class="dvs">VS</div><div class="dr">我方/买方 <b>关键数字</b></div></div></div>
</div>
```

## 样例与验证

`assets/example-report.html` 是随 Skill 提供的合成预览，由 `scripts/render_report.py --example` 生成，明确标注合成数据。真实数据只放任务目录。交付链接指向已生成报告，不指向含占位符的模板。

1. 运行 publish_check.sh，核对引用、统计、正文与嵌入数据一致性，以及分析文字中的生硬表达。真实引文不受文风词表约束，引用真实性另行核对。
2. 通读标题与代表原话，判断是否能看懂发现；解释中有无跳步、读心或把同现写成因果。
3. 在可用且允许的浏览器检查桌面与窄屏：导航、图表标签、正文换行、原文定位、筛选和空结果。没有真实浏览器检查就记录未完成，不能用文件存在或 DOM 模拟替代。
4. 检查通过后保存结果；后续修改影响的项目需重新检查，不以「只跑一次」跳过修复后的验证。
