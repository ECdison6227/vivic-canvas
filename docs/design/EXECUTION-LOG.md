# 执行日志

> 由执行模型维护。规则见 `EXECUTOR-PLAYBOOK.md` 第 0、6 节。

## 当前线上状态

- 后端：容器 `vivic-preview-20261027`，镜像 `vivic-api:ff981e1ee401c5d3b4e6554d3f40366d64fc4179`；运行源码来自 Git `ff981e1`，与原线上基线源码一致。
- 决策模式：off（尚未接入）
- 已放开的类别：无
- 前端：`frontend-current` → 同事维护，执行模型不改
- 当前检查点：用户已授权清理后继续；A 与 B 已完成，进入 C 的影子接入准备。现有用户指令仍走原流程，决策模式未打开。
- 磁盘：当前可用约 9.78GiB；root 密码按用户要求未改。

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
- [ ] C2 决策客户端 / 目标解析 / 切句
- [ ] C3 接入 runIntent（影子）
- [ ] C4 决策日志
- [ ] C5 部署影子模式（🛑 检查点 2）

## 阶段 D

- [ ] D1 卡片契约
- [ ] D2 规划器只填参数
- [ ] D3 图片
- [ ] D4 三通道输出

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
