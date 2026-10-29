# 执行日志

> 由执行模型维护。规则见 `EXECUTOR-PLAYBOOK.md` 第 0、6 节。

## 当前线上状态

- 后端：容器 `vivic-preview-20261027`，镜像 `vivic-preview-20261027:vo-helpmove-1414`（= Git `baseline/online-20261029`）
- 决策模式：off（尚未接入）
- 已放开的类别：无
- 前端：`frontend-current` → 同事维护，执行模型不改

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
- [ ] A2 同步同事的前端补丁
- [ ] A3 后端部署脚本（🛑 检查点 1）

## 阶段 B

- [ ] B1 Mac 常驻 vivic-decision
- [ ] B2 worker 转发
- [ ] B3 网关放行 + 专用密钥

## 阶段 C

- [ ] C1 路由类别定义 + 重跑评测
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
