# 日更管线模板与 launchd 配置（阶段 4）

架构：一个 shell 主脚本串四步，launchd 每天定时触发，全程无人值守。

```
launchd 定时触发 update-daily.sh
  ├─ 1. wechat-cli 拉当天群消息 → 临时 JSON
  ├─ 2. node process-messages.js 按策展规则确定性提炼 → 精华 JSON（并验证）
  ├─ 3. node inject.js 注入 index.html 的数据变量
  └─ 4. npx wrangler pages deploy 部署上线
  成功：macOS 通知 + 自动打开网站；失败：错误通知 + 保留日志，不动线上
```

## 最重要的教训：日更热路径禁止依赖 AI CLI 输出 JSON

第一版管线用 `claude -p` 让 AI 每天把消息提炼成 JSON，连续多天随机失败：AI 输出的引号不转义、混入解释文字，JSON 解析炸掉，管线整体挂死。修修补补数日后彻底重写才根治。结论固化为规则：

- **热路径用确定性脚本**：阶段 2 已用真实数据验证过的策展规则表，翻译成 process-messages.js（解析 → 噪音过滤 → 分类 → 提取 → 输出 JSON），输出永远合法，秒级完成。
- **AI 判断放在建站阶段**（分析群、生成与验证规则），不进无人值守的日更。
- **例外**：检查点 1 若选了「AI 改写」，管线必须绕不开 AI，则 AI 输出后强制过三道闸：`JSON.parse` 验证、常见错误自动修复（未转义引号、首尾多余文字）、修复仍失败则跳过当日并发失败通知。绝不带病部署。

## update-daily.sh 模板

按群替换：群名、项目目录、Cloudflare 项目名、生产分支、网站 URL。

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"

# launchd 环境干净，PATH 和 node 都要自己兜底
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.npm-global/bin:/usr/bin:/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null || true
if ! command -v node &>/dev/null; then
  NODE_PATH=$(find "$HOME/.nvm/versions/node" -name node -type f 2>/dev/null | tail -1)
  [ -n "$NODE_PATH" ] && export PATH="$(dirname "$NODE_PATH"):$PATH"
fi

GROUP_NAME="<完整群名>"          # 群名常含活动名或书名，会变，变了要改这里
PAGES_PROJECT="<cloudflare项目名>"
PROD_BRANCH="main"               # 必须和 Pages 生产分支一致
SITE_URL="${SITE_URL:-https://<域名>}"

TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$TODAY.log"
TMP_RAW="/tmp/digest-raw-$TODAY.json"
TMP_DIGEST="/tmp/digest-out-$TODAY.json"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') 开始日更 ==="

echo "[1/3] 拉取群消息..."
wechat-cli history "$GROUP_NAME" \
  --start-time "$TODAY" --end-time "$TODAY 23:59" \
  --limit 500 --format json > "$TMP_RAW" 2>/dev/null
MSG_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$TMP_RAW','utf8')); console.log(d.messages?.length||0)")
echo "  拉取到 $MSG_COUNT 条消息"

echo "[2/3] 处理消息..."
node "$SCRIPT_DIR/process-messages.js" "$TMP_RAW" "$TODAY" > "$TMP_DIGEST"
if ! node -e "JSON.parse(require('fs').readFileSync('$TMP_DIGEST','utf8'))" 2>/dev/null; then
  echo "  JSON 输出异常，退出（不动线上）"
  osascript -e 'display notification "消息处理失败，今日未更新" with title "<站名>日报" sound name "Basso"' 2>/dev/null || true
  exit 1
fi

echo "[3/3] 注入并部署..."
node "$SCRIPT_DIR/inject.js" "$TMP_DIGEST" "$TODAY"
cd "$PROJECT_DIR"   # 必须 cd 到项目目录再 deploy
npx wrangler pages deploy . --project-name="$PAGES_PROJECT" --branch="$PROD_BRANCH" --commit-dirty=true 2>&1

echo "=== $(date '+%Y-%m-%d %H:%M:%S') 日更完成 ==="
osascript -e 'display notification "群精华日报已更新" with title "<站名>" sound name "Glass"' 2>/dev/null || true
open "$SITE_URL" 2>/dev/null || true
rm -f "$TMP_RAW" "$TMP_DIGEST"
```

## process-messages.js 要点（按该群的策展规则表定制）

固定骨架，规则部分来自阶段 2：

- **解析**：wechat-cli 的 messages 是预格式化字符串，正则 `^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\] (.+)$`（s 标志），再按首个 `: ` 拆发送者与内容；引用回复匹配 `↳ 回复` 行剥离；过滤非当日、过滤 `me`（自己）与 `[系统]`。
- **噪音过滤 isNoise**：`[图片]`/`[视频]`/`[链接/文件]` 占位符、`<msg>` 原始 xml、拍一拍、纯标点、+1/收到/好的/嗯/哈哈/单 emoji、过短且无实义汉字的消息。具体清单按该群补充。
- **核心输出分组**：核心输出者白名单的消息按时间聚簇（间隔超 30 分钟切组），每组合并为一个 reading section；标题取首句截 18 字左右；标签用该群的主题关键词表匹配。
- **金句提取**：组内单段、8 到 60 字、不含链接、不以数字开头的句子进候选，按短小精悍度排序取前 3 到 4 条。
- **讨论链**：非核心输出者消息 ≥3 条且 ≥2 人参与时聚合为 discussion；摘要生成要过 curation-rules.md 的摘要标准（确定性脚本生成不了好摘要时，宁可用「首条消息截断 + 省略号」也禁止硬编「成员们讨论了」模板句）。
- **空数据兜底**：过滤后无内容则输出 `{"summary":"今天群里比较安静","stats":{...},"sections":[]}`，正常退出（前端渲染空状态）。

## inject.js 要点

- **防重复**：index.html 里已存在当日日期键则直接跳过退出（防止手动跑过后 launchd 再跑一遍重复注入）
- **期号自动递增**：扫描现有 `Vol.(\d+)` 取最大值加一
- **注入**：把精华 JSON 转成 JS 对象字符串，插到固定锚 `const D={` 之后

## 部署红线（每条都炸过）

1. `wrangler pages deploy` **必须显式 `--branch=<Pages 生产分支>`**。本地 git 分支名（如 master）和 Pages 生产分支（如 main）不一致时，不带参数会部署进 preview 环境，正式域名永远不更新，而且部署命令显示成功，极难察觉。
2. **必须 `cd` 到项目目录再 deploy**。从上层目录部署会把整个上层内容发上线。
3. **部署后验证**：`curl -s <URL> | grep <当日日期>` 确认。CDN 有缓存延迟，失败先等 1 到 2 分钟重试，再判定真失败。也可先查 `*.pages.dev` 的最新部署专属 URL 确认内容，再等主域名缓存过期。
4. 微信内稳定分发需要独立域名：注册域名、DNS 指到 Cloudflare、Pages 项目 Custom domains 绑定主域名与 www。`pages.dev` 在微信内可能被平台风控拦截。

## launchd 配置

plist 存 `~/Library/LaunchAgents/com.example.<项目标识>-daily.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.<项目标识>-daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string><update-daily.sh 绝对路径></string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string><logs目录>/launchd-stdout.log</string>
  <key>StandardErrorPath</key><string><logs目录>/launchd-stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>HOME</key><string><用户主目录绝对路径></string></dict>
</dict>
</plist>
```

加载与重载：

```bash
uid=$(id -u)
launchctl bootout "gui/$uid" ~/Library/LaunchAgents/com.example.<项目标识>-daily.plist 2>/dev/null || true
launchctl bootstrap "gui/$uid" ~/Library/LaunchAgents/com.example.<项目标识>-daily.plist
launchctl list | grep <项目标识>   # 验证已加载
```

**触发时间怎么定**：看阶段 1 的活跃时段分布，选「群已安静、当天高价值内容已基本产完」的时间点（多数晚间活跃的群适合 21:00 到 22:00），给出推荐和理由让用户拍板。

## 运维说明模板（交付给用户的一页，存进项目目录）

```markdown
# <站名> 日更运维说明

- 网站：<URL>
- 自动更新：每天 <HH:MM>，电脑需开机联网；关机则下次开机自动补跑
- 看日志：<项目>/pipeline/logs/YYYY-MM-DD.log（每日详情）、launchd-stderr.log（触发层报错）
- 手动补跑：bash <项目>/pipeline/update-daily.sh
- 暂停日更：launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/<plist文件>
- 恢复日更：launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<plist文件>

## 已知风险（都真实发生过）
1. 群名变更：群名含书名/活动名时，改名后要同步改 update-daily.sh 里的 GROUP_NAME
2. 项目目录禁止移动或归档：plist 里是绝对路径，移动即断更；要移先改 plist 再重载 launchd
3. 微信需保持登录，wechat-cli 才拉得到消息
4. 更新完若网站没变化，先等 1 到 2 分钟（CDN 缓存），再查日志
```
