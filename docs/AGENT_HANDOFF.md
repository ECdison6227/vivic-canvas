# 当前交接

2026-10-22 最终验收：PLAT-01 参考协议/旅游 DEMO、PLAT-02 v0.1 声明式包宿主、底层修复、SSE 进度与 105 条评测已本地实现并验收。Web 586 + API 1167 项通过，3 项既有真实服务测试跳过；56 项关键浏览器场景分批通过；冻结安装、类型、契约、lint、构建与交付包校验通过。当前分支 `feat/card-platform-runtime` 已包含最新 main，产品代码提交 `6938d6a`，平台改动未推送。详细真实结果、兼容性及边界以 [平台验收](verification/platform-20261021.md) 为准，不重复执行下面历史“尚未实现”的准备工作。

可直接导入的参考包在外层 `delivery/card-platform/goal-progress.vivicard`。真实飞猪和包内 live 能力尚未接入；真实模型抽样被现有服务 401 拒绝，因此没有模型准确率结论。后续应在此实现基线上接入 xlz 提供的真实适配结果，并在有效连接下跑真实模型评测；#13/#14 继续等待作者修改，不自行并入。

2026-10-21 维护者实现更新：原设置改动已通过 [PR #16](https://github.com/ECdison6227/vivic-canvas/pull/16) 合入，DEC-01 已补配置容错并通过 [PR #15](https://github.com/ECdison6227/vivic-canvas/pull/15) 合入；#13/#14 已请求修改并保留 Draft。当前本机 `feat/card-platform-runtime` 正在完成最终验收，包含 PLAT-01 结构化旅游 DEMO、PLAT-02 声明式导包/Test Space、旧画布恢复、有限上下文、拆包、SSE 进度及中文评测集合。线上任务已存在：[PLAT-01 #9](https://github.com/ECdison6227/vivic-canvas/issues/9)、[PLAT-02 #10](https://github.com/ECdison6227/vivic-canvas/issues/10)。当前能力见 [CAPABILITIES](CAPABILITIES.md)，导包实际接口见 [CARD_TEST_SPACE](CARD_TEST_SPACE.md)；下文 10/20 记录用于追溯，不能再当作功能未实现清单。

真实飞猪响应与真实模型质量仍需独立验收；105 条离线 golden 回放验证的是校验/builder，不等于模型命中率。新的平台实现尚未因上述 #15/#16 自动进入 main，提交状态以当前 Git 与验证记录为准。

更新：2026-10-20。仓库整理已通过 PR #1 合入 `main`（`c20a217`）；GitHub Desktop 已安装并完成本机同步，`main-protection` 已在公开规则页确认 Active。当前为“飞猪旅游系列卡片”整理开发契约、Skill 与交接任务，尚未实现旅游卡片或实际 MCP 接入。

最新：用户提供 10/19 会议 PDF/Excel，并授权只读飞书分工资料。已核对两场原始文字记录，形成 [实名分工与8项工单](team/README.md)、[AI 开工/提交PR提示词](team/WORKFLOW.md)、[两位伙伴所需资料](team/REFERENCES.md)。实际为 xlz 旅游/卡片/UI、马泽瑜决策/启动器、程佳锐核心/接入；此前推测的 CORE/FE/BE 草案已被替代。完整源材料留 `.cache`，不上传原始会议或私有研究内容。尚未创建线上 Issue、Project、assignee 或发送消息。

用户已提供两位账号：xlz=`franzkotkowski330-collab`，马泽瑜/mzy=`Shenbeijc`。账号已写入个人说明、工单与分工数据；线上分配仍未执行。下一教学步骤先提交/发布当前文档分支并 PR 合入，然后创建首轮 PLAT-01、TRAVEL-01、DEC-01 Issue，填写真实链接后再认领开工。

## 用户的最新安排

- 共三人：维护者、偏前端伙伴、偏后端伙伴。两位伙伴使用 AI 编程，需要明确限制。
- 用户已纠正此前分工：维护者重点优化核心流程，也可开发新功能，统筹接口、产品范围与合并。
- 两位伙伴可以开发 Landing、新卡片和新功能，按与核心的依赖程度选择任务；限制写在任务的代码范围、接口与验收条件里，不限制为只交测试报告。此前 FE-001/BE-001 报告草案已撤回，尚未正式分配任务。
- 采用 fork → 任务分支 → PR → 维护者验收；首轮不授予主仓库写权限。主分支规则已启用，成员权限、具体 Issue 和看板尚未设置。
- 本地版验收后再讨论部署、账号与收费。主线不等待伙伴任务，只有复现出的确切阻断问题才进入修复安排。
- 用户随后补充：决策模型优先作为标准能力接入，API/本地均可，用户明确关闭时才选择纯 LLM 路径；现有默认关闭的 Kev 实验不等于完成此目标。JevHarness 已列入 [评估候选](research/jev-harness-assessment.md)，只做初步资料核查，不改变当前 GitHub 操作流程。

## 接手先看

1. [团队任务单](TEAM_TASKS.md)：按依赖分工、任务模板与可复制给 Agent 的指令。
2. [实施现状](implementation-status.md)：已有能力、实验与待开发项。
3. [贡献指南](../CONTRIBUTING.md) 和 [Git 约定](GIT_WORKFLOW.md)：安装、分支、PR、验收。
4. [本地路线](LOCAL_ROADMAP.md)：功能顺序与可分配范围。

## 工作区和验证

仓库 `ECdison6227/vivic-canvas`，集成分支 `main`。本轮卡片文档分支 `docs/card-development-contract` 从干净的 `test`（与 `c20a217` 相同）创建；实际状态以 `git status --short --branch` 为准。按用户的逐步教学流程，不自动提交、推送、合并。

新增入口：[卡片开发契约](CARD_DEVELOPMENT.md)、[项目 Skill](../.agents/skills/vivic-card-development/SKILL.md)、[飞猪任务](tasks/fliggy-travel-cards.md)。开发规则使用现有目标进度卡作可运行样例；飞猪能力只核对了官方文档/仓库，实际工具 Schema、鉴权和响应仍须实测。

用户进一步明确卡片要支持具体参数/用户编辑、确定视觉、深浅色适配、复用现有组件，并以 Agent 按 Skill 制作后可导入为长期目标。已补 [单卡设计表](cards/CARD_SPEC_TEMPLATE.md)、契约 6.1/6.2 与 [扩展设计](CARD_EXTENSION_DESIGN.md)。当前没有通用自动参数表单、插件包安装或外部 renderer 宿主；设计候选不作为已实现 API。

已确认：在设置导入卡片包，先解析校验，再进 Vivic Test Space 弹窗预览和试跑，最后确认安装。[产品流程](CARD_TEST_SPACE.md) 不变；[首轮任务入口](tasks/card-platform-first-sprint.md) 已指向会议校正后的工单。平台协议/宿主由程佳锐牵头，旅游卡片由 xlz 先独立开发再接线。当前文档分支仍待用户按步骤提交和合入。

本轮 Skill 格式、真实解析样例、文档 JSON 与契约一致性通过；API 定向 93 + Web 定向 67 项通过，见 [卡片开发验证](verification/card-development-20261020.md)。尚未提交推送，不把规范交付等同于旅游卡片已开发。

本机已有 Node 24.21.0，依赖按 pnpm 12.11.2 锁定安装。若终端没有 pnpm 命令，见贡献指南中的局部 Corepack 入口。旧 `scripts/dev.mjs` 的跨平台启动仍需真实检查，单独启动命令可用于定位问题。

协作准备阶段已有 Windows 验证：web 520 + API 1,070 项通过，另 3 项跳过；契约、类型和构建通过。`.gitattributes` 固定生成契约为 LF，修复 Windows CRLF 一致性误报。详见 [验证记录](verification/local-development-20261019.md)。PR #1 的 Linux/Windows CI 此后均已通过；真实模型、音频和用户设备的验证边界仍保留。

## 保留的边界

复用现有组件、owner/持久化和受控 Action 链路。不要读取或输出认证文件，不重置用户画布，不因交接而重复 OAuth 登录。自动化静音、不采集物理麦克风；浏览器测试用独立 context 和 5174/8788。

历史交接与旧分支记录移到 [归档目录](archive/README.md)。源码所依赖的生成契约、示例、许可证、模型清单和验证脚本均保留。
