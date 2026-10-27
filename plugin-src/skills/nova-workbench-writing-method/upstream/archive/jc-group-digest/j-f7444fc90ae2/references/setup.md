# 首次配置与环境体检

本 Skill 的完整流程只支持 macOS，因为它依赖本机微信数据和 `launchd`。

## 体检

按顺序执行，只处理当前缺失项：

```bash
uname -s
command -v wechat-cli
command -v node
command -v npm
command -v npx
command -v python3
npm exec --no -- wrangler --version
```

成功信号：系统返回 `Darwin`，且后续命令都能返回路径或版本。`npm exec --no` 只检查已安装的 Wrangler，不允许体检时联网下载。需要网页预览时，还要确认本机 Google Chrome 可用。

## 缺失依赖

- 没有 Node.js：让用户先安装当前 LTS，然后重跑体检。
- 没有 `wechat-cli`：可在用户确认后执行 `npm install -g @canghe_ai/wechat-cli@0.2.4`。
- `npm exec --no -- wrangler --version` 失败：先确认 Node.js 和 npm 可用，再说明会下载的包和范围；只在用户同意后安装，不默认全局安装 Wrangler。

## 微信初始化

先运行窄查询：

```bash
wechat-cli sessions --limit 1 --format json
```

如果提示未初始化，必须先告知用户：初始化可能需要 `sudo` 和读取本机微信进程内存。只在用户明确授权后执行：

```bash
sudo wechat-cli init
```

不启动 daemon，不使用 `wx`、`wx-cli` 或 `@jackwener/wx-cli`。

## Cloudflare

到部署阶段才检查 `npx wrangler whoami`。如果未登录，由用户在自己的浏览器完成 Cloudflare 授权；不接收、记录或转发用户的 token。

## 完成标准

能够窄范围拉取 1 个会话、Node.js 能运行、Wrangler 能返回版本。Cloudflare 登录可等到真正部署前再完成。
