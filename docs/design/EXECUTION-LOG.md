# 执行日志

> 由执行模型维护。规则见 `EXECUTOR-PLAYBOOK.md` 第 0、6 节。

## 当前线上状态

- 后端：容器 `vivic-preview-20261027`，镜像 `vivic-preview-20261027:vo-helpmove-1414`（= Git `baseline/online-20261029`）
- 决策模式：off（尚未接入）
- 已放开的类别：无
- 前端：`frontend-current` → 同事维护，执行模型不改

## 基线失败

（A1 填写）

## 疑问

（遇到与手册不一致或无法执行的情况写在这里，并告诉用户）

---

## 规划阶段已完成（Claude，2026-10-29）

- [x] 线上代码快照推到 GitHub `baseline/online-20261029`；10/28 后前端补丁存档 `deploy/online-patches/`
- [x] 决策模型评测（161 题，结果 `evals/decision/results/`）：选定 StartLux 4B Q8 + Metal
- [x] 服务器放置协作规则 `/opt/vivic-preview-20261025/AGENTS.md`（链接 `CLAUDE.md`）
- [x] 服务器磁盘清理：23 个旧容器、22 个旧镜像、4 份旧前端完整副本、旧系统日志；可用空间 54MB → 2.3GB。清单：服务器 `/opt/vivic-preview-20261025/evidence/cleanup-20261029.txt`
- [x] 本机运维工具 `C:\Users\edsjrcheng\Desktop\vivic\tools\`（不进 Git）
- [ ] 评测集发给马泽瑜：飞书开放接口禁止给外部组织发消息，已准备好 `Desktop/vivic/decision-lab/send/`，**由用户手动转发**

---

## 阶段 A

- [ ] A1 本地开发环境
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
