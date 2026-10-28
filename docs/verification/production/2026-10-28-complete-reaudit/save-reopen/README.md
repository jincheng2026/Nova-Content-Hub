# 保存/重开复查入口

完整结论见 [findings.md](findings.md)。本项有明确未通过项，不能整项标绿：installed模块Electron宿主中的同进程导航90秒有界失败、两次25秒flush响应超时均保留；不能外推为主线程真正.app的导航结论。

T029手改与意见、T044真实包装选择均准确落盘并被独立进程读回。最后一次仅输入原final并等待原页自动保存，不调用flush；11.010秒落盘。进程退出后重新读取磁盘，T029/T044全部作者fields与JSON外HTML均恢复；原ZIP、静态解压source和installed模块均未变。见 `restore-final-result.json`、`post-exit-author-fields.json`。

顶层 `runner-result.json.passed=true` 仅表示最后 `restore-final` 阶段，不能覆盖各attempt失败。完整有效业务组8个：5通过、3失败；另2次harness准备失败分别留档。

本项使用真正installed desktop.mjs及对应模块，`app.isPackaged=false`、窗口隐藏的Electron测试宿主，userData/library全部temp；不是Finder/Dock启动验证。主线程真正.app对照证据单列。
