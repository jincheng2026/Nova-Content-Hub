# Electron 应用图标

使用 `../nova-content-hub-icon-master.png`，与用户 2026-10-17 附图的解码 RGBA 像素 SHA256 相同：
`664de9c7f11841a3e770bcc6346fb1b893e893e16e9ae3575ac3757a71d433bf`。原图不重绘、不改配色，保留透明边角。

- `icon.png` / `icon@2x.png`：512 / 1024px，Windows / Linux 运行时图标。
- `icon.ico`：16、20、24、32、40、48、64、128、256px，Windows 窗口和后续 EXE/安装包。
- `icon-mac.png`：1024px 透明画布，母版圆角主体缩到 824px 并居中，四周保留 100px 透明区；不重绘 N、不改 N 的形状与配色，不加灰白底板。图像自带透明圆角，不依赖系统或 Dock 接口自动裁切。
- `icon.icns`：同一 Mac 图像的完整 16–512px 及各自 Retina 2x 版本，供 macOS app 打包；Windows PNG/ICO 保留原来的透明圆角。
- `manifest.json`：源文件与生成文件摘要，防止更新母版后继续使用旧图标。

在 macOS 执行 `npm run icons:build`，使用已锁定 sharp 缩放、系统 iconutil 生成 ICNS。Windows 构建直接使用提交的文件，执行
`npm run icons:check`；不要求 Windows 安装 macOS 工具。测试：`npm run test:icons`。运行目录随包携带资源，不能回退到仓库绝对路径。

窗口 ICO 与 Dock
接口依据 [Electron 窗口配置](https://www.electronjs.org/docs/latest/api/structures/base-window-options)、[nativeImage 格式与 DPI 尺寸](https://www.electronjs.org/docs/latest/api/native-image)、[Dock.setIcon](https://www.electronjs.org/docs/latest/api/dock)
。ICO 多 PNG 容器依据 [Microsoft ICO 格式](https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10))
和 [Windows PNG 图标支持](https://devblogs.microsoft.com/oldnewthing/20101022-00/?p=12473)。

这些是应用资源，不代表已制作或验收 Windows EXE/macOS app 安装发行包；发行阶段须将同一 ICO/ICNS 配到实际打包器，再验收
Finder、开始菜单、任务栏与卸载入口。

2026-10-19 导出修正：原 master 文件及 RGBA 像素未改动。Mac 专用导出按 alpha > 127 的主体边界取居中正方形（本母版 x=58、y=60、1138×1138），移除外围低透明度噪点，主体 alpha 归为不透明，边缘内收 1px 后柔化，再缩到 824px 并放入透明画布。这样不会把深蓝色填进透明圆角，也不会把黑色底色烘焙进抗锯齿边缘；Windows 与托盘产物不变，各文件 SHA256 记录在 manifest.json。

测试覆盖 Mac PNG 的透明留白、圆角和内部不透明像素，以及 ICNS 每档尺寸的相同 alpha 轮廓和 1024px 完整 RGBA 一致性。系统 iconutil 的旧式小尺寸编码会转换半透明边缘 RGB，未声明各档颜色逐像素相同。Finder、Dock、Launchpad 的最终外观仍需实际安装验收。
