# 原生图片撤权探针判据

2026-10-18 的第二轮封面 Electron 探针已通过模板、照片失效选择、设置 dialog、唯一 job 入口、合成候选显示、选用与原字节导出，但最后加入的断言失败：调用 `covers.revoke()` 后，再给新的 DOM `Image` 设置已显示过的旧 URL，`onload` 仍返回 true，预期 false。

授权 Map 已清空；Chromium 可以复用 renderer 中已解码的图片，不产生新的协议请求。`Cache-Control: no-store` 不能撤回已交付 renderer 的像素。强制重载整个 renderer 会扩大到现有草稿/dirty 保护，未采用。

最终判据使用主进程 `net.fetch(url, {cache:'no-store'})`：撤权前真实协议读取返回 200 和 `image/png`；撤权后真实新读取被拒绝（网络拒绝或 404）。另外保留旧 URL 加 query 的真实图片加载拒绝测试。换库时清理编辑上下文/旧图片并生成新 epoch；本轮只承诺撤销新协议读取授权，不承诺抹除已显示字节。最终结果见 `cover-electron.log` 和 `cover-receipt.json`。
