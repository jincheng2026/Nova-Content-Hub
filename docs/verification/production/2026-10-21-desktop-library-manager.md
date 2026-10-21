# 桌面内容库管理入口检查（2026-10-21）

这些材料来自独立临时库和实验源码构建，不是用户实际内容库、安装验收或生产发行记录。

## 保留的历史现场

- [首次 required 检查诊断](2026-10-21-desktop-library-manager-1792572641120-required-probe-failure-import.json)及[截图](2026-10-21-desktop-library-manager-1792572641120-required-probe-failure-import.png)：后台读取尚未释放 worker 时，边界断言收到 `BUSY`，预期为 `INVALID_INPUT`。探针随后增加有界等待，不放宽原边界断言。这份记录是失败现场，不代表通过。
- 后续独立运行保留的 [required 截图](2026-10-21-desktop-library-manager-1792572768476-required.png)和 [disabled 截图](2026-10-21-desktop-library-manager-1792572768476-disabled.png)展示桌面备份与维护入口。截图不能单独证明旧导入恢复、系统文件对话框或全部安全检查已经通过。

## 提交前发现的恢复缺口

移除一般的“从网页版迁移”入口后，已有 `started` / 导入任务的旧绑定仍会受后端保护，但缺少可见恢复动作。本次补回仅对历史状态出现的恢复卡：继续原任务、重新核验原备份与原目标、打开已完成结果；原目标被替换或格式变化时明确提示并阻止错误绑定。

常规管理界面继续提供新建、打开、备份、备份检查、恢复到新文件夹及升级，不新增一般网页版导入入口。恢复操作先清理旧内容编辑器；响应或状态未知时保留任务和输入，不允许把旧编辑对象写到新绑定。

## 最终独立构建回归

- 第一轮新构建的 required/import 与 required/reopen 均通过，保留[截图](2026-10-21-desktop-library-manager-1792575288412-required.png)。
- 同轮 disabled/import 的[诊断](2026-10-21-desktop-library-manager-1792575288412-disabled-probe-failure-import.json)及[截图](2026-10-21-desktop-library-manager-1792575288412-disabled-probe-failure-import.png)记录了等待超时：新目标已绑定、旧编辑器已清空，`seedPending=true` 且控制器仍忙。原探针对完整恢复只等待 10 秒，未涵盖随后的内置模板初始化。
- 探针改为先单独断言旧编辑器清空，再在 45 秒界限内等待完整初始化，不放宽绑定、数据和安全断言。此项仅调整测试入口，重新编译 native 探针；产品负载保持前述最终构建。
- 重跑 `npm run probe:desktop` 退出 0，required/disabled 的 import/reopen 四个阶段均通过。最终 [required 截图](2026-10-21-desktop-library-manager-1792575539034-required.png)及 [disabled 截图](2026-10-21-desktop-library-manager-1792575539034-disabled.png)与此轮对应；独立临时库、模拟文件选择，未操作实际用户内容库。

最终提交前执行结果另见[本次提交检查记录](../2026-10-21-precommit/README.md)；历史截图不代替最终源码回归。
