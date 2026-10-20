# 0.3.32 性能修复证据

源码保持原图、布局和业务校验；共用只读句柄按完整 binding 有界复用，内容投影一次扫描，默认时区按需解析。图片同 URL 合并，每批最多两张在一个 worker 内并行解码；整批 settle 后才放行业务写入，切库撤销已执行和排队的旧请求，保留 BUSY 重试。

最终快检 `quick-final/`：真实 Electron/IPC/图片读取，独立合成库100内容/600候选/1000计划，1440×1000 DPR2。保留完整公开内置20模板组157样张（最大组30张，资源96,199,827bytes），24张1080×1440独立JPEG。无用户库、用户图片或真实助手调用。

| 首屏图完成 | 修改前正确视口的两次完整样本 | 最后一次快检 |
|---|---:|---:|
| 开现有库总览 | 5562–6199ms | 4542ms |
| 内容 | 1724–2802ms | 347ms |
| 模板 | 2171–3222ms | 651ms |
| 候选图库 | 3465–3933ms | 1435ms |

最终暖访问：内容61ms、模板559ms、图库1776ms。这里只是一次加载快检；没有宣称普遍快于参考应用。全部7阶段完成且真实模型读验收通过；自设DOM500ms/图片1000ms诊断预算仍有两项图库失败，runner因此exit1。此预算与功能/安全回归分开记录。

必要检查：`final-small-regressions.log`16/16、`final-targeted-regressions.log`25/25、`targeted-regressions.log`46/46、`cover-resource-regressions.log`2/2均exit0；typecheck exit0，最终快检再fresh编译所有native源码。覆盖篡改/换根/锁/恢复/解码换根、坏图独立结果、两图上限/合并/写入等待/撤销、TZ/DST及工作空间回归。

复跑（仓库根；不写共享dist/.native）：

```sh
node docs/verification/production/2026-10-20-performance-0332/probe-source/run-performance.mjs
```

快速复跑可指定 `NCH_PERF_RUNTIME=<已有合成runtime绝对路径>`（只复用fixture，仍fresh构建）、`NCH_PERF_EVIDENCE=<新证据绝对路径>`、`NCH_PERF_QUICK=1 NCH_PERF_PLANS=1000`。`runtime.json`/`source-files.json`/`build-files.json`记录真实源码和输出SHA，HEAD辅助标识不会掩盖dirty源码。

原始诊断保留：preliminary与before-viewport-968仅为旧口径定位；baseline按正确视口采到5个完整进程后依用户要求终止（不算完整矩阵通过）；quick-after仅①②半实现，quick-before-queue-revoke-guard为最后队列撤销门禁前版本。最终有效快检只认quick-final。reference由Astra独立记录安装旅游应用0.4.1，非新源码版本冒充。所有新进程结果均非OS冷缓存；最终未再扩矩阵、未重跑完整verify。

追加：worker仅缓存128条`assetHash → validatedMime`验证结论，每次命中仍完整读取当前原图并校验SHA/root/锁/type；冷图完整解码后再次读验，失败不缓存。独立冷hash换根与生产同一ESM sharp实例的metadata计数、缓存后同size/mtime篡改回归已通过，相关14/14及native typecheck均exit0（logs/mime-cache-*）。未重跑性能探针；上述quick-final数值来自此追加之前，未宣称图库全库投影成本已消失。
