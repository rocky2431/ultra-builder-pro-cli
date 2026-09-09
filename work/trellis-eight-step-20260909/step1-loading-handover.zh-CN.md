# Step 1 加载交接：冻结 b765b55 → 隔离原生日常旅程

2026-09-09。actual Kimi 按 `step1-loading-mission.md` 完成的只读检查结论与可执行交接。
依据：`.ultra/decisions/2026-09-09-eight-step-implementation.md`、
`thinking/trellis-direction-20260908/RESULT.md` 第一/四步、
`work/owner-factory-implementation-20260905/stage-a-live-eval-setup.zh-CN.md`（下称 Stage A 方法）、
当前 adapter/discovery 源码与本机实测。本稿只做加载、验证与一次旅程的启动/续轮交接；
未运行付费模型旅程，未改任何安装、配置、真实 HOME、产品或测试文件。

## 结论：主试 Host 推荐 ZCode 0.16.5

证据（均为今日实测或留存记录，不是推断）：

1. Stage A 全套方法在本机同一 runtime（App 内置 0.16.5）上真实跑通过：同名遮蔽问题已遇到并解决，
   项目级 enabledPlugins 控制经原生 discovery 双向验证（旧版 enabled=false/skillCount=0，
   改名副本 enabled=true/skillCount=14，无 plugin_duplicate_id），续轮经原生 `--resume` 完成
   （`/tmp/ubp-owner-journeys-ynsz0724/` 记录仍在）。
2. 凭据与模型不动：模型/Provider 在真实 HOME（`~/.zcode/cli/config.json`、UI 的
   `~/.zcode/v2/config.json`），项目级 `.zcode/config.json` 只转向插件发现；全程无凭据复制。
   现有 BigModel Coding Plan 订阅计费，成本可预期。不传 `--model`，即不改默认设置。
3. 原生字节可验证：`plugins list --json`（id/enabled/skillCount/rootPath/diagnostics）与
   `skills list --json`（逐 Skill directory 路径）都能直接证明宿主将加载哪份字节。
4. 会话身份原生可查：`sess_<uuid>` 在 `~/.zcode/cli/rollout/model-io-sess_*.jsonl` 留痕，
   `--resume <sessionId>` 是当前 CLI help 明示的支持面。
5. 备选 Host 都有确切 gap（见末节）：Kimi 隔离即失认证、Claude 需首跑验证认证且按 token 计费、
   Grok 锁定 profile 无跨轮会话。

限制声明（必须随结论保留）：ZCode headless CLI 是 experimental 的 App 内部表面，不是
ZCode Desktop 交互主路径（`docs/RUNTIME-COMPAT-MATRIX.md` 原文）；GLM-5.2 的行为不代表其他模型。
宿主能力差异是限制，不是等价证明。多 Host 安装/生成兼容性属第四步范围，本步只需一个主试 Host。

## 已核实的基线与界面事实

- 冻结基线：`/tmp/ubp-trellis-baseline-OlGj0q`，HEAD `b765b55cca0e1eaacebc738a68de77906bb50756`，
  detached、干净、`node_modules` 已在（install 链路 require `js-yaml`）。主 checkout 的未提交
  Stage B 修改不进入本流程；全程只用基线路径。
- 版本：claude 2.1.263、codex 0.153.4、kimi 0.41.0、opencode 1.18.21、grok 1.0.5、
  zcode(bundled) 0.16.5、agent-delegate 0.4.0、node v26.8.1（`/Users/rocky243/.hermes/node/bin/node`）。
  PATH 上 `zcode-acp` 报未带 `.r1` 后缀的旧 build marker——只影响 Ultra ultra-delegate 的 ACP
  身份门禁，与本稿的原生加载旅程无关；如实记录即可。
- 真实 HOME 现状（只读观察，勿改）：`~/.zcode/cli/config.json` 的 `plugins.dirs` 注册了
  ultra-builder-pro 5.0.1 inline 插件且默认启用；`~/.zcode/v2/setting.json` 的
  `memoryEnabled=true`（Workspace Memory 开启是 operator 现状，旅程会继承；其产物是
  provider-local 非权威文件，记录在环境事实里，不要为旅程改它）。
- 基线 package.json version = 5.0.2：隔离件与真实 HOME 的 5.0.1 名字+版本都不同，遮蔽规避有效。
- 发现机制（zcode.cjs 源码 + Stage A 实测一致）：`plugins.dirs` 解析为最靠前的 inline 候选；
  插件 id 去重 first-wins（重复者记 `plugin_duplicate_id` 并忽略）；`enabledPlugins[id]`
  未列出时默认启用；同名时真实 HOME 的副本赢、临时副本被忽略——所以必须改名。
- Hook 去重按 hooks 文件 realpath（`Dyr=realpathSync`）：不同插件根互不遮蔽；每个已加载插件从
  自己的 rootPath 解析 hooks。Stage A 记录里两个 `plugin_hook_invalid: Duplicate plugin hooks
  file ignored` 警告是同一根经 dirs+marketplace 双路径各发现一次所致，每根一条、良性。
  注意：真实 HOME 5.0.1 与 b765b55 的 hook 字节有差异（`_common.py`、`mid_workflow_recall.py`、
  `adapters/zcode.py` 三个文件不同），所以运行时必须取证实际执行的是哪份（见 G 节）。
- 0.16.5 历史演练观察到 `--max-turns`/`--allowed-tools`/`--settings` 在 help 里存在但被 root
  parser 拒绝（dated evidence）；本流程不传这三个旗标。
- Stage A 续轮记录（如 `candidate-A-turn2-request.json`）标了 transport=`native-operator-resume`
  但没留字面 argv；本交接给出 argv 并要求逐轮记录，补上这个文档缺口。

## Root 执行清单

约定变量（每步命令自带，不依赖持久 shell 状态）：

```bash
BASE=/tmp/ubp-trellis-baseline-OlGj0q
NODE=/Users/rocky243/.hermes/node/bin/node
ZCODE_CJS=/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs
TESTID=ultra-builder-pro-step1-eval
```

### A. 生成隔离安装件（真实 HOME 零写入）

```bash
TESTROOT=$(mktemp -d /tmp/ubp-step1-journeys-XXXXXXXX)
cd "$BASE" && "$NODE" bin/install.js --zcode --global \
  --config-dir "$TESTROOT/zcode-config" 2>&1 | tee "$TESTROOT/install.log"
```

产物：`$TESTROOT/zcode-config/cli/plugins/marketplaces/ultra-builder-pro/plugin`（下称 `$PLUGIN`）
和 adapter 写出的 `$TESTROOT/zcode-config/cli/config.json`。`--config-dir` 使 homeDir 指向隔离根，
`shouldRunHostCli` 为 false，install 不调用原生 CLI、不碰真实 HOME（`adapters/zcode.js`、
`bin/install.js` 源码行为）。

先跑一次只读 doctor（改名前，证明生成件健康）：

```bash
cd "$BASE" && "$NODE" bin/install.js --zcode --global \
  --config-dir "$TESTROOT/zcode-config" --doctor --json > "$TESTROOT/doctor-prerename.json"
# 期望: status=healthy；configDir 模式下 native_registry 检查按设计跳过
```

### B. 改名（遮蔽规避；只改隔离件 manifest 的 name 字段）

```bash
PLUGIN="$TESTROOT/zcode-config/cli/plugins/marketplaces/ultra-builder-pro/plugin"
python3 - "$PLUGIN/.zcode-plugin/plugin.json" "$TESTID" <<'EOF'
import json, sys
p, name = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d["name"] = name
open(p, "w").write(json.dumps(d, indent=2) + "\n")
EOF
shasum -a 256 "$PLUGIN/.zcode-plugin/plugin.json"
```

`marketplace.json` 的 name 保持 `ultra-builder-pro` 不动（与 Stage A 一致）。改名后
provenance.json 中 plugin.json 的摘要对应改名前字节，属一次有意单字段 delta：
把改名后摘要记入安装清单并注明，不算源码漂移。

### C. 字节验证：冻结源 → 安装件（用产品自己的变换做判据）

```bash
cd "$BASE" && PLUGIN="$PLUGIN" TESTID="$TESTID" "$NODE" <<'EOF' | tee "$TESTROOT/install-verify.json"
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parse,serialize}=require('./adapters/_shared/frontmatter.cjs');
const {skillsForRuntime,WORKFLOW_HOOK_FILES}=require('./adapters/_shared/runtime-assets.cjs');
const zcode=require('./adapters/zcode.js');
const BASE=process.cwd(),PLUGIN=process.env.PLUGIN,TESTID=process.env.TESTID;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rows=[];let fail=0;
const chk=(rel,ok,extra={})=>{rows.push({path:rel,ok,...extra});if(!ok)fail++;};
for(const name of skillsForRuntime('zcode')){
  const {fm,body}=parse(fs.readFileSync(path.join(BASE,'skills',name,'SKILL.md'),'utf8'));
  const expected=Buffer.from(serialize({name,description:String(fm.description||'')},body));
  const got=fs.readFileSync(path.join(PLUGIN,'skills',name,'SKILL.md'));
  chk(`skills/${name}/SKILL.md`,expected.equals(got),{installed_sha256:sha(got)});
}
for(const rel of [...WORKFLOW_HOOK_FILES,'_common.py',path.join('adapters','zcode.py')]){
  const s=fs.readFileSync(path.join(BASE,'hooks',rel));
  const g=fs.readFileSync(path.join(PLUGIN,'hooks',rel));
  chk(`hooks/${rel}`,s.equals(g),{source_sha256:sha(s),installed_sha256:sha(g)});
}
const hmGot=fs.readFileSync(path.join(PLUGIN,'hooks','hooks.json'),'utf8');
chk('hooks/hooks.json',hmGot===JSON.stringify(zcode.buildHooksManifest(),null,2)+'\n');
const pj=JSON.parse(fs.readFileSync(path.join(PLUGIN,'.zcode-plugin','plugin.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(BASE,'package.json'),'utf8'));
chk('.zcode-plugin/plugin.json',
  pj.name===TESTID&&pj.version===pkg.version&&pj.skills==='./skills'&&pj.hooks==='./hooks/hooks.json',
  {name:pj.name,version:pj.version});
// .ultra-template 逐字节进入 ultra-init assets
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

判定：exit 0 且 `failed=0`。SKILL.md 的合法差异只有 frontmatter 归一化（zcode 运行时只保留
name+description，`plugin-core.cjs::skillFrontmatter`），正文逐字节一致；hooks 与模板逐字节一致。
这正是 Stage A “源文件与生成安装件各自摘要”的做法，不要把该变换误判为漂移。

### D. 旅程项目配置 + 原生发现验证

每个旅程项目目录（新建或 Claude 夹具的隔离副本）内放 `.zcode/config.json`：

```bash
mkdir -p "$TESTROOT/trial-a/.zcode"
cat > "$TESTROOT/trial-a/.zcode/config.json" <<EOF
{
  "plugins": {
    "enabled": true,
    "dirs": ["$PLUGIN"],
    "enabledPlugins": {
      "ultra-builder-pro@inline": false,
      "$TESTID@inline": true
    }
  }
}
EOF
```

原生发现（只读、不发起模型调用）：

```bash
cd "$TESTROOT/trial-a" && "$NODE" "$ZCODE_CJS" plugins list --json > "$TESTROOT/discovery-trial-a.json"
cd "$TESTROOT/trial-a" && "$NODE" "$ZCODE_CJS" skills list --json > "$TESTROOT/skills-trial-a.json"
```

判定标准（写进旅程记录）：
- `plugins[]` 中 `ultra-builder-pro@inline`：enabled=false、skillCount=0（真实 HOME 5.0.1 被项目级禁用）；
- `$TESTID@inline`：enabled=true、skillCount=14、rootPath 等于 `$PLUGIN`；
- `diagnostics[]` 无 `plugin_duplicate_id`；只允许每根一条的自指 `plugin_hook_invalid`
  （realpath 相同所致）及与本件无关的既存警告（如 document-skills 的 ZCODE_BASE_URL）；
- `skills list` 里 14 个 ultra-* Skill 的 `directory` 都在 `$PLUGIN` 下；真实 HOME 的用户级
  skills（如 agent-delegation）照常出现，属于日常环境保真，不剔除。

任何一条不满足：不启动旅程，把 discovery JSON 作为发现记录保留。

### E. 启动一次旅程（fresh session）

沿用 Stage A 的已注册 wrapper 传输（registry 的 zcode target argv 实测为
`zcode-acp --zcode-path /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs --node /Users/rocky243/.local/bin/node --prompt-timeout-secs 43200 --no-browser`，observed 0.16.5）：

```bash
agent-delegate run --to zcode --caller codex \
  --cwd "$TESTROOT/trial-a" --task-file <冻结Owner消息1.md> --timeout 1800
```

不传 `--model`（保留 target 默认，现有 GLM-5.2 Coding Plan）；权限用默认（保留 target 正常能力）。
每次只发当前一条冻结 Owner 消息，不展示未来轮次。
启动后取原生会话身份（两个来源互相核对）：

```bash
ls -t "$HOME/.zcode/cli/rollout/model-io-sess_"*.jsonl | head -1   # basename 即 sess_<uuid>
```

逐轮保存：request（含字面 argv/transport/caller/chain）、receipt、process-result、sess id、
实际 session 模型（事后从会话数据核对，Stage A 做法）、耗时与成本。

### F. 续轮（同一 native session；单列 transport）

先确认原进程已死，再用原生 operator resume；不重跑首轮、不替换输入：

```bash
kill -0 <原PID> 2>/dev/null && echo ALIVE-停止等待 || echo GONE   # 必须 GONE(ESRCH)
"$NODE" "$ZCODE_CJS" --cwd "$TESTROOT/trial-a" \
  --resume sess_<uuid> --prompt "<冻结Owner消息2>" --mode edit
```

记录 transport=`native-operator-resume`（与首轮 wrapper 传输分行），并记录字面 argv——
Stage A 的记录缺这一项，本轮补上。不要把多次无上下文调用冒充同一会话，也不把 native resume
当 ACP resume 资格。wrapper 现存的 `--session` 命名续谈对 zcode 的身份保持未验证
（Stage A 已读 bridge load_session 源码：注册新 UUID 且响应不回传），身份关键路径不要用它，
除非先证明跨轮返回的 sess id 不变。`-c/--continue` 只续 cwd 最新会话，精度不如显式 sess id，不用。

### G. Hook 字节运行时取证（首轮进行中做一次）

真实 HOME 5.0.1 与冻结 5.0.2 的 hook 有三个文件字节不同，ps 直接显示宿主绑定的是哪个插件根：

```bash
ps -ef | grep 'hooks/adapters/zcode\.py' | grep -v grep
```

期望命令行只出现 `$PLUGIN` 下的路径。若出现真实 HOME 路径或两根同时出现：停止该旅程，
记为隔离污染发现（Stage A 候选轮有 `[Hook additional context]` 注入成功的原生证据，
但当时未按路径取证，本轮以 ps 为准）。发现 JSON 不暴露 hooks 生效集，这一步不可替代。

## 备选 Host 与确切 gap

- **Kimi 0.41.0**：插件注册（`plugins/managed/` + `installed.json`）自包含、无需改名，但
  `credentials/`、`oauth/`、`server.token`、`config.toml`（api_key/base_url/default_model）都在
  KIMI_CODE_HOME 内——隔离重定向即失去模型认证，复制它们属于凭据复制，不在本次授权内。
  且 kimi 无原生 `plugins list` 类枚举命令（`kimi doctor` 只校验配置文件），“宿主将加载哪份
  字节”缺原生证明面。受支持的部分替代：`kimi --skills-dir <隔离skills> -p ...` 在启动时加载
  指定目录的 Skill 字节——这是 skills-only 探针，Hook 与注册表不被执行，**不能**当作原生插件
  安装测试报告。续会话面：`-S <id>` / `-c`，`kimi session list` 可查 id。
- **Claude 2.1.263**：若 ZCode 路被阻断，这是受支持的替代。`CLAUDE_CONFIG_DIR=<隔离>` +
  adapter 的 `skills/ultra-builder-pro` 布局自动发现为 `ultra-builder-pro@skills-dir`，无需改名；
  验证：`CLAUDE_CONFIG_DIR=<隔离> claude plugin list --json`（doctor 同款，只读）。认证预期经
  macOS Keychain 与 `~/.claude.json` 保留，但本稿未发任何调用验证，须由首次（计费）启动确认；
  模型为账号默认，不另 pin。续会话 `--resume <uuid>`/`--continue`。按 token 计费，成本高于订阅制
  ZCode；与正在写夹具的 Claude 进程无路径冲突，但共享 `~/.claude.json` 历史。
- **Grok 1.0.5**：锁定 profile 是 `--single` 无记忆单轮，无跨轮续会话面，不适合多轮旅程。
- **Codex 0.153.4 / OpenCode 1.18.21**：委派 profile 分别是 ephemeral exec 与单发 run；
  原生续会话面本次未核，留待需要时再评。第一步入门只需一个主试 Host。

## 明确不做

不建编排脚本、第二传输或新 manifest 格式（上述 JSON 均为 Stage A 同款证据记录）；不改产品/测试；
不装/卸任何 Host；不动真实 HOME、凭据、模型与默认设置；不发起付费模型调用（E 之后由 Root 按授权执行）；
不碰 Root 的基线路径与 Claude 的夹具路径；不把 `--skills-dir` 之类旁路当原生安装测试。

## 旅程记录落盘清单（TESTROOT 内）

install.log、doctor-prerename.json、install-verify.json、改名后 manifest 摘要、
每个项目的 discovery/skills JSON、逐轮 request/receipt/process-result、sess id 与传输分行、
hook ps 快照、实际 session 模型、耗时与成本、以及任何判定失败的原始证据。
