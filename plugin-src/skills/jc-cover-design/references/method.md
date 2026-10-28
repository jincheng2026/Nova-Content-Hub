# 封面设计方法的当前映射

先读独立[运行上下文映射](../../../plugin-src/resources/method-runtime-context.json)，再完整读[原方法](../upstream/current/METHOD.md)，按实际模式读案例、风格、人物和审美规则。原 config 和四张作者本人照片仅保留在仓库完整来源中，运行包明确排除，不能尝试补找原作者文件。当前执行边界见[适配契约](../../../plugin-src/resources/method-adaptation-contract.md)。

## 设计候选与真正制图区分

当前 registry.executor 为 `nova-content-writing-execution`：用于 packaging／cover-copy 的设计简报、构图方案、提示词、案例对照证据及本人确认。它只提交现有 schema 能承载的文字候选；不在 writing 任务里调用生图、不声称提交封面图片。

实际图片生成必须有另一份明确冻结的 cover 请求，使用既有[cover 执行入口](../../nova-content-cover-execution/SKILL.md)和[cover 执行与提交契约](../../nova-content-cover-execution/execution-contract.md)。registry 的 generationExecutor / generationHandoff 是后续交接说明，当前代码不因此自动建 cover 任务或路由。缺少固定 cover handoff 时交设计候选并说明尚未制图。

真实 cover handoff 按 context、原始 request/body、模板及全部允许输入读取与 claim、真实等待／恢复、生成／校验进度、候选 submit 和回执完成；writing 回执不能代替 cover 回执，候选未获用户采用不冒称已选封面。

## 本轮事实与素材

- 用户标题原字、比例、张数、VI 和人像从冻结 cover 请求读取；原包 3:4、作者偏好和探索数量不是新的默认产品设置。需要改变冻结比例／数量／素材时由工作台重新确认请求，不私改。
- `config.md`、`assets/my-face-alt.JPG`、`assets/my-face-neutral.JPG`、`assets/my-face-studio-default.JPG`、`assets/my-face.png` 不随运行包分发。其他案例、规则、模板、图标按清单保留，不据人脸或名字推断权限；LICENSE 的 MIT 及衍生署名原字节保留，不把代码许可当第三方人物身份授权。
- 真人人像只用本轮授权身份；他人案例中的真人仅观察构图并转译，不与本人人脸混作身份输入。不读取作者 config 中旧目录或旧秘密。
- 完整保留指定中文、真实产品／数据证据、视觉命题、案例结构对照、局部保留范围和审美／身份双验收。用户锁定内容与审美门冲突时停在真实 waiting-user，收到答复后继续。

原脚本、安装说明与旧路径均只读；当前源文件完整不等于两个宿主、实际生成工具或平台已验收。runtimeStatus=contract-unverified。

## 历史读取分支的逐项替代

运行上下文 JSON 是独立派生映射，不占用原 config 的路径或 hash。当前固定 cover request 已由原协议验证 requestHash/attempt 后，可以使用同目录 `method-runtime-context.mjs` 的 `resolveCoverMethodRuntimeContext(request, {requiresIdentity})` 解析；它只读字段，支持 schema 1/2/3，不 claim、不生图、不提交。无人物分支显式设置 requiresIdentity=false；要求本人出镜的分支保持 true。

| 原件读取分支 | 当前运行行为 |
|---|---|
| METHOD 第一步读取 config | 人脸仅取 request.photo 与唯一匹配的 request.inputs own-photo；偏好取 prompt/templateDefinition，比例、像素、张数和格式取 ratio/pixels/count/outputFormat。当前请求无 model 字段，按宿主真实可用工具报告，缺能力就说明，不沿用作者模型。 |
| config 默认、备用、中性、微笑／大笑照片 | 只使用本轮选中的一张本人图；需要不同表情但没有本人授权素材时等待用户补充并重新冻结请求，不能加载任何作者文件或案例人像。 |
| face-reference-policy 默认原则与文末缺图回退 | 保留表情／构图及身份双验收规则；原 config 选图和“回退存在的默认人脸”改为匹配本轮 own-photo；缺失、hash/photoId 不匹配进入 waiting-user。 |
| 科技姐聊AI 中“锦成人像／config选定图” | 原文的生成身份参数改用本轮已确认本人，历史叙述中的作者姓名仍保留来源含义；案例真人只作观察和文字空间转译，不混作身份输入。 |
| CHANGELOG 默认图切换史、package 安装说明默认作者照片 | 仅历史证据；不指导复制作者照片、换原 config、安装旧脚本或回退旧默认。 |

等待发生在确实缺少本轮本人素材时；用户已经提供的内容不重复询问。等待恢复沿原固定任务合同，任何更改后的输入必须由工作台重新冻结，不在解析器中修改。
