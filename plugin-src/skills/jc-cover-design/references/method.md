# 封面设计方法的当前映射

先完整读[原方法](../upstream/current/METHOD.md)，按实际模式读其 config、案例、风格、人物和审美规则；原 config 和作者素材仅供理解来源。当前执行边界见[适配契约](../../../plugin-src/resources/method-adaptation-contract.md)。

## 设计候选与真正制图区分

当前 registry.executor 为 `nova-content-writing-execution`：用于 packaging／cover-copy 的设计简报、构图方案、提示词、案例对照证据及本人确认。它只提交现有 schema 能承载的文字候选；不在 writing 任务里调用生图、不声称提交封面图片。

实际图片生成必须有另一份明确冻结的 cover 请求，使用既有[cover 执行入口](../../nova-content-cover-execution/SKILL.md)和[cover 执行与提交契约](../../nova-content-cover-execution/execution-contract.md)。registry 的 generationExecutor / generationHandoff 是后续交接说明，当前代码不因此自动建 cover 任务或路由。缺少固定 cover handoff 时交设计候选并说明尚未制图。

真实 cover handoff 按 context、原始 request/body、模板及全部允许输入读取与 claim、真实等待／恢复、生成／校验进度、候选 submit 和回执完成；writing 回执不能代替 cover 回执，候选未获用户采用不冒称已选封面。

## 本轮事实与素材

- 用户标题原字、比例、张数、VI 和人像从冻结 cover 请求读取；原包 3:4、作者偏好和探索数量不是新的默认产品设置。需要改变冻结比例／数量／素材时由工作台重新确认请求，不私改。
- `assets/my-face*` 及所有示例照片只作原作者方法证据，不设置为新用户本人、默认 VI 或本轮图像输入；LICENSE 的 MIT 及衍生署名原字节保留，不把代码许可当第三方人物身份授权。
- 真人人像只用本轮授权身份；他人案例中的真人仅观察构图并转译，不与本人人脸混作身份输入。不读取作者 config 中旧目录或旧秘密。
- 完整保留指定中文、真实产品／数据证据、视觉命题、案例结构对照、局部保留范围和审美／身份双验收。用户锁定内容与审美门冲突时停在真实 waiting-user，收到答复后继续。

原脚本、安装说明与旧路径均只读；当前源文件完整不等于两个宿主、实际生成工具或平台已验收。runtimeStatus=contract-unverified。
