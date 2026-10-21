# 助手交接中的用户输入可见性

用户反馈：在封面上确认“颜色淡一点”后点击“按批注修改”，WorkBuddy 的待发送文本只有任务意图和任务编号，无法看到这次的实际修改要求。

## 原因与逐项检查

批注保存在候选的 `note` 中，改图时进入固定封面请求的 `prompt`；系统交接 JSON 只保存经过校验的库绑定和任务定位。`hostURL()` 过去只将其转换成“生成要求已保存”，模板学习的 `notes` 也只显示“补充说明有”。这属于可见文本缺失，不能据此声称助手实际读到了完整要求。

| 入口 | 检查结果与处理 |
| --- | --- |
| 封面位置批注修改 | 在交接文本中展示批注、坐标、整体修改要求及本次补充要求；确认区也展示实际批注。 |
| 普通封面生成 | 展示用户标题和生成要求；继续携带张数、比例、尺寸、格式、人物选择及素材数量。 |
| 模板学习及首张还原 | 展示模板补充说明原文。 |
| 继续任务、重试、切换助手 | 仍通过统一的固定请求交接路径，保留相同用户原文与任务归属校验。 |
| 浏览器原型的学习、还原、生成、资料整理及排期 | 在可读文本中展示标题、内容说明、请求输入和约束，不能仅依赖末尾 JSON 或附件中的隐藏字段。 |
| 原生提示词页 | 已将变量填写值实时展示在最终预览中；标题与正文仅在用户显式勾选时加入，并完整复制，本次保持该行为。 |

长文本不得为了链接长度而裁掉用户要求。超过容量时提供完整文本和明确的复制、粘贴说明；打开助手不代表接单、生成或入库成功。

## 验证范围

主线程独立执行并读取结果：

| 检查 | 结果与证据 |
| --- | --- |
| 源码语法、生成桥接副本一致性及模板资源检查 | `npm run check` 通过，见 [source-check.log](source-check.log)。 |
| 浏览器原型全套回归 | 150/150 通过，见 [prototype-tests.log](prototype-tests.log)。初轮 5 个旧行为断言的失败保留在 [prototype-initial-red.log](prototype-initial-red.log)，更新了完整复制、可见预览等实际行为断言后重跑。 |
| 原生交接与浏览器桥接 | 38/38 通过，见 [handoff-tests.log](handoff-tests.log)，覆盖两个助手、精确/最小尺寸、短输入直接传递、10000 字全文、长输入复制、取消、复制/打开失败、围栏、固定绑定及原会话续接；后补的自定义首行保留回归 1/1 通过，见 [custom-prefix-test.log](custom-prefix-test.log)。 |
| 桌面封面、模板、提示词及批注模型 | 51/51 通过，见 [desktop-related-tests.log](desktop-related-tests.log)，含恢复、重试、切换助手及素材绑定。 |
| 桌面构建 | `npm run build:desktop -- --auth both` 通过，见 [desktop-build.log](desktop-build.log)，包含 TypeScript 检查；本机 `darwin-arm64` 的 required/disabled 实验构建均完成，仍为 `productionReady=false`。 |
| 随包 CLI 实际执行 | 9/9 通过，见 [packaged-cli-tests.log](packaged-cli-tests.log)，验证空 Node PATH 下的 context/claim/submit/status/replay、required 拒绝、库绑定、选中照片/资料原字节和逐一 hash 确认。初轮 4 项“生成要求已保存”的旧断言保留在 [packaged-cli-initial-red.log](packaged-cli-initial-red.log)，已替换为用户原文可见和真实预填/复制分支断言，未删除素材及绑定验收。 |
| 实际 React/Semi/Electron 隔离界面 | [gallery-ui-probe.log](gallery-ui-probe.log) 通过：点击、保存、重开、多行批注、完整确认区和生成 IPC 中的批注内容保持一致。主线程查看了 [annotation-confirmation.png](annotation-confirmation.png)，确认文字、坐标、换行及整体要求实际可见。 |

所有测试使用临时内容库或界面 fixture；不读取或修改用户实际业务库。

最终再跑截图等价的两个助手批注回归，2/2 通过，见 [exact-annotation-tests.log](exact-annotation-tests.log)：除了检查返回的全文，还严格断言实际 URL 解码后的 `prompt` 与全文相同，包含真实格式的“颜色淡一点”、坐标和整体要求。

## 可审阅的实际构造结果

[WorkBuddy 短提示词](workbuddy-short.txt)、[Codex 短提示词](codex-short.txt) 由临时库调用真实 `prepareNativeHandoff()` 导出，包含“颜色淡一点”、坐标、整体要求和“不要加水印”。对应 URL 长度为 1970/1951，均不需要粘贴；[长文本样例](workbuddy-long.txt) 使用全文复制路径，未降为只有任务编号的提示。数值见 [results.json](results.json)。

样例使用低尺寸测试图片与虚构标题，24×32 等参数仅为 fixture，不是用户内容或实际生成产物。这些证据证明构造结果和隔离界面行为，不证明外部助手已接收或执行。

本次为源码修复，未安装或覆盖 `/Applications` 中的应用，未更新真实宿主插件缓存，未替用户向 WorkBuddy 或 Codex 发送生成任务。Intel Mac、Windows 原生表现和安装包验收不在本次已验证范围内。
