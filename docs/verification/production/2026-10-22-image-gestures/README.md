# 图片查看器手势操作

这是0.3.42冻结发布之后的源码增量，安装目录和已冻结DMG不随源码改变。共享入口为 `ImageViewport`；首页封面、候选、比较、模板样张、还原图、人物照片与资料图片继承同一行为，批注画布仍保留其坐标模型。

## 操作约定（Image-02）

- 触摸板双指捏合、Ctrl＋滚轮：指针位置缩放；同一代码用于Mac和Windows。
- ⌘＋滚轮、按住鼠标左键＋滚轮：同样缩放，普通滚轮和双指平移仍用于滚动。
- 双击：在适合窗口与细节之间切换；拖动查看细节。
- 保留按钮、缩放百分比、适合窗口、原始尺寸及原有键盘入口。仅改变图片显示，不改原图、下载内容或应用整体缩放。

手势事件仅在图片视区绑定，关闭/换图清理状态；连续事件累计缩放，并在图像可滚动边界内保持指针锚点。

## 技术依据与验证边界

[MDN wheel事件](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)和[ctrlKey说明](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/ctrlKey)说明触摸板捏合会产生 `ctrlKey=true` 的wheel事件；使用局部非passive监听取消默认操作。[Electron webFrame文档](https://www.electronjs.org/docs/latest/api/web-frame)说明默认禁用整页视觉缩放；本次不启用整页缩放。

## 验证结果

主线程审查真实diff后独立复验，以下命令均退出0：

- `npm run typecheck:desktop`：原生与渲染端类型检查通过，见typecheck.log。
- `node --test workbench/test/cover-gallery.test.mjs`：10/10通过，保留原批注点/框/路径、原字符及坐标转换，见annotation-regression.log。
- `node workbench/scripts/image-gestures-ui-probe.mjs docs/verification/production/2026-10-22-image-gestures/probe`：Electron44.9.0、darwin-arm64，57/57通过，见probe/result.json、probe.log。
- `git diff --check`：通过。

Image-02逐项覆盖：960×680/1280×860下的Ctrl/Meta真实CDP滚轮、普通滚动、指针锚点、同一任务内快速/反向事件、缩放边界、小图居中跨越溢出、极端长宽图、按住左键滚轮、实际拖动与捕获取消/丢失/窗口失焦、像素/行/页单位、键盘、换图、错误恢复、卸载后监听移除及重开不重复监听。Surface-03的内层Esc/焦点返回也通过。主线程检查probe/gestures-960.png，按钮与操作提示完整可见。

首次主线程命令因cwd与脚本相对路径重复而未启动，保留first-launch-path-error.log；修正启动路径后完成上述57项检查，未为此改动产品代码。

本次没有改版本、重新打包安装或操作真实用户内容库，已安装0.3.42仍对应原冻结tag。Chromium输入探针验证的是应用事件路径；未验证物理Mac触摸板、Windows精密触摸板或不同鼠标驱动，未宣称跨平台实机验收通过。
