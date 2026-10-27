# 已保存服务 Key 的显示与显式查看

本次修复设置页将已保存Key表现为空输入框的问题。TikHub、大模型、火山语音统一显示“已配置 · 安全保存”与固定八位掩码，点击“查看”才通过有限IPC解密；点击“隐藏”清除当前显示值。替换输入单独标明“新Key（可选，留空保留）”，掩码不作为新Key提交；“清除Key”只是待保存变更，需明确保存才能清除。

查看入口为 `revealServiceCredential({service})`，service仅允许 `tikhub/model/asr`，拒绝多余字段、路径和任意解密输入。保持现有主窗口、主frame、固定origin边界；普通read/save响应仍只含配置状态，读取状态不解密。查看不写设置、不改变预算、不自动复制、不记录Key或放入renderer偏好。

明文只留在当前组件状态。切换查看对象、模型/ASR设置、离开“服务与模型”页签、保存、放弃修改和关闭设置会清理显示并使在途请求失效。设置使用keepDOM，因此特意从父页签传入active状态，不能以“组件没有卸载”继续保留明文。JS运行时内存回收按平台管理，不声称已进行物理内存擦除。

## 验收

- 后端红→绿：新增store/IPC方法之前，实际测试因缺少reveal失败；实现后验证三类显式查看、read/save不含Key且不触发解密、无效枚举/多余输入拒绝、非可信frame拒绝、缺失Key或安全存储不可用时失败，以及查看前后配置文件字节相同。
- UI红→绿：原页面已配置只读字段数量为0；新增后真实React/Semi/Electron页面分别验证三种查看/隐藏、readonly、切服务晚到请求、卸载晚到请求、通用错误、不提交掩码、清除需保存。再复现keepDOM active=false仍保留已显示值的问题，加入active清理后通过。
- UI测试所用Key均为独立合成值，不是用户实际Key。`settings-masked-wide.png` 和 `settings-masked-narrow.png` 仅保留隐藏状态，分别在1100px与700px窗口检查。真实新TikHubKey的保存与外部调用结果另记，不能拿UI合成测试证明供应商连通。
- `npm run typecheck --prefix workbench`原生与renderer均通过，后端/服务/边界回归46项通过，UI探针通过；未执行Windows或Intel Mac原生运行验收。

## 设计规则留痕

- Foundation-01/02/03：沿用共享白卡、浅灰输入面、深色正文与蓝色辅助动作；14px正文、13px状态，不新增低对比配色。
- Surface-01：沿用服务分组实白卡、18px圆角与22px内边距；没有新增覆盖层或玻璃正文。
- Controls-01/02：使用Semi Input/Button，查看按钮有可读名称、aria-controls与aria-pressed；危险清除保持danger语义；保存仍为唯一主操作。只读字段采用Semi实际支持的 `readonly` 属性，经真实DOM只读断言验证。
- Reading-01/02/03、Interaction-02：已存值与新输入明确分区，标签可见；已存长Key可在只读输入中键盘选中滚动查看；切页只清理已揭示Key，保留原未保存草稿与关闭保护。1100/700宽度下掩码字段和查看按钮均未溢出或互相遮挡。

可复验命令（不使用实际Key，也不请求供应商）：

```sh
node --test workbench/test/service-credential-reveal.test.mjs workbench/test/service-tools.test.mjs workbench/test/service-frozen-config.test.mjs workbench/test/boundaries.test.mjs
node workbench/test/service-settings-ui-probe.mjs
npm run typecheck --prefix workbench
```
