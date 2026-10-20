# 0.3.32 共享选择控件定向核验

范围：`PopupSelect` 的短菜单交互；不修改封面生成规则、照片本人声明、失效引用或草稿保留规则。

确认的问题：原实现把所有标记 searchable 的列表都设为 252px 虚拟列表，包括只有 4 个选项的比例菜单，同时把已选值区域切换成搜索输入。短菜单因此包含多余空白和搜索草稿。

调整：最多 7 项使用 Semi 普通菜单与自动高度；超过 7 项保留原搜索与虚拟列表。共用入口同时覆盖人物、比例、默认值、内容资料、发布、模板历史及提示词等调用位置。

验证命令（均退出 0）：

```sh
node workbench/scripts/cover-selection-ui-probe.mjs
npm run typecheck:renderer --prefix workbench
node --check workbench/scripts/cover-selection-ui-probe.mjs
```

定向 probe 使用实际 React/Semi/CoverPanel，独立 Electron 用户目录与合成 bridge，不读写真实内容库。最终 1280×860 窗口：原生鼠标选择 16:9，原生键盘改为 1:1，再改回；长照片列表搜索、改选与改回；本人声明禁用原因可见；刷新保留明确选择；生成请求确实含 `ratio:16:9` 与 `photo.id:photo-b`。较小 900×620 向上弹菜单也通过同一检查。无新增依赖。

新断言在调整前失败于“short ratio menu has plain options and no search draft”，调整后通过。早期未等待弹层定位的失败属于自动化过早点击，不是产品状态回写证据。未确认用户所述选择后仍为 3:4 的独立状态重置根因，也未发现另一处确定的同类 effect 重置；不据此宣称该未复现根因已经修复。

此为源码组件级 UI 与请求参数核验；未运行全量套件，未执行真实助手生成、安装包或其他平台验收。
