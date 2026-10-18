# WorkBuddy使用标记与再次交接

日期：2026-10-19；起点：0.3.1首次真实生成成功之后的宿主缓存复核。

## 真实发现

第七轮本机安装包构建、codesign完整性和DMG核验成功；随后整树宿主缓存核对失败：WorkBuddy在执行后新增`.in_use`和`.in_use/65238`两项，而451项可信程序载荷未变化。该PID文件是宿主官方维护的普通非执行JSON，记录PID与进程开始时间。若仍把整个缓存限定为原安装文件树，用户下一次交接会被拒绝。[原失败日志](../verification/production/2026-10-19-unified-packaged-plugin-07.log)保留，不将其误写为DMG损坏。

已只读检查本机WorkBuddy官方CLI：它创建`.in_use/<PID>.tmp.<毫秒时间>.<base36随机串>`，写完JSON后原子rename至纯PID名称；进程退出、停用或清理时删除标记。macOS写`pid/procStart`，Windows可另有`procStartFt`，Linux可另有`procStartTicks`。

## 最小修复

仅桌面`assistant-runtime.mts`接受这些宿主非执行元数据，不改共享snapshot、插件载荷、Hooks或业务格式。

- 仅WorkBuddy可有根目录`.in_use`，可信应用清单本身不得声明该目录或后代；Codex、其他点文件仍不开放。
- 必须普通非链接目录、平铺最多256项；文件名只允许规范正PID及上述临时形态。每项必须普通非执行、非硬链接文件，最多1KiB。
- 严格校验JSON字段、PID与名称相符、ISO时间有效及平台身份字段；只允许已知临时文件为空，永久PID文件不得为空。
- 验证后的精确hash/字节数加入本次临时expected，可信载荷仍逐项完整比对；元数据前后身份及内容再核对。并发增删改、半写非空JSON及所有未知情况仍拒绝，保留原尝试供明确重试；不自动重试doctor或交接。

元数据不授予执行权限，不据此证明进程存活，不删除或改写宿主标记。Astra已审查实际diff，无该范围内具体阻断。真实当前缓存只读核对为451项可信载荷＋2项已验证元数据。

## 验证与部署

[定向运行时验证](../verification/production/2026-10-19-workbuddy-cache-metadata-01.log)及[类型检查](../verification/production/2026-10-19-workbuddy-cache-metadata-types-01.log)分别记录命令输出；覆盖生命周期、非法文件/链接/字段、载荷篡改、扫描竞态以及拒绝时不启动doctor/交接。最终重新打包、安装及原生再次交接由主线程继续，尚不能将源码验证写成安装版已通过。
