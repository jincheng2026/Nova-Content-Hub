# 下一开发版依赖修补

0.5.5：正文检索所需@xmldom/xmldom0.8.15、postcss8.5.30、inline-style-parser0.2.7显式纳入工作台runtime dependencies，生产打包沿用现有npm ci --omit=dev流程。不能依赖electron-builder的偶然传递依赖。

Electron从44.9.0补丁升级44.9.1，对应[官方发布说明](https://github.com/electron/electron/releases/tag/v44.9.1)的受损eMudhra中间证书缓解。fast-uri在工作台与根开发锁中收敛到3.1.9，对应[上游公告](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr)。冻结0.5.4安装包未被倒改，仍须另行发布下一包。

独立临时目录npm ci --omit=dev后，三种解析库实际加载和HTML/CSS解析通过，sharp可加载且electron开发包不在运行时目录。工作台npm audit报告0项，根开发依赖更新后npm也报告0项。Electron新payload实际为Mach-O arm64、元数据44.9.1；未启动GUI，下一整包仍须构建、签名和运行验收。
