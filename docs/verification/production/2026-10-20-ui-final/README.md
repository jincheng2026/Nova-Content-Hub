# 本轮界面改动主线程收敛

仅本轮用户七张截图的明确要求；其他逐页建议重写后待用户选择。源基线为7d1eb85，版本0.3.30的公司候选保持冻结未安装，新UI将另行冻结版本。

主线程检查全部真实diff与调用者，逐张查看设置1440/900、图库1280、分类下拉、日列表及发布面板1440/560截图。独立运行如下验证，日志保留：

- root-creatable.log：真实Semi创选、非IME键盘Down+Enter、合成中文composition、实际PromptEditor保存/重开/取消草稿/忙碌通过。
- root-calendar-pagination.log：121条按20/50/100逐页至末条与上一页、101条容量100次页、计划/历史107条跨页、日列表与PublicationPanel窄屏/归属/全文通过。
- root-unobstructed-cover.log：五种原图比例、三种窗口宽度、图外控件、原始URL/contain、键盘预览和比较入口通过。
- root-ui-model-tests.log：10项发布模型/日程接线/提示词上下文与收藏测试通过，0失败0跳过。
- root-check.log：静态生成资源/桥接检查通过。
- root-build-both.log：required与disabled两个桌面目标构建通过，保留现有实验/productionReady=false边界。

设置完整旧probe通过，见相邻settings-priority证据。共享Select/Date/Time/UTC与发布表单完整probe收绿，见semi-creatable里的共享红绿及resume诊断：初次失败是继续编辑按钮在视口外，关闭弹层无面积且不拦截；明确滚入视口再做严格bounds与hit-test后通过，没有为探针误判修改产品。

GPT-6 Astra/high只读审查未发现实质blocker；曾指出方向键覆盖声明强于当时probe，已补真实非IME Down+Enter断言并通过，不保留不实声明。未将源码探针说成最终安装包、物理中文输入法或跨平台验收。

本轮保留此前.29大小日历选日/周末、24个滚动稳定样本、10k深focus、CAS/草稿/三精度及图库批注坐标等定向回归。未重复运行整套313桌面测试；没有修改worker、事务或锁协议，不以局部结果回写旧全量证据。
