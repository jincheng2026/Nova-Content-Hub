# 首次配置

目标：让每个使用者绑定自己的飞书 Base，不复用任何其他人的 token、表名、视图名或字段映射。

## 1. 体检

```bash
command -v lark-cli
lark-cli doctor
```

缺少 `lark-cli` 时，可在用户同意后执行：

```bash
npm install -g @larksuite/cli@1.0.86
```

## 2. 配置与授权

- 没有配置时，运行 `lark-cli config init --new`，由用户在飞书开放平台完成配置。
- 读写用户自己的 Base 时优先使用 `--as user`，不得因为 bot 看不到用户资源就猜 token。
- 需要用户授权时，按 CLI 给出的最小 scope 发起授权。用户在浏览器完成；不在聊天中接收 app secret 或 access token。

## 3. 绑定 Base

请用户提供自己的 Base 链接，再现场解析 `app_token`、`table_id` 和可选 `view_id`。如果只有表名，使用当前用户身份搜索；命中多个时让用户选一个，不猜。

## 4. 只读验收

首次不写测试垃圾数据。只读执行：

1. 读表结构，确认字段名、类型、选项和日期格式。
2. 有权限时读取 1 条记录或返回空表。
3. 输出本次发现的字段映射和缺口。

成功信号：能以用户身份读到真实 schema，且没有输出任何密钥、token 或其他账号信息。

## 5. 可执行命令

先解析用户提供的 Base 链接：

```bash
lark-cli base +url-resolve --as user --url "<用户的 Base URL>" --format json
```

从返回结果取得 `<base_token>` 和 `<table_id>` 后，只读验证：

```bash
lark-cli base +field-list --as user --base-token <base_token> --table-id <table_id> --format json
lark-cli base +record-list --as user --base-token <base_token> --table-id <table_id> --limit 1 --format json
```

去重时用主事项字段搜索，不凭印象新建：

```bash
lark-cli base +record-search --as user --base-token <base_token> --table-id <table_id> \
  --keyword "<主事项关键词>" --search-field "<主事项字段>" --limit 20 --format json
```

写入前先用真实字段名做 dry-run：

```bash
lark-cli base +record-upsert --as user --base-token <base_token> --table-id <table_id> \
  --json '{"<主事项字段>":"<任务>","<状态字段>":"<待办选项>"}' --dry-run
```

用户确认候选任务后，删掉 `--dry-run` 执行一次。从返回结果取得 `<record_id>`，立即回读：

```bash
lark-cli base +record-get --as user --base-token <base_token> --table-id <table_id> \
  --record-id <record_id> --format json
```

更新已有记录时，在 `+record-upsert` 中加 `--record-id <record_id>`。命令中的占位符必须来自 URL 解析、schema 和搜索结果，不得猜测。

## 6. 可选自动化

未完成任务自动顺延、飞书日历提醒和 Apple 日历同步都需要单独明确开启。定时顺延还要求当前客户端支持自动任务；不支持时只提供手动执行。Apple 日历分支只在 macOS 上检查到 `osascript` 后可用，失败不得回滚已验收的飞书写入。
