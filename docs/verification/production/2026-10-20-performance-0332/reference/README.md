# 旅游营销工作台 0.4.1 隔离性能对照

主对照为 `/Applications/旅游营销工作台.app`，Info.plist 与 app.asar package 均为 0.4.1，bundle `com.weekend-workbench.app`。插件 0.40.1 不是应用版本。参考仓库当前 0.8.1/2c01bf8 仅提供实现线索；历史 7149ebb 为 0.4.1 源码参考，未声称与混淆后的安装包逐字节等同。

## 已完成的正式测量

- 三个独立新进程，每进程每页首次导航一次、暖导航两次；matched 三页共 27 样本；另外官方模板模式三个新进程、9 样本，总计36正式样本。1440×1000 CSS 视口，真实 DPR=2。计时期间与 NCU 构建/性能探针串行，未清 OS 缓存。
- 每进程新建独立 WB_USERDATA。仅复制随包官方示例活动库构造 100 个活动（600 个物料），使用 24 张确定性高纹理 JPEG，1080×1440、quality85；模板替换为这 24 张合成图。没有读取用户活动库，未操作现有运行实例。
- 合成图片每张 1,109,969–1,111,065 字节，中位 1,110,600；24 张源图 SHA256 位于 matched-result.json 的 sourceInventory。fixtureImages 记录每份实际 fixture 文件。

| 页面 | 首次 DOM 中位 ms | 首次图像完成中位 ms（n=3） | 暖图像完成中位 ms（n=6） | 元素/URL/源图 hash | 解码像素 MP | 已生成 JPEG 缓存 MB |
|---|---:|---:|---:|---|---:|---:|
| 合成模板 | 26.1 | 967.8 | 93.9 | 18 / 18 / 18 | 22.12 | 21.92 |
| 活动 | 41.2 | 109.0 | 96.7 | 9 / 9 / 9 | 1.77 | 1.22 |
| 物料 | 384.7 | 1442.6 | 456.5 | 36 / 18 / 18 | 27.99 | 30.60 |
| 官方模板 | 26.3 | 313.1 | 93.5 | 18 / 18 / 18 | 17.06 | 6.19 |

每个时长均从 WB_SHOTS 官方页面导航 hook 被调用开始。DOM 指标为目标业务页标题出现；图像完成为视口相交图像地址集合稳定两轮、所有图已加载、decode 成功、再过两帧。25ms 轮询与稳定集合检查给快路径带来约 50–100ms 的测量底噪。原始各轮数值、地址、naturalWidth/Height、失败列表和布局截图均保留。图片加载失败均为 0。

物料页每卡使用同一地址的模糊背景和前景，所以 36 个元素对应 18 个 URL；没有按 36 张独立图片计算负载。正式fixture为活动每项目独立封面(i%24)、物料(i*2+j)%24：活动首屏9 URL/9 hash，物料18 URL/18 hash，模板18 URL/18 hash。先前不同hash分布的27样本留在preliminary，仅作诊断，不混入正式中位数。

## 范围与比较限制

- WB_SHOTS 固定 1200ms 导航等待位于计时开始之前；截图前强制 eager 的等待位于计时结束之后，两者不计入页面时长。该框架的最终 eager 会预热后续轮次，暖数据应按此解释。
- WB_SHOTS 启动先加载应用全局 snapshot，再进入测量页面。这里是已启动应用的导航首屏，不是启动到首屏，也不是磁盘冷启动。活动封面也可能在启动总览被预热。
- `WB_AUTH=已开通` 只在官方 shots 隔离入口使用 fake auth；不验证真实权益、登录、正常冷启动或在线服务。
- 计时使用官方 `__wbGo` 路由 hook，经过真实 Vue 渲染、Electron 主进程、协议和图片解码，但不包含鼠标输入派发延迟。
- 原图字节数与实际缩略图不同。模板自然尺寸960×1280，活动384×512，物料1080×1440；表内缓存字节数依据完整路径/mtime/size/宽度 cache key 匹配独立 profile 的真实 JPEG 文件，属于已生成响应源的体积，不是网络 transferSize。
- 不得把这些布局、分页、图像解码量不同的页面直接换算为 NCU 提速倍数；NCU 的原图质量与既有显示策略应保持不变。
- 官方模板模式已测3新进程共9样本，仅测模板页，避免重复相同活动/物料。官方随包23组34张参考原图（600–900宽、855–1710高；单图103,978–366,747B，中位224,412B；总8,013,255B），详见official-template-inventory.json。用户当前实例24组，未读取用户额外模板。
- 物料暖样本总时长为360.7、1606.4、412.9、1688.1、500.2、406.6ms；中位456.5ms掩盖两次较慢回访，应保留原始分布。此数据不能说明参考应用各页面一律秒开。

## 复现

```sh
REFERENCE_SYNTHETIC_DIR=/absolute/path/to/24-jpeg-fixture REFERENCE_MODE=matched REFERENCE_RUNS=3 node docs/verification/production/2026-10-20-performance-0332/reference/probe.mjs
```

`REFERENCE_MODE=official REFERENCE_PAGES=templates` 是本轮官方模板复现参数：保留官方23模板，活动库仍用100个独立克隆。fixture生成、复制、库存hash在进程计时前完成。所有 profile、缓存、日志、共享配置和活动库均在 mkdtemp 目录内。源码参考显示 userData 覆盖在单实例锁之前，指定 WB_LIBRARY 不读取/迁移现有库，shots禁用版本记录与插件回写守卫；本轮日志核实假登录及独立profile。仅保存第一个进程每页首次的截图，其余截图留在临时目录，避免大体积重复证据。

## 最小优化风险边界

测量结果支持把图像取得路径与业务DOM延迟分开排查；当前数据不证明 NCU 根因。若 NCU 数值证实每张 raster 的 openLibrary 全量业务校验占优，先评估 worker 内按 root/libraryId/dev/ino 绑定、有界生命周期的既有 library handle 复用。保持 openLibrary 默认完整打开语义；每次资产读取仍需原 locked 路径的根/descriptor/锁/recover/hash 校验，异步解码结束后二次核验也保留。不能照抄旅游的 mtime+size 缩略图缓存作为 NCU 资产可信证明。

对应回归应覆盖热命中后同size/mtime原图篡改、同路径克隆替换、descriptor换id、未完成事务恢复与锁竞争、decode期间换根、显式业务读取仍报告损坏。任何 cache 命中只能复用计算结果，不能跳过当前库身份或字节摘要证明。

## 证据文件

- matched-result.json：三页正式raw、9个分组中位数、源图hash与缓存体积。
- official-result.json：官方模板正式raw与中位数。
- matched-run-*/shots.json 与 official-run-*/shots.json：本次实际执行的序列及序列化计时函数；log.txt保留直接runtime输出。
- 每种模式第一个进程保留首次页面PNG，确认加载内容与布局；重复截图移至对应临时scratch，原始测量数据全部保留。
- preliminary/：旧分布诊断，不用于正式对照。
