# Step 1 加载交接（Claude 线）：冻结 b765b55 → Claude 2.1.263 隔离原生旅程

2026-09-09。actual Kimi 的第二轮只读检查。背景变化：ZCode 线实跑
`7b9d66ed3a6f404ea1702fc5e183381b` 返回订阅配额耗尽（wrapper 本身成功），ZCode 模型不再调用；
Root 改选 native Claude。本稿只补 Claude 隔离加载这一个缺口：安装件生成、原生发现、认证保全、
fresh/resume 会话身份。前置方法、字节验证范式与证据落盘习惯沿用
`step1-loading-handover.zh-CN.md`（ZCode 稿），不重复展开。本轮未发任何模型调用、未读/复制/改
凭据、未写真实 HOME 配置。

## 结论

**主路径 A：`CLAUDE_CONFIG_DIR` 全隔离**（注册表、插件缓存、会话全在隔离根下；发现与认证都有
只读验证面）。**Claude 线不需要改名**：真实 HOME 的 Claude 未安装任何 ultra-builder-pro
（观察事实），不存在 ZCode 那种同名遮蔽。**备选路径 B：真实配置 + `--plugin-dir`** 会话级加载
（认证零疑问；但加载状态无只读验证面，且每次启动包括 resume 都必须重复该旗标）。

两条路径都不传 `--model`，用账号默认模型；不改任何默认设置。

## 观察事实（今日实测）与预期行为（Root 验证）

观察事实：
- 二进制：`~/.local/share/claude/versions/2.1.263`（Mach-O，`~/.local/bin/claude` 符号链接）。
- `claude plugin list --json`（真实配置）：16 个插件，**无 ultra-builder-pro**；注册表文件
  `installed_plugins.json`/`known_marketplaces.json` 在 `~/.claude/plugins/` 下，即在
  CLAUDE_CONFIG_DIR 之下——隔离根自带全新注册表。
- 认证：无 `~/.claude/.credentials.json` 文件；二进制经 `/usr/bin/security` 读写 login keychain
  里的 OAuth token（字符串 "No OAuth token in keychain"、`delete-generic-password`、
  `tengu_oauth_401_recovered_from_keychain`）。`claude auth status --json` 在真实配置下报
  `loggedIn: true`（含 authMethod/subscriptionType 字段；本稿不引用其值）。
- `~/.claude.json` 在 `$HOME` 而不在 CLAUDE_CONFIG_DIR 下，持有 `hasCompletedOnboarding`、
  `oauthAccount`、`projects`（169 项）等全局状态——重定向 config dir 不影响它。
- help 明示面：`--plugin-dir <path>`（会话级、可重复、支持目录或 .zip）、`-r/--resume [id]`、
  `--session-id <uuid>`（钉新会话 id）、`--fork-session`（resume 时换新 id——本流程禁用）、
  `-c/--continue`（cwd 最近会话）、`--permission-mode`（acceptEdits/auto/bypassPermissions/
  manual/dontAsk/plan）、`--permission-prompts host|none`、`-p`/`--output-format json`、
  `--max-budget-usd`、`--setting-sources`、`claude plugin validate <path>`、
  `claude plugin details <name>`、`claude doctor`。
- 二进制字符串：插件 id 哨兵规约——`name@inline` 给 `--plugin-dir`、`name@skills-dir` 给
  `.claude/skills` 插件、`name@synced`/`name@builtin`；"… from --plugin-dir overrides
  installed version"（同名已安装插件被会话级副本覆盖）；"This --plugin-dir copy did not
  load … /reload-plugins"；skills-dir 采用 "fail-closed until a sync round repairs it"。
- adapter 合同：`adapters/claude.js` 安装到 `<config>/skills/ultra-builder-pro`，doctor 以
  `plugin list --json` 中 `ultra-builder-pro@skills-dir` 且 enabled 为健康；`--config-dir`
  模式下 install 不调用宿主 CLI、不写真实 HOME。

预期行为（未经本审计实测，Root 在标注步骤验证）：
- E1（A4 验证）：隔离 CLAUDE_CONFIG_DIR 下 `auth status` 仍 `loggedIn: true`——keychain 与
  `~/.claude.json` 都在 config dir 之外。
- E2（A3 验证）：隔离 config 下 `plugin list --json` 出现 `ultra-builder-pro@skills-dir`
  enabled=true。若首轮缺席，先跑一次 `CLAUDE_CONFIG_DIR=$CCFG claude doctor`（help 明示：读当前
  目录设置、无信任弹窗、无模型调用）以触发 sync/adoption 轮后重查；仍缺席则保留证据并改用
  路径 B，不要手工改注册表。
- E3（A5 验证）：`-p --output-format json` 的结果 JSON 带 `session_id`；`--resume` 同一 id
  续同一对话。
- E4（A7 验证）：插件 hooks 实际加载执行，`${CLAUDE_PLUGIN_ROOT}` 展开为隔离插件根。
- E5：`~/.claude.json` 的 `projects` 会追加旅程 cwd 条目（原生日常行为，非我们改配置）；会话
  jsonl 在隔离根的 `projects/` 下。

## Root 执行清单（路径 A）

```bash
BASE=/tmp/ubp-trellis-baseline-OlGj0q
NODE=/Users/rocky243/.hermes/node/bin/node
TESTROOT=$(mktemp -d /tmp/ubp-step1-claude-XXXXXXXX)
CCFG="$TESTROOT/claude-config"
```

### A1. 生成隔离安装件（真实 HOME 零写入）

```bash
cd "$BASE" && "$NODE" bin/install.js --claude --global --config-dir "$CCFG" 2>&1 | tee "$TESTROOT/install.log"
PLUGIN="$CCFG/skills/ultra-builder-pro"     # adapter 的 claude 布局
cd "$BASE" && "$NODE" bin/install.js --claude --global --config-dir "$CCFG" --doctor --json > "$TESTROOT/doctor.json"
# 期望 status=healthy；configDir 模式下 host_plugin 检查按设计跳过，由 A3 的原生命令补上
```

不改 plugin.json 的 name（无遮蔽）；provenance.json 与字节全部一致，无 ZCode 线的改名 delta。

### A2. 结构校验 + 字节验证（只读）

```bash
claude plugin validate "$PLUGIN"   # 原生结构校验；期望 exit 0（E-级：首次执行确认输出语义）
```

字节验证（判据为产品自己的变换；claude frontmatter = name/description/user-invocable[/
disable-model-invocation]）：

```bash
cd "$BASE" && PLUGIN="$PLUGIN" "$NODE" <<'EOF' | tee "$TESTROOT/install-verify.json"
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parse,serialize}=require('./adapters/_shared/frontmatter.cjs');
const {skillsForRuntime,skillPolicy,WORKFLOW_HOOK_FILES}=require('./adapters/_shared/runtime-assets.cjs');
const claude=require('./adapters/claude.js');
const BASE=process.cwd(),PLUGIN=process.env.PLUGIN;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rows=[];let fail=0;
const chk=(rel,ok,extra={})=>{rows.push({path:rel,ok,...extra});if(!ok)fail++;};
for(const name of skillsForRuntime('claude')){
  const {fm,body}=parse(fs.readFileSync(path.join(BASE,'skills',name,'SKILL.md'),'utf8'));
  const pol=skillPolicy(name);
  const expFm={name,description:String(fm.description||''),'user-invocable':pol.userInvocable,
    ...(pol.allowImplicitInvocation?{}:{'disable-model-invocation':true})};
  const got=fs.readFileSync(path.join(PLUGIN,'skills',name,'SKILL.md'));
  chk(`skills/${name}/SKILL.md`,Buffer.from(serialize(expFm,body)).equals(got),{installed_sha256:sha(got)});
}
for(const rel of [...WORKFLOW_HOOK_FILES,'_common.py']){   // claude 无 hooks/adapters/ 文件
  const s=fs.readFileSync(path.join(BASE,'hooks',rel)),g=fs.readFileSync(path.join(PLUGIN,'hooks',rel));
  chk(`hooks/${rel}`,s.equals(g),{source_sha256:sha(s),installed_sha256:sha(g)});
}
chk('hooks/hooks.json',
  fs.readFileSync(path.join(PLUGIN,'hooks','hooks.json'),'utf8')===JSON.stringify(claude.buildHooksManifest(),null,2)+'\n');
const pj=JSON.parse(fs.readFileSync(path.join(PLUGIN,'.claude-plugin','plugin.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(BASE,'package.json'),'utf8'));
chk('.claude-plugin/plugin.json',pj.name==='ultra-builder-pro'&&pj.version===pkg.version,{version:pj.version});
const walk=(d,pre=[])=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>
  e.isDirectory()?walk(path.join(d,e.name),[...pre,e.name]):[path.join(...pre,e.name)]);
for(const rel of walk(path.join(BASE,'.ultra-template'))){
  const s=fs.readFileSync(path.join(BASE,'.ultra-template',rel));
  const g=fs.readFileSync(path.join(PLUGIN,'skills','ultra-init','assets','project-template',rel));
  chk(`project-template/${rel}`,s.equals(g));
}
console.log(JSON.stringify({source_head:'b765b55cca0e1eaacebc738a68de77906bb50756',
  plugin_root:PLUGIN,checked:rows.length,failed:fail,rows},null,1));
process.exit(fail?1:0);
EOF
```

判定：exit 0 且 `failed=0`。合法差异只有 frontmatter 归一化（`plugin-core.cjs::skillFrontmatter`
的 claude 分支）；正文、hooks、模板逐字节一致。

### A3. 原生发现验证（只读、无模型调用）

```bash
CLAUDE_CONFIG_DIR="$CCFG" claude plugin list --json | tee "$TESTROOT/discovery.json"
```

判定（E2）：存在 `id=="ultra-builder-pro@skills-dir"` 且 `enabled==true`，installPath 在 `$CCFG`
下；列表不含真实 HOME 的任何插件（注册表隔离）。不达标按 E2 的 sync 处理，仍不达标转路径 B。

### A4. 认证核对（只读、无模型调用）

```bash
CLAUDE_CONFIG_DIR="$CCFG" claude auth status --json | tee "$TESTROOT/auth-status.json"
```

判定（E1）：`loggedIn==true`，authMethod/subscriptionType 与真实配置一致（Root 本地比对，
值不外发）。若 false：停止路径 A，转路径 B；不要执行 `claude auth login`（凭据效果不在授权内）。

### A5. fresh 启动一次旅程

```bash
SID=$(uuidgen)    # 每旅程钉一个会话 id，身份无歧义
mkdir -p "$TESTROOT/trial-a" && cd "$TESTROOT/trial-a"
CLAUDE_CONFIG_DIR="$CCFG" claude -p "$(cat <冻结Owner消息1.md>)" \
  --session-id "$SID" --output-format json \
  --permission-mode acceptEdits --allowedTools Bash --max-budget-usd 2 \
  | tee "$TESTROOT/trial-a-turn1-result.json"
```

核对结果 JSON 的 `session_id` 等于 `$SID`（E3），并记录实际模型（结果 JSON 的模型字段）。
权限包说明：headless 无交互，未授权工具会被自动拒绝；`acceptEdits`+`--allowedTools Bash` 是覆盖
日常编码（写文件+跑命令）的最小包，对标 Stage A ZCode 保留正常能力的选择。`bypassPermissions`
不按 help 自述（"only for sandboxes with no internet access"）采用。预算上限金额由 Root 定并记录。

### A6. 续轮（同一 session）

```bash
cd "$TESTROOT/trial-a"
CLAUDE_CONFIG_DIR="$CCFG" claude --resume "$SID" -p "<冻结Owner消息2>" \
  --output-format json --permission-mode acceptEdits --allowedTools Bash \
  | tee "$TESTROOT/trial-a-turn2-result.json"
```

规则同 ZCode 线：确认上一轮进程已退出再续（`ps -ef | grep "claude.*$SID"` 无残留）；禁用
`--fork-session`；不用 `--continue`（精度不如显式 id）；不重跑首轮、不替换输入；逐轮记录字面
argv、session_id、耗时与成本。会话文件交叉核对：`ls -t "$CCFG/projects/"*/*.jsonl | head -3`。

### A7. Hook 字节取证（首轮进行中）

```bash
ps -ef | grep 'ultra-builder-pro/hooks/' | grep -v grep
```

期望命令行只出现 `$PLUGIN` 下路径（hooks.json 里是 `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/…"`）。
出现其他路径即停止并记为隔离污染发现（E4）。技能侧佐证：旅程中 `/plugin` 或行为观察只作辅证，
字节来源以 ps 为准。

## 备选路径 B：真实配置 + `--plugin-dir`（A4 失败时启用）

```bash
cd "$TESTROOT/trial-a"
claude -p "$(cat <消息1.md>)" --plugin-dir "$PLUGIN" --session-id "$SID" \
  --output-format json --permission-mode acceptEdits --allowedTools Bash --max-budget-usd 2
# resume 同样必须重复 --plugin-dir（会话级加载不持久）：
claude --resume "$SID" --plugin-dir "$PLUGIN" -p "<消息2>" --output-format json ...
```

事实依据：id 为 `ultra-builder-pro@inline`；默认启用；同名已安装插件会被会话级副本覆盖
（本机本就无 Claude 版 UBP）；不写注册表。代价：加载状态没有只读验证面（`plugin list` 不含
会话级插件），真实 HOME 已启用的其他插件/用户 skills 会同载（日常保真但归因噪声大），漏传一次
旗标就静默变成无 UBP 的旅程——逐轮记录 argv 是硬要求。

## 明确不做

不执行 `claude auth login/logout`、`plugin install/enable/disable` 等任何写真实配置的操作；
不复制/读取凭据；不发模型调用（A5 起由 Root 按既有授权执行）；不改名、不新建传输或 manifest；
路径 B 只作授权内的备选，不与路径 A 混用同一会话。

## 落盘清单（TESTROOT 内）

install.log、doctor.json、plugin validate 输出、install-verify.json、discovery.json、
auth-status.json（Root 本地留存）、每旅程的 SID、逐轮 result JSON 与字面 argv、hook ps 快照、
实际模型与成本、以及任何判定失败的原始证据。
