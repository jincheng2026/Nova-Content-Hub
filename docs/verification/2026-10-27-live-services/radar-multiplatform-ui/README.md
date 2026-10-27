# 双平台雷达源码与界面验收

本轮新增纯JS共享policy供renderer/domain/broker共同使用：抖音、小红书自动采集，其他平台手工；全局预算最多4REQ并受当前设置/冻结额度限制，全平台候选总数不超过sampleLimit。先搜索后补资料，份额为零不请求并解释，冻结旧operations不扩大。profile白名单由对应平台、共享样本份额内的缺粉丝真实作者生成，账本持久化后重启仍生效，不能跨平台或借用份额外作者。

`backend-tests.txt`记录最终针对性回归51/51通过；`typecheck.txt`记录原生与renderer类型检查通过；`git diff --check`通过。`radar-budget-validation.test.mjs`先复现缺失max导致NaN绕过，再验证缺失/NaN/string/负值/Infinity/超100与非法task budget在预留和invoke前拒绝。`radar-cli-scope.test.mjs`运行真实构建CLI、handoff、文件库与本地broker，旧Dy-only operations不因新版本扩展XHS；该broker返回受控fixture，属于离线契约测试，不作为供应商成功证据。

隐藏隔离Electron窗口运行真实React/Semi页面（`workbench/test/radar-multiplatform-ui-probe.mjs`），无真实服务/配置调用。先红测复现XHS仍列人工，再绿测两平台自动显示、共享quota与预算、sampleLimit1跳过XHS有明确提示、提交仍保留两个所选平台和全局sample1。1100px与700px截图人工核对标题、字段、说明及操作均可读，无新增样式。

设计规则验收：Foundation-01/02/03沿用公共颜色、可读正文与字号；Surface-03既有白色圆角dialog、长表单内部滚动，动作可达；Controls-01/02沿用Semi按钮/可搜索多选；Reading-03字段标签与预算说明完整可读；Interaction-02未改动系统减少动画策略。仅darwin-arm64隐藏窗口验收，未声称Intel或Windows原生通过。

新增/修改source：radar-policy、radar/radar-collector及声明，collect-radar CLI冻结operations传递，production-services broker，platform-catalog，radar-workspace文案/预算，viral-radar技能。controller两处接线由主线程实现。真实供应商联调另见`../radar-multiplatform-live/`，不得以fixture代替。
