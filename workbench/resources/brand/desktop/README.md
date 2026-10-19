# Electron 应用图标

使用 `../nova-content-hub-icon-master.png`，与用户 2026-10-17 附图的解码 RGBA 像素 SHA256 相同：
`664de9c7f11841a3e770bcc6346fb1b893e893e16e9ae3575ac3757a71d433bf`。原图不重绘、不改配色，保留透明边角。

- `icon.png` / `icon@2x.png`：512 / 1024px，运行时窗口与 macOS Dock。
- `icon.ico`：16、20、24、32、40、48、64、128、256px，Windows 窗口和后续 EXE/安装包。
- `icon-mac.png`：1024px，macOS 专用满版不透明深蓝底图；只裁去原图透明外留白，不重绘 N、不改 N 的形状与配色。macOS 26 系统统一裁切圆角，避免给透明旧图再套灰白底板。
- `icon.icns`：同一 Mac 满版底图的完整 16–512px 及各自 Retina 2x 版本，供 macOS app 打包；Windows PNG/ICO 保留原来的透明圆角。
- `manifest.json`：源文件与生成文件摘要，防止更新母版后继续使用旧图标。

在 macOS 执行 `npm run icons:build`，使用已锁定 sharp 缩放、系统 iconutil 生成 ICNS。Windows 构建直接使用提交的文件，执行
`npm run icons:check`；不要求 Windows 安装 macOS 工具。测试：`npm run test:icons`。运行目录随包携带资源，不能回退到仓库绝对路径。

窗口 ICO 与 Dock
接口依据 [Electron 窗口配置](https://www.electronjs.org/docs/latest/api/structures/base-window-options)、[nativeImage 格式与 DPI 尺寸](https://www.electronjs.org/docs/latest/api/native-image)、[Dock.setIcon](https://www.electronjs.org/docs/latest/api/dock)
。ICO 多 PNG 容器依据 [Microsoft ICO 格式](https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10))
和 [Windows PNG 图标支持](https://devblogs.microsoft.com/oldnewthing/20101022-00/?p=12473)。

这些是应用资源，不代表已制作或验收 Windows EXE/macOS app 安装发行包；发行阶段须将同一 ICO/ICNS 配到实际打包器，再验收
Finder、开始菜单、任务栏与卸载入口。

2026-10-19 导出修正：原 master 文件及 RGBA 像素未改动。Mac 专用导出按 alpha ≥ 127 的主体边界取居中正方形（本母版 x=58、y=60、1138×1138），透明处使用 #061b4e，再无变形缩放；各文件 SHA256 记录在 manifest.json。macOS 13–15 不执行新版系统圆角裁切，可能显示方形底图，未在旧系统实机验证；当前 macOS 26 的实际 Launchpad 外观由安装验收确认。
