# 正常退出等待内容库任务完成

修复范围：`workbench/src/main/operation-queue.mts`、`desktop.mts`，以及队列回归、独立原生探针和原常驻探针的退出验证边界。没有修改共享库锁协议、worker 的 stop 原语、真实内容库或真实锁。本子任务未执行安装、版本修改或 git 提交；提交与后续打包由根线程统筹。

## 实际问题和最小修复

旧版在第一次 `will-quit` 立即 kill utility worker。`native-red.log` 记录真实 worker 已删除 owner、尚未 rmdir 时正常退出，最终“退出后锁目录仍存在”的断言失败；`native-red-release.log` 和 `native-red-release-paused.json` 记录隔离屏障现场。测试只在临时副本的指定库锁路径包装 unlink，未碰真实库。

现在队列 `close()` 同步拒绝新请求，并等待 active、foreground、background 的所有已接受任务成功或失败结算。第一次 `will-quit` 阻止退出、封队列、关闭 watcher/提醒并移除电源监听；排空后才停止两个空闲 worker，再次 quit。重复 quit 不重复 drain，IPC finally 和提醒生产者不能复活监听或排入新任务。没有超时强杀。

已核对 startup：`DesktopController.initialize()` 只读取 BindingStore 并设置 needsReselect，`readBootstrapRecovery()` 的恢复回调也只执行这类本机绑定操作；该窗口没有库 worker 或 seed 调用，不需要把 bootstrap 自己的 serial 嵌套进桌面队列。

## 命令和证据

- `node --test workbench/test/operation-queue.test.mjs`：先红，新增 close/drain 两项失败，见 `queue-red.log`。
- `node --test workbench/test/operation-queue.test.mjs workbench/test/resident.test.mjs`：14/14 通过，见 `queue-resident-green.log`。包含双优先级成功/失败排空、同步拒新、重复关闭及保存/取消退出。
- `npm run typecheck:native --prefix workbench`：通过；随后 `node workbench/node_modules/typescript/bin/tsc -p workbench/tsconfig.native.json` 也通过，更新验证用 native probe，见 `typecheck-native.log`。
- `npm run build --prefix workbench -- --auth both`：退出码 0，两模式均构建，见 `build-auth-both.log`。这是当前 main 与最终 renderer 的组合构建，仍是 0.3.28；未安装。
- `node workbench/scripts/graceful-quit-probe.mjs docs/verification/production/2026-10-20-graceful-quit`：退出码 0，见 `native-green.log`、`native-release.json`、`native-initialize.json`。两个真实 utility worker 屏障分别覆盖 mkdir→owner 写入、owner unlink→rmdir 的空锁窗口。两阶段均确认 accepted 保存与后台图片排空、重复 quit、两个 worker 停止时 pending 为 null、late 图片 404、watcher/提醒未复活、锁目录消失。
- `node workbench/scripts/resident-probe.mjs`：退出码 0，见 `resident-native.log`。原生 save/discard 两阶段均通过，保留真实托盘、隐藏/唤回同一草稿、第二进程唤回、取消退出、失败保存保留草稿、保存后退出正文落盘、明确放弃后退出的完整断言。

原生收据中的 6 次 worker 调用来源已核对：两次图片后台 list、一次 renderer 已接受的前台 list、保存的 mutate→queryMutation→readContent。断言分别计数前台 list 和图片任务，没有把额外正常读取误判为退出错误，也没有删减保存覆盖。

`npm test --prefix workbench` 的 agent 重复运行在根线程已经独立启动完整套件后主动停止，`desktop-tests.log` 只代表停止前的部分通过，不代表整套完成。整套结果由根线程独立记录。

原常驻探针最初在第一次 `will-quit` 自行 openLibrary，和新的 drain 阶段任务冲突，见 `resident-old-boundary.log`。只将其两处验证读库移到最终 `quit`，保留原有保存正文/放弃断言，不修改产品。

## 验证边界

所有原生验证使用临时 userData 和临时库，不修改运行中的实际应用。此改动不认领、删除或修复已有 owner 不明的空锁；操作系统强制结束/掉电仍可能中断进程。正常退出若真实文件操作一直不返回，会继续等待保护资料。
