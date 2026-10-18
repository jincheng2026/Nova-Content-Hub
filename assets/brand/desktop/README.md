# Electron 应用图标

使用 `../nova-content-hub-icon-master.png`，与用户 2026-10-17 附图的解码 RGBA 像素 SHA256 相同：`664de9c7f11841a3e770bcc6346fb1b893e893e16e9ae3575ac3757a71d433bf`。原图不重绘、不改配色，保留透明边角。

- `icon.png` / `icon@2x.png`：512 / 1024px，运行时窗口与 macOS Dock。
- `icon.ico`：16、20、24、32、40、48、64、128、256px，Windows 窗口和后续 EXE/安装包。
- `icon.icns`：完整 16–512px 及各自 Retina 2x 版本，供后续 macOS app 打包。
- `manifest.json`：源文件与生成文件摘要，防止更新母版后继续使用旧图标。

在 macOS 执行 `npm run icons:build`，使用已锁定 sharp 缩放、系统 iconutil 生成 ICNS。Windows 构建直接使用提交的文件，执行 `npm run icons:check`；不要求 Windows 安装 macOS 工具。测试：`npm run test:icons`。运行目录随包携带资源，不能回退到仓库绝对路径。

窗口 ICO 与 Dock 接口依据 [Electron 窗口配置](https://www.electronjs.org/docs/latest/api/structures/base-window-options)、[nativeImage 格式与 DPI 尺寸](https://www.electronjs.org/docs/latest/api/native-image)、[Dock.setIcon](https://www.electronjs.org/docs/latest/api/dock)。ICO 多 PNG 容器依据 [Microsoft ICO 格式](https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)) 和 [Windows PNG 图标支持](https://devblogs.microsoft.com/oldnewthing/20101022-00/?p=12473)。

这些是应用资源，不代表已制作或验收 Windows EXE/macOS app 安装发行包；发行阶段须将同一 ICO/ICNS 配到实际打包器，再验收 Finder、开始菜单、任务栏与卸载入口。
