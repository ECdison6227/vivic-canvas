# Vivic 仓库工作约定

先读 [README_FIRST.md](README_FIRST.md) 和 [当前交接](docs/AGENT_HANDOFF.md)，再按任务读取模块。本文件是当前产品与协作约定；旧阶段报告和归档指令只供追溯，不用于重复开发。

2026-10-19 最新安排：三人协作完善本地单人版，再讨论部署、多账号和收费。维护者重点优化核心流程，也可开发新功能；偏前端、偏后端的伙伴可承担 Landing、新卡片和新功能，按与核心的依赖程度分配。当前路线见 [本地开发路线](docs/LOCAL_ROADMAP.md)，分工边界见 [团队任务单](docs/TEAM_TASKS.md)，协作入口见 [贡献指南](CONTRIBUTING.md)。

- 伙伴/贡献者 Agent 按已分配任务的文件清单、接口契约和验收标准工作；允许实现任务内的新功能、卡片、Landing 和相应测试，不因角色被限制为只写报告。
- 核心请求链路、认证、共享契约、owner/同步/持久化及依赖/CI 的跨模块修改由维护者统筹，任务确实需要时先明确接口与集成范围。超出任务的修复另记，不能顺手扩展；不得删除必要测试、降低断言或跳过检查来掩盖失败。
- 伙伴默认从 fork 提 PR，维护者核对范围并决定合入；不因伙伴未交付而阻断主线。CODEOWNERS 与文档不等于线上写权限/分支规则已生效。
- 2026-10-20 已按会议核对分工：程佳锐做核心/卡片接入和集成，xlz 做旅游卡片/MCP 独立试跑及 UI 原型，马泽瑜做决策模型和本地启动器。以 [当前工单](docs/team/README.md) 为准，不按旧“前端/后端”猜测让马泽瑜改飞猪适配。AI 开发与提交 PR 的执行边界见 [WORKFLOW](docs/team/WORKFLOW.md)。
- 新卡片任务先按 [卡片开发契约](docs/CARD_DEVELOPMENT.md) 固定模型数据、Schema、事实来源、渲染与编辑接口；配套 [开发 Skill](.agents/skills/vivic-card-development/SKILL.md)。首个系列为 [飞猪旅游系列卡片](docs/tasks/fliggy-travel-cards.md)。不把开发 Skill 当运行时插件，不因外部 MCP 数据接入而跳过校验。

- 这是 Web 信息画布，Control/Display 双视图；Display 保持极简。2026-10-16 用户反馈更新：纯计时器只有数字；带事项的提醒显示事项与时间，未固定提醒合并呈现，到时后退出画布、记录留在 Control。2026-10-17 起 Control 分为用户页 `/`（只有设置按钮、头像、对话和文字/语音输入）与设置页 `/control`，二者是同一个 owner 窗口，见 [用户页](docs/user-page-20261017.md)。
- 保留已批准的 SmoothUI Orb、Assistant UI styled registry、React Flow、Motion、Radix/shadcn、Lucide、Recharts；不要自行重画替代。背景按用户 2026-10-17 提供的 HTML 改为「流光以太」（`components/atmosphere/`），三页共用；用户只能换 6 深 + 6 浅配色，不开放动画形式选择。
- 当前 LLM 接 StepFun Coding Plan、GPT/Pi OAuth；用户已提出通用自带服务与预设连接方向，后续按路线中的具体任务扩展。语音独立；Pi 只迁移认证/模型，不启用 coding tools、session、扩展或 skills，不开发新 OAuth 协议。
- 决策模型纳入本地版正式接入目标，支持 API 或本地运行；产品默认优先引导配置并使用，用户明确关闭时允许直接走 LLM。服务不可用或判断不确定时要有明确降级，不静默改成永久关闭。现有 Kev 默认关闭是旧实现状态，不代表新目标已完成。JevHarness 先做适配评估，见 [候选记录](docs/research/jev-harness-assessment.md)；当前仓库整理与 GitHub 教学流程不变。
- 模型只生成校验后的 Action/数据，不能执行代码或虚构联网数据。图片仅用于当前明确发送的请求。
- 凭据不进入源码、文档、日志、浏览器存储或画布；`.env*`、`.cache/`、`evidence/` 默认不入 Git。不要删除本机验收证据。
- 当前自动化测试静音，TTS 保持关闭，不采集物理麦克风；实际播放需用户后续明确允许。浏览器测试使用独立 context，不碰用户真实画布。
- 自动排版须避开固定卡片；关注长文本、内容增长、撤销和旧画布恢复。两张均固定时不能擅自移动坐标。
- 在当前开发分支继续，小步提交；不要重置/覆盖已有工作。未收到用户“提交 PR”等明确指令时，不自动推送、合并或发布。基线/分支约定见 [Git 工作方式](docs/GIT_WORKFLOW.md)。
- 当前协作仓库为 `ECdison6227/vivic-canvas`，合入分支为 `main`；旧 `ECdison6227/vivic` / `agent/next-iteration` 只作历史记录。用户说“提交 PR”即授权提交本轮改动、推送任务分支到当前 `origin`，向 `ECdison6227/vivic-canvas:main` 创建 PR，无需重复确认。操作前核对实际 remote；不得按旧文档改写远端。标题和说明必须对应本轮实际修改，并写明验证结果；完成后返回 PR 链接。只创建，不合并、不启用自动合并。每轮修改使用对应的 PR，必要时新建独立分支，避免混入此前 PR 的改动。

按改动运行相应检查；前端 `pnpm --filter @vivic/web test`，后端 `pnpm --filter @vivic/local-api test`，全量 `pnpm test`，类型 `pnpm typecheck`，构建 `pnpm build`。浏览器测试使用 5174/8788，串行运行不同 Playwright 命令，避免占用用户的 5173/8787。
