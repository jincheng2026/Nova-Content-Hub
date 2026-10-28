# 0.5.3 严格入库与外部 ASR 定向审查

日期：2026-10-28。范围：计划 Task 1/2；仅审查当前工作区所列接线，不构成安装包或全平台验收。基线 HEAD 为 `d16277972dfad01bbef5d5b98cda1be0c26def4a`，以下内容包含尚未提交的改动。

结论：发现 2 项可复现 P2；本轮未发现可复现 P0/P1 或正式入库 fail-open。没有修改产品源码、真实库、用户设置、助手缓存或真实模型；未联网。两项复现仅使用临时目录，结束后删除。

## Findings

### P2：无 ASR 的任务仍被失效本地环境阻断

- 位置：`workbench/src/main/production-controller.mts:128`。
- 触发：设置曾登记 `qwen3-asr`、`localModule=mlx_audio` 和绝对 Python/模型路径；随后 Python 被移走。即使当前 `mode=cloud`，创建 `workflow=jincheng-stage, stage=synthesis` 的任务仍在计算 `externalAsrIdentity` 时失败。
- 原因：身份计算发生在任务工具集合之外，条件只看留存本地路径和模块，未判断任务是否使用本地 ASR。下方明确为综合调研设置 `tools=[]`，却在到达任务创建前就被 ASR 环境检查阻断。
- 证据：在新建临时 `createLibrary`、真实 `DesktopController`、隔离 `BindingStore`、worker `execute` 上调用 `startProductionTask`。回调提供上述设置，返回 `EXTERNAL_ASR_EXECUTABLE` 且任务数为 0；同一输入恢复默认 ASR 设置后创建成功，工具列表为 `[]`。未执行解释器或外部服务。
- 建议：先确定任务的服务能力和模式，仅在确实需要冻结本地 ASR 环境时求身份；无 ASR 任务及纯云模式不依赖已停用的本地路径。增加该场景回归。

复现输出：

```json
{"mode":"cloud","workflow":"synthesis","error":"EXTERNAL_ASR_EXECUTABLE","tasks":0}
{"control":"default settings","tools":[],"created":true}
```

### P2：依赖实现变化未使冻结环境身份失效

- 位置：`workbench/src/main/external-asr.mts:62-63`。
- 触发：冻结已有 MLX 环境后，原位修改 `site-packages/mlx_audio/stt/models/qwen3_asr/qwen3_asr.py` 等包内部实现。正常文件写入不会改变 `site-packages` 根目录 mtime，也不会改变当前枚举的三个入口文件。
- 原因：身份只包含 site-packages 根 mtime，以及 `mlx_audio/__init__.py`、`mlx_audio/stt/utils.py`、`qwen_asr/__init__.py` 的大小和 mtime；真正的模型实现、其余模块及原生依赖未纳入。故启动前后 `assertExternalAsrIdentity` 可把不同实现视为同一冻结环境，也无法让依赖变化使 readiness 缓存失效。
- 证据：临时 venv 目录及假模型文件，仅计算身份，不执行代码、不加载权重。先创建实现文件内容 `version A`，保存身份；再将其写为不同长度的 `different version B implementation`，未恢复或伪造时间戳。重新计算身份完全相同，`assertExternalAsrIdentity` 通过。
- 建议：对承诺冻结的实际包内容建立有界清单与内容摘要，或采用能够检测受支持环境实现变化的登记身份；涉及解释器链接、模型与依赖的有效变化应使检测缓存与旧任务执行拒绝，要求重新检测。增加包内部文件变化回归，避免仅测试顶层权重变化。

复现输出：

```json
{"changedDependency":"mlx_audio/stt/models/qwen3_asr/qwen3_asr.py","identityUnchanged":true,"assertExternalAsrIdentity":"passed despite changed implementation"}
```

## 核对通过与边界

- 新 intake v2 在下载时要求已登记来源；仅从 main 的已授权媒体资产读取 bytes，冻结 intake v2 路由调用 native verifier。正式发布再次检查原片 hash、proof 与封面 PNG/hash、源 manifest、实际时长及字幕重建结果。
- 发布采用暂存目录校验后 rename；逐视频结果独立记录。正式 receipt 重放重新读当前文件并核对文件摘要；历史 receipt 不被升级为严格成功。归档恢复使用原中间证据路径或归档路径，未发现本轮可复现的绕过。
- 外部 ASR 准备阶段携带 identity，broker 同时比较当前配置、prepared 配置及任务冻结 identity；invoke 执行前后再次校验 identity。以上校验的覆盖限制见第二项 finding。
- 本轮查看了已有 `/tmp/nova-research-runtime-final.log` 的 50/50 和 `/tmp/nova-053-resource-full.log` 的 30/30 结果；没有将其称为本审查者重新运行的测试，也未对变化中的目录执行全量测试。
- 独立 codec 构建和真实 ServiceTools 短音频/MP4 同源证明由主执行者继续验收；本轮未把明确未完成的构建/实测当作代码缺陷。未验收最终包、安装升级、Intel Mac、Windows 或同事机器。
- 初读使用 code-review 技能的标准/规格核对思路；本轮遵循已限定的只读、单轮风险审查范围，未扩展为并行分派或泛化风格审查。

## 审查结束时源码摘要

这些 hash 标记本轮观察版本，不是发布冻结承诺；后续修复须由负责人另外记录。

| 文件 | SHA256 |
| --- | --- |
| workbench/src/main/external-asr.mts | `0a3f1ff17d3b6f42d283d3a6679b24f98740bdac006234451ef48941bb41ac29` |
| workbench/src/main/production-controller.mts | `24a84a5ab61a8df05c3116ce4ce61aa2dbf4af494d5b4924a550ec333a1eb276` |
| workbench/src/main/production-services.mts | `d5afc77e42614a1db75ad70893590ffd73be25fd7d224e706c2dc3055d36bc2d` |
| workbench/src/main/service-tools.mts | `5ea9b723176bbb1b6f09a6b533eb9655a9625320fe64ea2023832146b35b5513` |
| plugin-src/src/lib/research-runtime/index.mjs | `ad8e2c9fd98a21bd7877a6d9f314f703171f996880c7fc153a608f3771ea4f45` |
| plugin-src/src/lib/research-runtime/intake.mjs | `7affe5bee3f54345287009bdbde9513661b6ba396154a049adad94ecb0b265cd` |
| plugin-src/src/lib/research-runtime/intake-proof.mjs | `3ce063ae01ea9a9294b70643c821006d512fb895ec6eccadbfda0462ad978b64` |

## 两项 P2 修复定向复核（2026-10-28）

**当前结论：两项 P2 均关闭。** 上文保留原始发现与当时摘要作为历史证据。本次仅复核两处修复及对应 broker 门禁，未重新执行全面审查；未发现修复引入的确定风险。

### P2-1：无 ASR 任务被失效配置阻断——已关闭

- `production-controller.mts:128-131` 现在排除 synthesis 和纯云模式；其他本地模式配置取身份失败时登记 `UNAVAILABLE`，不再因已经失效的本地路径阻止创建任务。
- `production-services.mts:45-46` 仍要求实际 prepared identity 与冻结值完全相同。合法运行身份为 SHA256 字符串，不可能等于 `UNAVAILABLE`；准备失败也不会执行。因此恢复环境后不能借旧不可用身份执行实际 ASR，需要重新登记/创建符合冻结契约的任务，不是 fail-open。
- 已读取新增真实 controller 回归及 `/tmp/nova-053-missing-asr-task.log`：本地仅用模式、失效 Python/模型路径下，synthesis 成功创建，`tools=[]`，没有冻结外部 ASR identity；日志 1/1 通过。本次未重复运行该测试。

### P2-2：包内部实现变化漏过身份校验——已关闭

- `external-asr.mts` 新增固定关键依赖路径的有界遍历，所选 Qwen/MLX 实现目录包含原问题的 `mlx_audio/stt/models/qwen3_asr/qwen3_asr.py`；每次核对重新读取 Python 源码并计算 SHA256。深度、目录项、单文件及累计字节都有上限，异常失败关闭。
- 本审查者仅运行 1 个最小测试：`node --test --test-name-pattern='freezes nested model implementation bytes' workbench/test/external-asr.test.mjs`，1/1 通过。该测试将实现改成同长度内容并恢复原 mtime，仍收到 `EXTERNAL_ASR_CHANGED`，直接覆盖并加强原复现条件。
- 已读取 `/tmp/nova-external-identity-green.log` 的 11/11 及新增用例源码，包括包内新文件、原生库普通修改、Windows 路径和超限后恢复；这些全组结果属于执行者提供的证据，不是本次复跑。
- 身份覆盖仍是明确列出的关键依赖面；大型原生库和模型权重采用路径/大小/mtime/inode 元数据身份，并非全环境、全权重的密码学完整性保证。本次关闭原始包内部实现漏检问题，不扩大为这类保证。

复核摘要：

| 文件 | SHA256 |
| --- | --- |
| workbench/src/main/production-controller.mts | `2a50885a9a006467b05ce501c75f880cc5e5fa0812c32dae40e921e5390016a6` |
| workbench/src/main/production-services.mts | `d5afc77e42614a1db75ad70893590ffd73be25fd7d224e706c2dc3055d36bc2d` |
| workbench/src/main/external-asr.mts | `5b5e480fdee5317775d996421dcf2b3c7ba637ed3c70c3317cbd9b38e9bef262` |

本次只追加本节；未改产品源码，未执行真实模型、网络、真实用户库或设置操作。codec 和最终包不在这次复核范围内。
