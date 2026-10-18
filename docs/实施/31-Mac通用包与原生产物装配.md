# Mac 通用预览包与原生产物装配

## 交付范围

一期仍是免费体验版：`AUTH_MODE=disabled`，无需产品登录；`experimental=true`、`productionReady=false`。Mac 的目标是一个包含 Intel 与 Apple Silicon 两套原生产物的 DMG。Windows 保留原生 x64 / arm64 NSIS 发行入口，仍属于必需交付范围。

本批次完成装配源码、启动入口、拒绝条件和测试源码。根据当前阶段约束，没有执行测试、类型检查、构建、安装、探针、应用启动或网络操作；没有生成或验收新的安装包。下列命令是功能完成后才使用的发行步骤。

## 为什么先分别构建，再装配

现有桌面包与配套市场已经绑定 `darwin-x64` 或 `darwin-arm64`。市场内含固定 Node、sharp/libvips、插件发布元数据、`integrity.json` 和 `package-files.json`。将现有两个完整 `.app` 直接交给 universal 合并器，可能修改 Node 的字节，并遇到同一路径的架构元数据差异。

通用装配器只合并 Electron 与一致的最小启动壳。两套应用负载在 Electron 合并完成以后复制，既不对固定 Node 做 lipo，也不重新生成插件哈希。

```text
自媒体工作台.app/Contents/Resources/
├── app/
│   ├── package.json
│   ├── main.mjs
│   └── selector.mjs
└── native/
    ├── darwin-x64/
    │   ├── artifact.json
    │   └── payload/
    │       ├── package.json + node_modules/
    │       ├── plugin-src/
    │       └── workbench/dist/ + workbench/plugin-marketplace/
    └── darwin-arm64/
        ├── artifact.json
        └── payload/（同布局，保留 arm64 原生文件）
```

启动壳只接受 `process.platform=darwin` 与实际 `process.arch=x64|arm64`，再从固定的 `process.resourcesPath/native/darwin-${arch}/payload` 导入桌面模块。没有环境变量、渲染器参数或任意目录覆盖入口。

桌面模块在 Electron ready 前导入，以保留协议注册时序；调用 `startDesktop()` 后不在入口顶层等待其完成，避免 `app.whenReady()` 阻塞入口求值。内部 `marketRoot` 参数指向所选负载的 `workbench/plugin-marketplace`。桌面现有命名与用户数据迁移继续由同一个桌面模块处理；发行 appId 仍是 `com.novaisland.nova-content-hub`。`release.json.arch` 保持实际的 `x64` 或 `arm64`，不改成 `universal`。

## 两台原生 runner 的输入约束

两个 runner 必须检出同一个干净 Git 提交，并使用相同的根目录/工作台 lockfile、固定 Node 下载清单、发布配置和工具版本（Node、npm、Electron、electron-builder、sharp）。显式的 `dist:preview:payload` 沿用原生发行构建流程，在新构建开始之前捕获来源身份，构建后重新读取并比较；不会把旧 stage 直接标记成当前提交的产物。原有 `dist:preview` 不导出 artifact，也不新增干净提交要求。

在 Intel Mac 的原生 x64 Node/npm 环境：

```sh
cd /absolute/Nova-Content-Hub/workbench
npm run dist:preview:payload -- --platform darwin --arch x64
```

在 Apple Silicon Mac 的原生 arm64 Node/npm 环境：

```sh
cd /absolute/Nova-Content-Hub/workbench
npm run dist:preview:payload -- --platform darwin --arch arm64
```

新原生构建完成后、原有安装器装配之前，命令额外导出完整 portable artifact，并打印绝对路径：

```text
workbench/release/native-payloads/<commit>/darwin-<arch>-<unique-id>/
├── artifact.json
└── payload/
```

必须整体传输 artifact，保留相对软链接和可执行位。每次导出使用新目录，不覆盖已有 artifact。`artifact.json` 是本地装配校验清单，不是代码签名或远程构建证明；输入应来自受信任的原生 runner。

## 单个 Mac DMG 的装配入口

把两个 artifact 放在同一台 Mac 上，在相同的干净源码提交和相同工具版本下运行：

```sh
cd /absolute/Nova-Content-Hub/workbench
npm run dist:preview:universal -- --x64 /absolute/artifacts/intel --arm64 /absolute/artifacts/apple
```

该命令只接受两个绝对 artifact 目录。它不会代构建另一种架构的 Node、sharp 或桌面负载，不支持 Windows runner，也不支持 production 参数。

输出写到新目录 `workbench/release/darwin-universal/preview/<commit>-<unique-id>/installers/`，DMG 文件名包含 `darwin-universal-preview`。每次装配用独立的最小壳目录和输出目录，不把任一 artifact 当成 builder 的源应用目录。

## 装配检查与签名边界

装配器读取固定版本 `electron-builder 26.15.3` 的本地实现：`macPackager.doUniversalPack()` 先分别调用 x64 与 arm64 的 `afterPack`，合并最小壳后再以 universal arch 调用 `afterPack`，随后签名。负载只在最后一次回调复制；薄壳回调一旦出现 native 目录则拒绝。

每套 artifact 独立检查：

- 来源提交、lockfile 哈希、配置、工具版本及 free-preview 身份必须完全一致。
- 桌面 release、插件 release、市场 release、pairId、版本、平台与实际架构必须一致。
- 完整目录快照包含文件 SHA-256、字节数、可执行位、目录与相对软链接；链接不得逃逸、绝对引用或指向源 checkout。
- 市场 `package-files.json` 必须匹配完整插件快照；`integrity.json` 必须覆盖现有固定路径并与文件哈希一致。
- 固定 Node 清单、下载锁、Node 与 LICENSE 哈希必须一致；Node 仍是对应架构的 thin Mach-O。
- 桌面与插件两份 sharp/libvips 必须存在，包版本与原生 Mach-O 架构必须正确。
- 输出不得覆盖或嵌套输入；复制前后及签名后重新校验完整负载。签名器若修改 Node、sharp 或任一封存文件，装配失败。

预览继续使用 ad-hoc 签名。`mac.signIgnore` 排除 `Contents/Resources/native/`，以保留原生包内已有的 Node 签名与完整性哈希；Electron 外壳仍按预览配置签名。`afterSign` 检查之外，builder 完成后再次检查，覆盖未触发签名回调的情形。

`shortcut: 预览采用 ad-hoc 外壳并跳过原生负载重签；正式发行前需要实现并在双架构真机验证统一 Developer ID、负载完整性与公证流程。` 当前 production 仍由原有发行门禁拒绝，不将预览产物描述成正式发布就绪。

## Windows 仍需独立原生交付

Windows 命令与 NSIS 行为保持原样，分别在匹配架构的 Windows Node/npm 环境构建：

```sh
npm run dist:preview -- --platform win32 --arch x64
npm run dist:preview -- --platform win32 --arch arm64
```

不能以 Mac 通用包代替 Windows 安装与功能验收。原生 Windows `release.json`、Node、sharp、市场与宿主插件安装也必须对应实际架构。

## 下一阶段的验收

新增 `workbench/test/native-payload.test.mjs` 使用不会执行的最小 Mach-O fixture，覆盖导出/复制保真、来源不一致、跨架构、旧哈希、逃逸软链接、固定启动选择、只在 final hook 装配与签名后变更拒绝。它用于检验装配逻辑，不证明真实 Electron/Node/安装器可运行。

功能完成后应先执行针对测试和类型检查，再分别进行 Intel、Apple Silicon、Windows 原生构建与真机安装。Mac DMG 需分别验收应用启动、原有用户数据、文件库/图片处理、所选架构市场、宿主内插件安装与完整封面链路。单台 Apple Silicon 的 Rosetta 测试不能代替 Intel 真机验收；打开宿主也不代表插件安装或生图完成。
