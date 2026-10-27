# 安装启动钥匙串阻塞修复验收（源码）

日期：2026-10-28。基线源码：`1b78f7bd1d5045bcf8f26899baeb94c3434d9c13`。本记录覆盖未提交源码修复及隔离测试；最终重新构建、安装和原生启动结果由主线程在发布记录追加，不表示当前已安装候选已修复。

## 根因与边界

原已安装 0.5.0 / darwin-arm64 候选主进程 97458 在 `ServiceSettingsStore.initialize → read → encryptionAvailable → safeStorage.isEncryptionAvailable` 同步进入系统安全存储，BrowserWindow 尚未创建。主线程提供的 [原进程采样](2026-10-28-keychain-startup/original-main-start.sample.txt) 第 80 行起显示 `SecItemCopyMatching` / `SecKeychainItemCopyContent` 阻塞。未操作、解锁或自动批准受保护的 SecurityAgent，未读真实 Key，未改已安装包或真实 userData。

另一条隐含路径是 `ServiceTools.scrub` 对每个服务调用 `settings.secret`；本地 ASR 的成功结果同样经过此处，会尝试解密无关 Key，并可能触发同一钥匙串等待。

## 修复契约

- desktop 构造 `ServiceSettingsStore` 明确传入 `deferEncryptionCheck: true`。缓存状态区分 `unchecked / available / unavailable`。初始化、反复读取/状态读取、普通设置保存、清除 Key 均不调用 native 加密探测；磁盘 v1 格式不变。
- `secret` 先确认目标密文存在。只有已保存 Key 查看、授权 provider 取 Key、非空新 Key 保存才进入 native 探测及加解密；成功/失败更新缓存状态。缺少 Key 不探测，拒绝或加解密错误保留旧密文，不降级明文。`basic_text` 等禁止后端规则保留。
- `checkReadiness` 在 desktop 模式只检查本地组件并返回缓存的存储状态。被动研究 runtime 检查及无 Key 变更的“保存并检查”不主动解锁 Keychain；存储状态 unchecked 时自动 publication observer 仍不 ready。
- 结果脱敏只使用进程内已通过显式取 Key 得到的值，helper 仅处理字符串。不会为脱敏解密其他服务；同一进程轮转 A → B 后保留 A 的脱敏能力，覆盖尚未结束的旧请求回显。
- 设置页区分未检查和上次访问失败。Key 输入、查看及显式保存不因 unchecked 被禁用；清除及失败后重试保留。onLoad 不自动执行 readiness 或 Key 查看。
- 非 desktop 默认构造保留此前 eager `initialize/read/encryptionAvailable` API，已有调用者兼容；该边界有独立测试。只有 desktop 明确延期模式具备被动读取零 native 调用保证。

同步 safeStorage 在上述明确用户/已授权服务动作中仍可能等待操作系统许可；本修复不承诺此时主窗口并发响应。需要真实操作系统权限时由用户决定。旧进程或旧安装产物不因源码修改自动恢复。

## 测试证据

先写并运行回归：新测试初始 8 项中 6 项按预期失败，覆盖 eager 启动、缺少缓存状态、无关 Key 解密、轮转旧 Key 泄漏、observer 错误 ready。UI 初始针对“尚未检查”的断言按预期失败。修复后结果如下。

执行环境：macOS / darwin-arm64，Node v24.20.0；所有凭据及加密实现均为合成 fixture。没有访问真实 Keychain，也没有外部 provider 请求。

| 检查 | 结果 |
|---|---|
| `node --test workbench/test/service-settings-deferred.test.mjs workbench/test/service-tools.test.mjs workbench/test/service-credential-reveal.test.mjs workbench/test/service-cloud-asr.test.mjs workbench/test/service-frozen-config.test.mjs workbench/test/local-asr-initialization.test.mjs workbench/test/jincheng-research-services.test.mjs` | **82/82 通过，0 skipped** |
| `npm --prefix workbench run typecheck` | native 和 renderer 均通过 |
| `node workbench/test/service-settings-ui-probe.mjs` | 隔离 Electron / React / Semi 真控件通过；userData 为临时目录 |
| `git diff --check -- workbench/src workbench/test` | 通过 |

新存储回归验证已有密文初始化、反复读及状态读取、普通保存与清除均零 native probe/backend/encrypt/decrypt；本地 readiness 与成功 transcribe 零 native 和零 secret；显式 reveal/replace 更新状态，拒绝与 unsafe backend 保全磁盘字节；仅已取用 provider Key 脱敏并覆盖轮转旧值；unchecked observer 不 ready。

既有测试继续验证冷 ASR import 超过 30 秒仍 pending，120 秒初始化超时仍 unavailable 且不预留云调用；默认随包 Qwen、无组件/手填模型、研究 Qwen-only 策略及 ASR A → B → A 冻结配置边界全部通过。此次未改变 120 秒初始化或真实 ASR 执行实现。

UI probe 覆盖 value=null 的 onLoad、unchecked 和 unavailable 的不同文案、pending 输入/查看/保存可达、实际输入新 Key 后显式保存、无变更本地 save/check 不触发 disclosure，以及既有默认遮蔽、查看/隐藏、只读、切换、晚返回/卸载、通用错误、未把遮蔽值保存为 Key、显式 clear/save。构建 probe 有 Vite 临时 outDir 与大 chunk 提示，未影响 exit 0。

## 设计标准结果

修改前读取 `docs/design/内容工作台设计标准.md`。此次只调整服务设置状态及控件启用条件，沿用既有 Semi 卡片、样式及布局。

| 规则 ID | 验收结果 |
|---|---|
| Foundation-04 | unchecked 用可读中性文字；失败用独立 alert 文案，不冒充已就绪 |
| Controls-01 / Controls-02 | 保留 Semi、busy/loading/clear/custom-rebind 条件；unchecked 不堵塞显式动作；真实输入/按钮行为验证通过 |
| Interaction-03 | 只修改安全存储接点与展示状态；未修改 Vault、创建模块及 ASR 执行路径 |
| Acceptance-01 | 目标测试、双类型检查及 diff whitespace 通过 |
| Acceptance-02 | 隔离设置页 1100×900 与 700×900 窗口截图；已查看，提示能换行且 Key 输入/查看未溢出。此为合成页面局部验收，不能替代安装后原生整窗、键盘和跨平台验收 |
| Acceptance-03 | 本记录不声明产物构建、安装、系统元数据或 Windows/Intel Mac 运行通过；最终交付仍引用根 AGENTS.md |

[宽窗设置截图](2026-10-28-keychain-startup/settings-masked-wide.png) · [窄窗设置截图](2026-10-28-keychain-startup/settings-masked-narrow.png)
