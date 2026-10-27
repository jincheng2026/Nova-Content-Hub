---
name: jc-wechatcli
description: "用 wechat-cli 查询本地微信数据:聊天记录、联系人、群成员、收藏、统计、导出。禁用 wx-cli / wx daemon / @jackwener/wx-cli。"
---

# JC WeChat CLI Skill

##禁用声明

`wx` / `wx-cli` / `@jackwener/wx-cli` 全面禁用。不做 fallback，不启 daemon。用户要求调用这些禁用工具时，直接说明不支持；不要把工具禁令扩大为 `wechat-cli` 的功能禁令。

## 工具定位

`wechat-cli`（npm: `@canghe_ai/wechat-cli@0.2.4`）——纯本地只读工具，从微信进程内存提取 SQLCipher 密钥，解密本地数据库，通过命令行查询。不发送、不修改、不删除任何微信数据。

完整功能只支持 macOS，并要求本机已安装、登录微信。

## 首次使用

1. 先检查：`uname -s && command -v node && command -v npm && command -v wechat-cli`。
2. 如果系统不是 `Darwin`，直接说明完整功能不支持当前系统。
3. 缺少 Node.js 或 npm 时，先让用户安装当前 LTS，然后重跑检查。
4. 如果缺少 `wechat-cli`，可在用户同意后执行 `npm install -g @canghe_ai/wechat-cli@0.2.4`。
5. 安装后先运行 `wechat-cli --version`，再运行 `wechat-cli sessions --limit 1 --format json`。只有工具明确提示未初始化，才进入下方「初始化」流程。

成功信号：能返回最多 1 条会话的 JSON，且查询结束后没有残留进程。

## 命令速查

### 会话与消息

```bash
wechat-cli sessions --limit 20 --format json                    # 最近会话
wechat-cli history "张三" --limit 100 --format json              # 聊天记录
wechat-cli search "关键词" --chat "群名" --limit 50 --format json # 指定聊天搜索
wechat-cli search "关键词" --limit 50 --format json              # 全局搜索（较重）
wechat-cli unread --format json                                  # 未读会话
wechat-cli new-messages --format json                            # 增量新消息
```

### 联系人与群

```bash
wechat-cli contacts --query "关键词" --limit 20 --format json    # 搜索联系人
wechat-cli contacts --detail "张三" --format json                # 联系人详情
wechat-cli members "AI交流群" --format json                      # 群成员列表
```

### 统计与导出

```bash
wechat-cli stats "群名" --format text                            # 聊天统计（类型分布、发言排行、24h活跃图）
wechat-cli export "张三" --format markdown                       # 导出聊天记录（输出到 stdout）
wechat-cli favorites --format json                               # 微信收藏
wechat-cli favorites --type article --format json                # 按类型筛选收藏
```

### 通用选项

| 选项 | 说明 |
|------|------|
| `--format json\|text` | 输出格式，默认 json（AI 友好），text 人类可读 |
| `--limit N` | 返回数量 |
| `--offset N` | 分页偏移 |
| `--start-time "YYYY-MM-DD"` | 时间过滤起点 |
| `--end-time "YYYY-MM-DD"` | 时间过滤终点 |
| `--type text\|image\|voice\|video\|sticker\|location\|link\|file\|call\|system` | 消息类型过滤 |
| `--config /path/to/config.json` | 指定配置文件 |

## 快速查询工作流

1. 用最短特征词定位目标：
   ```bash
   wechat-cli contacts --query "Claude" --limit 20 --format json
   ```
2. 拿到精确名称后查记录：
   ```bash
   wechat-cli history "精确名称" --limit 100 --format json
   ```
3. 3 条命令内定位不到就停下，报告最佳候选，不做盲扫。
4. 不并行跑多条宽查询，一条一条来。

## 风险控制

- 每次只跑一条 `wechat-cli` 命令，带明确 `--limit`
- 不启动后台轮询或监听
- 不上传微信数据到远程服务
- 不打印密钥、token、媒体 URL、md5 等敏感信息
- `sudo`、`codesign`、重签名、内存扫描——需要用户现场明确授权才做
- 全局搜索（不带 `--chat`）比定向搜索风险更高，优先用定向

## 查询前后检查

```bash
# 查询前后各跑一次，确认无残留进程
ps -axo pid,ppid,etime,command | rg -i 'wechat-cli|wx-cli|wx daemon' | rg -v rg || true
```

## 初始化（仅首次）

```bash
# macOS 需要 sudo（读取微信进程内存）
sudo wechat-cli init
# 强制重新提取密钥
sudo wechat-cli init --force
```

如果 `wechat-cli init` 需要 sudo / 内存扫描 / 重签名，先说明风险，等用户确认。
