# Vivic 仓库工作约定

先读 [README_FIRST.md](README_FIRST.md) 和 [当前交接](docs/AGENT_HANDOFF.md)，再按任务读取模块。原产品约束见 [完整规约](Vivic_Kimi_Handoff_v0.6/AGENTS.md)，不要根据旧阶段报告重复开发。

- 这是 Web 信息画布，Control/Display 双视图；Display 保持极简。2026-10-16 用户反馈更新：纯计时器只有数字；带事项的提醒显示事项与时间，未固定提醒合并呈现，到时后退出画布、记录留在 Control。2026-10-17 起 Control 分为用户页 `/`（只有设置按钮、头像、对话和文字/语音输入）与设置页 `/control`，二者是同一个 owner 窗口，见 [用户页](docs/user-page-20261017.md)。
- 保留已批准的 SmoothUI Orb、Assistant UI styled registry、React Flow、Motion、Radix/shadcn、Lucide、Recharts；不要自行重画替代。背景按用户 2026-10-17 提供的 HTML 改为「流光以太」（`components/atmosphere/`），三页共用；用户只能换 6 深 + 6 浅配色，不开放动画形式选择。
- LLM 只接 StepFun Coding Plan、GPT/Pi OAuth。语音独立；Pi 只迁移认证/模型，不启用 coding tools、session、扩展或 skills，不开发新 OAuth 协议。
- 模型只生成校验后的 Action/数据，不能执行代码或虚构联网数据。图片仅用于当前明确发送的请求。
- 凭据不进入源码、文档、日志、浏览器存储或画布；`.env*`、`.cache/`、`evidence/` 默认不入 Git。不要删除本机验收证据。
- 当前自动化测试静音，TTS 保持关闭，不采集物理麦克风；实际播放需用户后续明确允许。浏览器测试使用独立 context，不碰用户真实画布。
- 自动排版须避开固定卡片；关注长文本、内容增长、撤销和旧画布恢复。两张均固定时不能擅自移动坐标。
- 在当前开发分支继续，小步提交；不要重置/覆盖已有工作。未收到用户“提交 PR”等明确指令时，不自动推送、合并或发布。基线/分支约定见 [Git 工作方式](docs/GIT_WORKFLOW.md)。
- 用户说“提交 PR”即授权提交本轮改动、推送到用户的 fork（`origin`），向 `ECdison6227/vivic` 的 `agent/next-iteration` 分支创建 PR，无需重复确认。标题和说明必须对应本轮实际修改，并写明验证结果；完成后返回 PR 链接。只创建，不合并、不启用自动合并。每轮修改使用对应的 PR，必要时新建独立分支，避免混入此前 PR 的改动。

按改动运行相应检查；前端 `pnpm --filter @vivic/web test`，后端 `pnpm --filter @vivic/local-api test`，全量 `pnpm test`，类型 `pnpm typecheck`，构建 `pnpm build`。浏览器测试使用 5174/8788，串行运行不同 Playwright 命令，避免占用用户的 5173/8787。
