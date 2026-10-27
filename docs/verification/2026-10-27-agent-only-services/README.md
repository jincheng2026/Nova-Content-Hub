# 2026-10-27 Agent 文字任务与语音服务边界

用户明确要求调研、对标账号分析、拆解、写稿、改稿及标题简介全部由当前选择的 Agent 完成；工作台直连云端模型仅用于语音转文字。此记录针对当前源码，不是安装包验收。

## 修改

新任务继续通过既有 launch 打开所选 Codex / WorkBuddy，只授予 TikHub/ASR，冻结语音配置；客户端、认证 broker 和执行器拒绝历史 model 请求，Chat Completions 出站实现已移除。旧配置、加密 Key 与任务/费用历史保留。共同任务契约明确文字任务由 Agent 完成。

设置撤下“大模型分析”卡片，保留独立火山语音配置；默认 local-first/faster-whisper，明确云端识别需本次授权及预算。本次未修改用户的实际设置、安装版或助手插件缓存。

## 验证

- TDD：新增双助手启动约束先观察到 model 权限导致的 2 个预期失败，修改后通过；服务拦截回归先红后绿。
- 主线程运行 production-desktop、service-tools、service-frozen-config、service-credential-reveal、service-broker-lifecycle 共 63/63 通过。服务执行代理另补本地免费/云端授权两项 ASR 回归并通过，主线程再次单独复验。
- native 与 renderer 类型检查通过；本次文件 diff whitespace 检查通过。
- Astra 独立只读审查未发现可操作问题。

## 设计规则验收

- Surface-01、Controls-01/02：沿用真实 React/Semi ServiceSettings 卡片、按钮、选择与输入，没有引入新 CSS。文字模型卡片及输入不存在，云端备用展开仅显示语音专用 Key 与语音资源 ID。
- Reading-03：标签与说明明确 Agent 文字任务、免费本地优先及云端语音授权范围；本地配置与云端备用均有明确展开入口。
- Acceptance-01：上述自动检查通过；默认 ASR 无依赖且无云端授权时拒绝，免费本地执行无需付费预算；授权云端受预算门禁，均在隔离测试缝验证，未真实请求供应商。
- Acceptance-02：通过 CUA 浏览器实际渲染当前源码 ServiceSettings，使用合成配置及回调。1566×875、960×680 无横向溢出；保存并检查返回合成的本地可用状态。已目视检查 settings-cloud-asr.png 与 settings-960.png。此隔离组件不覆盖整套 Electron 设置弹窗焦点/键盘、真实语音质量及原生设备操作。
- Acceptance-03：没有构建、安装、发布或替换安装版；没有真实打开新的 Codex/WorkBuddy 会话，没有真实调用云端 ASR；Intel Mac/Windows 原生运行待对应环境验收。双助手等待/恢复/回执等为既有控制器自动回归覆盖，不能代替宿主真实 GUI 验收。

## 云端 ASR 预设与自定义配置增量

用户随后要求更新应用，增加免费计划/试用预设与自定义项。此次新增 Groq Whisper Large V3 Turbo、Groq Whisper Large V3、现有豆包极速版及自定义 HTTPS OpenAI-compatible ASR。识别模式与云端服务分开；默认本地不变，不自动切换提供方。

Groq 使用二进制 multipart `/audio/transcriptions`，音频上限 25,000,000 字节；保留 DNS 校验与固定地址、TLS、禁止重定向和预算。Volc/Groq/自定义 Key 分槽加密，自定义端点改变需新 Key 或明确清除。旧 ASR 设置与冻结请求经同一规范化比较，保全历史密文及兼容调用。文字模型请求仍禁用。

官方证据（2026-10-27 核对）：

- [Groq Speech to Text](https://console.groq.com/docs/speech-to-text)：两个 Whisper 模型、multipart 转写端点及免费层文件限制。
- [Groq Free Plan Limits](https://console.groq.com/docs/rate-limits)：两款模型提供免费计划；具体账户额度未读取。
- [豆包标准版任务提交](https://docs.volcengine.com/docs/DoubaoVoice/task-submission-http-1?lang=zh)：标准 2.0 使用 `volc.seedasr.auc`、音频 URL 及异步 submit/query，不等同当前 flash / `volc.bigasr.auc_turbo`。标准 2.0 尚未接入，未为适配它隐式公开音频或建立上传存储。截图的 20 小时不作为极速版免费资格证明。

增量检查：

- 执行代理先观察预期失败，再完成 81/81（63 服务 + 18 桌面流程）回归。主线程另以 `node --test --test-concurrency=4 workbench/test/service-tools.test.mjs workbench/test/service-cloud-asr.test.mjs workbench/test/service-frozen-config.test.mjs workbench/test/service-credential-reveal.test.mjs workbench/test/service-broker-lifecycle.test.mjs` 复验 **64/64**；native/renderer 类型检查通过。未请求真实云端提供方。
- Astra 审查发现未完成自定义草稿切到仅本地后，隐藏但阻止保存。已补 Store.update 回归并修复：明确恢复已保存云端配置，舍弃未保存云端 Key/配置编辑，保留本地路径、TikHub 等草稿。主线程 CUA 先复现 disabled，再确认修复后可保存。
- Controls-01/02、Surface-01、Reading-03：真实 React/Semi 中验证四个云端选项、独立 Key、自定义 URL/模型、免费说明与本地切换提示。1566×875、960×680 无横向溢出；已目视检查 Groq/custom 截图。使用合成配置和回调，与真实设置分离。
- Acceptance-01/02：自动测试与隔离页面分别留痕。截图 `asr-groq-presets.png`、`asr-groq-960.png`、`asr-custom-960.png`、`custom-to-local-red.png`、`custom-to-local-green.png`；合成识别不作为真实云端成功证据。
- Acceptance-03：收到另一主对话的用户授权协调后，停止独立打包/安装，由“统一工作台 UI 并支持多平台采集”统一冻结 .57、构建与安装。本对话没有退出/替换应用或修改实际设置；发布及原生系统信息证据由统一发布记录补齐。独立发布 worktree 仅含未发布版本准备，未用于安装。
