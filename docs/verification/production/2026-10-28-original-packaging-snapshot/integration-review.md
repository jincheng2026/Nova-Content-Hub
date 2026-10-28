# D1 集成中的关键风险检查

这是源码审查及行为检查登记，不是安装版或真实UI通过声明。Astra聚焦复核已关闭三项实际缺陷，其余按修复diff与专项收敛。

| 项 | 已核实风险 | 实施要求与状态 |
|---|---|---|
| R1 | 恢复指纹缺少可见coverText/description时误报过期 | 已修；inspect→create丢响应→fingerprint恢复通过，仍核完整来源与slot hash |
| R2 | 缺少真实decode await后改源的覆盖 | 已用coverAfterDecode hook改源并断言发生、候选未登记；A1专项通过 |
| R3 | 导出清理可能删到未创建或被换inode的stage目录 | 已按本次创建身份清理；两个故障注入通过，未知目标保留；C64项通过 |
| R4 | 历史读全量大图可能达数十GiB | 已有界读取128份/8MiB元数据，历史未验状态明确，所选包完整校验；B专项及源码复核通过 |
| R5 | 大图目标竞态超限会阻断整个库的恢复 | 已转明确CONFLICT，保留外部目标、旧current和pending；B专项与复核通过 |
| R6 | 明确选择录完B但封面来自当前稿A，错误判作同版 | 已按本次manuscript hash比较；异文确认、实际保存与同文不误报通过；Astra复核关闭 |
| R7 | 显示历史B时仍能保存隐藏预览A | 实际Review组件显示/动作同源，返回预览保留确认；React行为回归与Astra复核关闭 |
| R8 | 普通资料save/trash可破坏不可变版本包 | namespace二次拒绝，所有managed文件只读，显式选源后通用update/trash也拒绝；实测与Astra复核关闭 |
| R9 | 将物理根descriptorHash放入token导致正常迁移误报版本变化 | A0 token v2仅业务身份，根身份继续读前后校验；真正迁移先RED后GREEN，相关28+2项通过 |

通用边界：Vault→runtime锁顺序；schema1/2兼容；原页和当前稿分别冻结；稳定mutation恢复只用冻结字节；已保存封面通过有限本地资源读取；不能改CSP开放任意路径/data/blob。

`externalExportParent`只传runtime根不够排除可见知识库；C已采用wholeVaultRoot与runtime双重排除。Windows目录rename行为和原生验证仍须分别记录，macOS通过不能代表Windows。
