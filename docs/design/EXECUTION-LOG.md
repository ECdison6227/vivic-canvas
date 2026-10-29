# 执行日志

> 由执行模型维护。规则见 `EXECUTOR-PLAYBOOK.md` 第 0、6 节。

## 当前线上状态

- 后端：容器 `vivic-preview-20261027`，镜像 `vivic-api:6c7e3e34ef79837b126d373f71cf1488d1967e70`，运行源码来自 Git `6c7e3e3`。
- 决策模式：shadow（只观察并记录，原规则/主模型仍执行，不开放新直接执行）
- 已放开的类别：无
- 前端：`frontend-current` → 同事维护，执行模型不改
- 当前检查点：A/B/C 的基础实施与合成回放已完成，停在检查点 2，等待用户“继续”后进入 D。真实主对话模型连接覆盖尚未验证。
- 磁盘：`df -h` 当前可用约 9.9G；root 密码按用户要求未改。
- Git 中另有序号定位安全修复 `a6bdcbf`，已测但未部署，随下一批批准更新合并；线上回放指标仍对应 6c7e3e3。

## 基线失败

2026-10-29 A1：后端单元测试 166 个套件通过，1365 项通过、3 项跳过、0 项失败。

类型检查存在 2 个基线问题（未修改业务源码）：

```text
src/space/executor.ts(162,33): TS2678: Type '"stage.sleep"' is not comparable to the current Action union.
tests/helpers.ts(8,23): TS2322: modelApiBaseUrl is string | undefined, but LocalApiConfig requires string.
```

后续不得新增测试失败或类型错误。完整原始输出保存在本机外层 `tools/execution-20261029/baseline-tests.json`、`baseline-tests.log`、`baseline-typecheck.log`，不上传运行日志。

## 疑问

- A1 的线上快照 `apps/local-api/package.json` 是容器安装产物，含 `file:///build/...` 引用且丢失 devDependencies；冻结安装最初失败。已恢复为仓库 `main` 与现有锁文件相符的 workspace/开发工具声明，冻结安装通过；未升级锁定版本，未改线上源码。
- 原远端仅把文档分支拉取到 FETCH_HEAD；已显式建立对应远端跟踪引用，再按手册创建 `dev/decision-layer`。

---

## 规划阶段已完成（Claude，2026-10-29）

- [x] 线上代码快照推到 GitHub `baseline/online-20261029`；10/28 后前端补丁存档 `deploy/online-patches/`
- [x] 决策模型评测（161 题，结果 `evals/decision/results/`）：选定 StartLux 4B Q8 + Metal
- [x] 服务器放置协作规则 `/opt/vivic-preview-20261025/AGENTS.md`（链接 `CLAUDE.md`）
- [x] 服务器磁盘清理：23 个旧容器、22 个旧镜像、4 份旧前端完整副本、旧系统日志；可用空间 54MB → 2.3GB。清单：服务器 `/opt/vivic-preview-20261025/evidence/cleanup-20261029.txt`
- [x] 本机运维工具 `C:\Users\edsjrcheng\Desktop\vivic\tools\`（不进 Git）
- [ ] 评测集发给马泽瑜：用户最新要求暂缓发送与后训练，不再尝试发送。

---

## 阶段 A

- [x] A1 本地开发环境
- [x] A2 同步同事的前端补丁
- [x] A3 后端部署脚本（🛑 检查点 1，等待用户继续）

## 阶段 B

- [x] B1 Mac 常驻 vivic-decision
- [x] B2 worker 转发
- [x] B3 网关放行 + 专用密钥

## 阶段 C

- [x] C1 路由类别定义 + 重跑评测
- [x] C2 决策客户端 / 目标解析 / 切句
- [x] C3 接入 runIntent（影子）
- [x] C4 决策日志
- [x] C5 部署影子模式与固定集回放（🛑 检查点 2；真实主模型覆盖待补）

## 阶段 D

- [x] D1 卡片契约（2026-10-30；接线与发布随 D2 集成）
- [ ] D2 规划器只填参数
- [x] D3 图片（2026-10-30；HTTP 接线随 D2 集成，真实视觉验收待补）
- [x] D4 三通道输出（2026-10-30；统一接线随 D2 集成）

## D1 执行记录（2026-10-30，Codex + 并行代理）

- 用户已明确批准继续检查点 2，按 Claude 手册进入 D；三个代理共享工作区按文件边界并行，父代理负责集成、提交与部署。
- 新增共享 `CardContract` 及 `cards/` 的 countdown/todo/note/answer/视图、edit/arrange/delete 契约。模型只填业务参数，编号、布局和系统时间由宿主生成；目标编号来自宿主，待办追加条目编号也由宿主生成。
- answer 复用 NewsCard，不套用新闻原文摘要限制；keyPoints/来源链接可省略。URL 来源由 D2 集成检查。多卡布局只为新卡寻找空位，已有固定卡不动。
- 验收：`vitest run tests/card-contracts.test.ts tests/card-operations.test.ts --maxWorkers=4`。专项分别 91、65 项；首轮全量 1636 通过、3 项原有跳过、0 失败。新类型模块无诊断；全仓类型检查仍有两处已记录基线错误。
- 已再次运行 `node scripts/sync-online-patches.mjs`，新补丁 0；线上前端指针未变。D2/D3 集成仍在工作区，未部署。

## D4 执行记录（2026-10-30，Codex + 并行代理）

- 新增 `intent/channels.ts`，say 最长 40 个 UTF-16 单位，拒绝 http、连续六位数字与列表符号；不安全则使用字幕首句，仍不安全就不播报。text 最长 120，截断不拆坏代理对。
- `applyOutputChannels` 只保留一条字幕，保留卡片动作。闲聊/即时短答走文字，回答与新建类落卡；澄清、错误和宿主操作保留现有独立响应协议，不伪造卡片或混入互斥的 envelope。
- `vitest run tests/output-channels.test.ts --maxWorkers=4` 原 55 项通过，父代理补一例裸 HTTP 文本拒绝，共 56 项；统一规划器与规则/适配器接线随 D2 提交后回归。

## D3 执行记录（2026-10-30，Codex + 并行代理）

- `hosted/assets.ts` 新增 `persistIntentImage`：只处理本次明确上传的一张图，验证像素、规范化 WebP、去除私有元数据后存入账号/Space 资源，复用去重、100MB 容量限制、事务和撤权检查。保留的是安全规范化的图像，不宣称原始文件字节未变。
- `cards/imageAnalysis.ts` 仅收 headline/summary/keyPoints；media 引用只能由宿主提供，不读取历史图、外链或模型猜测的 URL。继续使用 NewsCard。
- `intent-image-retention.test.ts` 23 项通过；连同原图片解码测试 48 项通过。父代理并行验证的完整 HTTP 链 5 项通过：模型图文输入、卡片提案、owner 提交、资源读回、跨账号/Space 拒绝。HTTP 接线与对应测试随 D2 统一提交。
- 已检查源码 NewsCard 的 MediaImage/useMediaUrl 支持 hosted media 引用；尚未做当前线上页面的视觉验收。若视觉模型未连接或规划失败，已明确上传且保存的图片可能暂时无卡片引用，但仍受配额限制；不自动删除去重资源以免误删其他卡片使用的图。
- 测试使用程序生成图片与隔离账号、模拟视觉模型，不能作为真实模型识图质量结论。

## 阶段 E

- [ ] E0 🛑 检查点 3（放开类别需用户同意）
- [ ] E1 on 模式执行
- [ ] E2 删除确认
- [ ] E3 目标歧义追问
- [ ] E4 版本冲突重试

## 阶段 F

- [ ] F1 manifest v0.2
- [ ] F2 安装接口
- [ ] F3 动态类别
- [ ] F4 扩展卡参数
- [ ] F5 做卡指南（🛑 检查点 4）

## 阶段 G

- [ ] G 演示准备与交接

---

## 额外授权：指定项目删除（2026-10-29）

- 用户明确授权删除 WorthWise、Jitsi、电影解析/私人影院、简伴、XUAN、《复习1.mp4》及指定旧站备份；此授权覆盖手册此前对这些其他项目的保护条款，其他项目继续保留。
- 共删除 46 个限定目标，释放 4,700,459,008 字节（约 4.38GiB），可用空间提高到约 6.58GiB，使用率 95% → 84%。
- nginx 配置通过；保留的 9 个服务、15 个网页/接口状态与操作前一致；Vivic healthz 正常；WorthWise 旧入口返回 410。
- 服务器证据目录：`/var/backups/vivic-maintenance/cleanup-selected-20261029T183110/`；外层本机 `design/服务器指定项目删除结果-20261029.md` 为用户可读结果。

## A1 执行记录（2026-10-29，Codex）

- 分支：`dev/decision-layer`，基于 `origin/docs/decision-plan-20261029` 的 `c5e6fa7`。
- 改动文件：`apps/local-api/package.json`、本执行日志。
- `corepack pnpm install --frozen-lockfile`：791 个依赖包安装成功，使用 pnpm 12.11.2；锁文件未改动。
- `corepack pnpm --filter @vivic/local-api test --maxWorkers=4 --reporter=json ...`：166 套件、1365 项通过、3 项跳过、0 项失败。
- `corepack pnpm --filter @vivic/local-api typecheck`：退出码 1，上述 2 个既有类型错误已记录。
- 未修改业务代码、测试断言或前端。下一项：A2，同步同事的前端补丁。

## A2 执行记录（2026-10-29，Codex）

- 新增 `deploy/online-patches/sync.sh`、`import.py`、`scripts/sync-online-patches.mjs`，补充归档 README。
- 首次同步 7 个此前未收录的目录：auth-ui 两版、cursor-owner、preview-shell、ui-refresh，以及当天的 space-entry、unified-background。
- 只导出允许的补丁与元信息；未读取完整 web/assets 副本用于发布，未改动服务器前端。
- JSON 记录在导出时去除环境变量和凭据；本次有一份旧 container-before.json 需要脱敏，未将原始环境字段提交 Git。
- 第二次、第三次运行均返回 imported=[]；已有存档内容未被覆盖，更新的既有跟踪文件只有 README 与运行指针。
- 手工夹具验证：新导入成功、拒绝覆盖既有目录、拒绝路径穿越、凭据脱敏，4 项均通过。
- 当前前端指针仍为 `releases/unified-background-20261029-1/web`，后端镜像仍为 `vo-helpmove-1414`。下一项：A3 部署与回滚脚本。

## A3 执行记录（2026-10-29，Codex）

- 新增 `deploy/backend/Dockerfile`、`deploy.sh`、`rollback.sh`、README，新增本机入口 `scripts/deploy-backend.mjs`；`.gitattributes` 固定 Bash 脚本为 LF。
- 运行环境文件已在服务器复制到 `backend/env.list`，权限 600；核对与原容器实际运行环境一致，未输出或提交任何环境变量值。
- 部署前比较 146 个实际源码文件，Git 与运行容器一致；容器另有 136 个 AppleDouble 元数据文件，不属于运行源码。
- 使用 Git `ff981e1ee401c5d3b4e6554d3f40366d64fc4179` 中的三个 runtime 源码目录进行基线部署；A3 新脚本测试后在本任务提交，运行源码未改动。

验收顺序及输出：

```text
node scripts/deploy-backend.mjs
consistent-backup-ok
dependency-imports-ok
staging-sqlite-ok
production-sqlite-ok
DEPLOY_OK sha=ff981e1ee401c5d3b4e6554d3f40366d64fc4179

node scripts/deploy-backend.mjs --rollback
ROLLBACK_OK image=vivic-preview-20261027:vo-helpmove-1414
回滚后主页 HTTP 200，healthz ok:true。

node scripts/deploy-backend.mjs
consistent-backup-ok
dependency-imports-ok
staging-sqlite-ok
production-sqlite-ok
DEPLOY_OK sha=ff981e1ee401c5d3b4e6554d3f40366d64fc4179
```

预检期间曾遇到并修正以下问题，全部发生在停止生产容器之前：

1. BuildKit 把裸 `sha256:...` 当成远端镜像名，出现 `DeadlineExceeded: failed to resolve source metadata`。改为使用当前本机镜像标签并核对其 ID。
2. 系统 SQLite 过旧，报 `malformed database schema (accounts) - near "STRICT": syntax error`。改为在独立容器中用相同 Node SQLite 运行库对生产只读挂载进行一致备份。
3. 暂存副本复制了生产进程锁，报 `Space data directory is already owned by a running process.`。只移除暂存副本的 `space.lock`，保留生产锁不动；失败预检容器和副本均自动清理。

最终检查（19:01 北京时间）：

- 15 个保留入口的 HTTP 状态与清理前一致，9 个其他项目服务状态无变化。
- Vivic 主页、healthz 为 200，数据库 quick_check 成功，持久数据仍挂载原目录。
- 前端指针保持 `releases/unified-background-20261029-1/web`；未发布前端。
- 暂存目录已清理，当前可用 7,060,656,128 字节（约 6.58GiB）。
- 最终验收记录：服务器 `backend/acceptance-A3-20261029.json`。
- 已完成部署 → 回滚 → 再部署，按手册停在检查点 1；下一项 B1 等待用户“继续”。

## 追加任务：只保留最新版（2026-10-29，已完成）

- 用户明确要求只保留当前最新版，最新版备份 GitHub，完成后直接继续原计划；此授权覆盖旧规则“保留 5 份 web”和不清理历史前端目录的限制。
- 先前 Git 中只有后端源码、较早前端源码和增量补丁，不能单独还原最新页面；本次补上完整前端恢复包。
- 当前版本 `unified-background-20261029-1`，全量 1645 个文件按内容去重为 405 个对象；ZIP 为 24,114,830 字节，SHA256 `e42713d3eb58f86023028618aa0ec6cf453fb014200747a74bc283474ebc6690`。
- 服务器临时目录完整还原并逐文件校验通过；本机下载后内容校验与 ZIP SHA256 均通过。
- 备份文件及无依赖恢复工具位于 `deploy/online-snapshot/`。数据库与密钥留在服务器，不进入 Git。
- 本轮 shell Git 凭据 helper 没有取得会话令牌；通过 mirasim 正常 Git 接口执行推送，不绕过凭据隔离。执行 worktree 已登记到 mirasim；会话目录切换被拒绝，仍显式使用本 worktree 运行命令。
- 只有在上述备份推送成功后，才删除旧 release、旧构建目录和旧源码副本；保留当前页面及自动回滚需要的最小后端副本。

完成结果：

- 完整恢复包已随 `14950fa7f258f50e93007c122b008df89aa3ae34` 通过 mirasim 正常 Git 推送接口备份成功。
- 清理 56 个限定历史目录/文件，服务器 `releases/` 只剩 `unified-background-20261029-1`。旧 `/root/vivic-vo-*` 构建材料和旧 host source 已删除。
- 清理回滚演练遗留的停止容器，删除两个多余旧镜像标签；保留当前镜像和最小回滚基线，原基线保护规则继续有效。
- 清理过程释放 3,614,552,064 字节（包含本轮产生的约 139MB 临时压缩包）；相对本轮开工时净增加约 3.21GiB，当前可用 10,501,259,264 字节（约 9.78GiB）。
- 再次逐文件校验当前网页与 Git 备份内容一致；主页 200、healthz 正常，nginx 配置通过。
- 服务器协作说明已更新为“只保留当前版本，先 Git 备份再清理历史”。私有数据库和密钥未上传 Git，也未清理线上数据目录。
- 审计记录：`/opt/vivic-preview-20261025/evidence/prune-latest-20261029T192209/`。
- 部署脚本不再依赖已删除的旧构建目录；新环境仍须单独提供私有 `backend/env.list`。

## B1 执行记录（2026-10-29，Codex）

- 新增 `deploy/decision/service.py`、`install.py`、`verify.py`，部署到 Mac 的 `VivicModelAPI/decision-service/`；权重复制到正式 models 目录。
- launchd：`com.vivic.decision`，开机自启并保持运行；仅监听 `127.0.0.1:19095`，llama-server 使用 Metal、单并行、4096 上下文、4 线程，与既有评测参数一致。
- 采用原 worker-token 鉴权；单次推理串行，最多 4 个等待请求；过载返回 429，未认证返回 401。
- 10 道既有中文评测题全部判对，热请求中位数 1579.1ms（目标 <2200ms）。
- 原 TTS 服务同时合成成功（WAV 69,164 字节，未播放）；决策中位数为 1596.0ms，合成完成后为 1583.1ms；模型 PID/generation 未变，确认没有被语音服务换出。
- 6 个并发请求返回 `[200,200,200,200,200,429]`，符合 1 个执行 + 4 个等待的上限。
- 主动终止独立模型子进程后自动恢复；`launchctl kickstart -k` 后父服务恢复，旧模型进程已退出，没有遗留占用。
- 验收文件：Mac `decision-service/acceptance-B1.json`，包含延迟、鉴权、队列与恢复结果。
- 未改变既有 ASR/TTS 调度或文件服务行为。下一项 B2：只给现有 worker 增加原生 4B 转发分支。

## B2 执行记录（2026-10-29，Codex）

- 新增 `deploy/decision/wire_worker.py`；先备份 Mac 的 supervisor.py，再增加原生 `startlux-decision-4b` 转发分支及模型列表条目。
- 新分支直接转发到 `127.0.0.1:19095/v1/native`，超时 20 秒，沿用 worker 鉴权；其他模型继续使用原调度路径。
- 等旧 worker 空闲后通过 SIGTERM 优雅重启，利用原 launchd KeepAlive 自动恢复，未强杀正在进行的推理。
- 通过原 worker 端口请求原生 4B 成功，端到端 1673.3ms；原 ASR 请求成功且有文字，原 laya 分类请求仍成功。
- ASR、legacy 分类前后独立 4B 模型 PID/generation 保持一致，确认没有进入旧的单模型替换调度。
- Mac 验收：`decision-service/acceptance-B2.json`。下一项 B3：网关登记模型及最小权限专用 key。

## B3 执行记录（2026-10-29，Codex）

- 新增 `deploy/decision/wire_gateway.py`、`provision_key.py`；网关与权限列表备份后登记 `startlux-decision-4b`，原生 state/questions 已由既有 JSON 转发机制支持，无须改动其他接口。
- Node 语法检查、网关重启与健康检查成功，HTTPS 证书校验成功。
- 使用管理员正常登录接口建立 `vivic-backend-decision`，明确限制为 `permissions:['decisions']`；凭据仅通过 SSH stdin 传送，未进入命令行参数、Git 或对话输出。
- 专用 key、URL、模型名写入服务器 `backend/env.list`（权限 600）；原有其他环境项保留，创建前留了私有备份。
- 通过公网 HTTPS 网关发送原生 4B 请求返回 200，测试判为 countdown；两分类示例端到端 478.4ms（不作为 16 分类基准）。
- 同一个 key 请求语音合成返回 403；模型列表只包含 4 个分类模型，包含 4B，不包含 TTS 模型。
- 验收文件：服务器 `backend/acceptance-B3-20261029.json`，不含任何 key 原文。
- 当前助手应用尚未接入新路由，下一阶段先影子运行，不改变原指令执行结果。

## C1 执行记录（2026-10-29，Codex）

- 新增共享 `packages/contracts/src/routes.ts` 并导出；类别与描述采用手册给定的 16 类。
- 评测集只更新 routes 描述，161 道题与答案保持不变；cases SHA256 为 `ded486be9db2c40f0a76c0a3cd62f511524ec30529bfd99cd7211a4445a8c33f`。
- 在 Mac 上使用原 `startlux_eval.py`、同一 4B Q8 和 Metal 重新完整评测；新结果 `evals/decision/results/startlux-4b-q8-metal-routes-v2.json`。
- 路由准确率 153/161（95.03%）→ 159/161（98.76%）；高置信覆盖 85.71% → 89.44%，高置信准确率 98.55% → 99.31%。
- 路由耗时中位数 1781.7ms、P95 1857.2ms，目标选择仍为 92.86%。多意图判定仅 70%，仍按手册由确定性切句处理。
- 剩余误判：取消固定被判 edit（概率 0.432，直接执行门限以下）；复合的聚焦+高亮被判 highlight（概率 0.916，需按动作切句）。
- 没有触发“准确率下降超过 1 个百分点”的回退条件，保留新描述。下一项 C2 的路由/目标/切句已在工作区开发和验证，待独立提交。

## C2 执行记录（2026-10-29，Codex）

- 新增 `decision/router.ts`、`target.ts`、`split.ts`；新客户端单次只问 route，4 秒超时，错误/非法输出返回 null，不将上游错误显示给用户。
- 状态结构沿用评测，最多 40 张卡、每卡描述最多 110 字，保留聚焦卡并优先最近更新项；目标优先标题/别名、聚焦指代、坐标、唯一类型，必要时仅再问一次模型。
- 切句保护否定、条件与引号；最多 3 段，避免“再见”“再快一点”等误切。针对评测剩余的聚焦+高亮复合句，识别逗号后的明确独立动作，普通清单和计时+提醒内容保持完整。
- `decision-routing.test.ts` 共 17 项通过，覆盖单次调用、非法输出、弃权、超时、上下文边界、否定/引用、多意图、明确目标和歧义。
- 类型检查没有新增错误，仍只有 A1 记录的 2 个基线问题。
- C3 的影子观察器和依赖注入正在工作区实现，未部署，现有线上执行行为未改。

## C3 执行记录（2026-10-29，Codex）

- `runIntent` 增加只读影子观察，原实现保持为 authoritative legacy 路径；模型与旧流程并行，旧流程结束最多额外等待 300ms。
- `trace` 为可选字段，包含分类/目标、延迟和旧流程动作/卡型；旧网页使用宽松结果解析，可忽略新字段，不需要修改或发布前端。
- 对旧 task/V2 包装的直接宿主操作也在外层观察，避免漏记“不经过 legacy runIntent”的聚焦、撤销等路径；内部子查询不重复触发影子。
- 将 operator router 经 hosted service → online session → createApp → PipelineDeps 注入；更新了普通会话和模型连接验证后替换的候选会话。
- 影子观察完成前先返回 pending trace；之后完成的 trace 使用相同 id 异步更新。SSE 正常结束不取消只读观察，用户在旧流程结束前取消则仍向模型传递取消信号。
- 记录回调异步调度，失败不会影响响应；单独记录 decision elapsed，不把主 LLM 的等待误算为分类耗时。
- 6 项影子测试通过，旧 planning 回归 71 项通过；C2 共17项通过。类型检查仍只有 A1 的 2 个基线错误。
- off 是精确旁路；on 在此阶段仍不启用新执行，等待 D/E 与检查点 3。
- C4 的存储/账号日志功能在工作区实现，已通过 6 项定向存储测试，待独立提交及全量回归。

## C4 执行记录（2026-10-29，Codex）

- 幂等增加 `decision_log` 表及账号/trace 唯一索引，保留全站最近 20000 条。pending 与 late complete 使用同一 id 更新，不重复计数，也不覆盖已记录的执行结果和 undone 标记。
- 普通浏览器、候选模型连接会话和 hosted task 路径均在已认证账号范围内写日志；只读 GET `/api/space/decision-log?limit=200` 只返回当前账号记录，不能指定他人账号。
- 记录原意图文本、路由与旧流程对照元信息，但会掩码已知凭据形态及密码/token 赋值。无权访问的 spaceId 不绑定，完整 canvas/图片/设备定位不写入日志。
- 服务端历史撤销和文字撤销会在 30 秒窗口标记近期记录；撤销指令本身不被错标。命令重试不会给后来的新日志误打 undone。
- 浏览器结果先记 proposed，收到旧任务协议验证过的执行回执才记 succeeded/failed；任务路径按实际执行结果更新。回执/取消不重复触发分类，短暂有界缓存处理“回执先于异步日志”的顺序。
- 针对复合聚焦+高亮，影子推演只在自己的上下文副本传递聚焦，不修改实际画布。真实 NewsCard/CountdownCard/NoteCard 字段与评测字段适配已补齐，避免只对抽象测试卡有效。
- 新增 `scripts/decision-report.mjs`，仅查询聚合需要的元信息，输出类别数量、旧流程一致率、P50/P95、失败和撤销数量，不输出用户原话。明确一致率不等于真实准确率。
- 9 项存储/鉴权/回执测试、9 项影子测试、18 项客户端/目标/切句测试通过；报告统计 2 项 Node 测试通过。
- 全量后端回归 1401 项通过、3 项既有外网诊断跳过、0 项失败；类型检查仍只有 A1 的两个既有问题。原始结果在本机 `tools/execution-20261029/c4-release-tests.json`。
- 下一项 C5：单次生产部署影子版本；用新测试账号及 off 克隆基线对比回放，不使用真实用户 Space。测试账号不继承真实大模型连接，覆盖范围会如实报告。

## C5 执行记录（2026-10-29，Codex）

- 生产已部署影子版 6c7e3e3，Mode shadow；新后台服务只观察不接管操作，前端保持当前版本未覆盖。
- 正常注册接口建立 evaluation 专用账号并确认身份；test Space 独立，测试会话/邀请码/密码仅存服务器私有文件。未读取真实用户模型凭据用于测试。
- off 基线在克隆数据的私有网络容器运行，不为对比反复切换生产模式。回放通过正常 Cookie/Origin/owner API提交提案，测试完清空，随后移除克隆容器/数据与容器临时凭据。
- 完整 161 条：主路由160/161（99.38%），单次路由 P50/P95=1725/1794ms；包含目标与多子句的完整决策链=1729/3383ms；失败、缺失、未完成记录均为0。
- 初次额外等待 P95=314ms，已修正内部等待为250ms并再部署回放。最终全部额外等待 P50/P95=253/261ms；85条纯规则可比较样本=253/255ms，内部等待P95=251ms。
- 旧流程输出类型160/161一致；仅 search-06 当次联网分支不同，隔时顺序复测两边均正常一致。具体当次原因无法确定，旧搜索的10次/分钟窗口及外部返回未锁定；保留差异，不谎称联网结果逐字一致。
- 指卡39/42（92.86%）：两条保守歧义，另有无列表焦点卡的序号捷径问题。已收紧该规则并加测试，提交a6bdcbf但暂不再重启部署。最左边同x两卡的题目还需人工复核，绝不强行猜测以抬分。
- 回放实际提交51张新卡后清空测试Space。界面效果为接口级验证，未宣称完成浏览器视觉验收。
- 两边均未连接主对话模型，不能据此宣称真实主模型的生成质量和端到端耗时已验证。D阶段正式失败率验收前须在测试账号通过网页连接可用模型，不把密钥贴在聊天里。
- 报告：`docs/design/C5-影子验收-20261029.md`；原始合成结果在 `evals/decision/live/`，已检查不含测试密码/cookie/邀请码或服务器私有key。
- 最新代码类型检查只有A1两个基线错误；序号安全修复后的定向28项通过，最终全量1402项通过、3项既有跳过、0失败，结果见本机checkpoint-two-tests.json。
- 最终前端1645文件/405对象重新哈希核验通过；15个保留站点状态无变化；Mac模型仍loaded，pending=0；数据库与健康检查通过。
- 按手册停在检查点2，下一项D1；E的on模式仍需检查点3的单独批准。
