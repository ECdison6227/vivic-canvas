# Vivic：从这里继续

本项目已经有可运行的 MVP 主线，**不要重新开始 Phase 0 或重写已完成模块**。

当前入口为 **[Vivic 用户页](http://localhost:5175/)**（对话与文字/语音输入），左上角设置按钮进入 [设置页](http://localhost:5175/control)，Display 使用同端口；三页共用「流光以太」背景，见 [用户页与背景](docs/user-page-20261017.md)。5173 已由其他项目占用；Vivic 默认固定 5175，5174/8788 留给自动化。修正原因和实际页面/API 验证见 [入口修正](docs/entry-port-20261016.md)。不要仅凭 HTTP 200 判定服务身份，不停止其他项目来腾端口。

2026-10-16 使用反馈已转为 **Agent 直接实测与修复**，见 [本轮修复](docs/user-feedback-20261016.md) 和 [逐条实际输入](docs/USER_TEST_RESULTS_20261016.md)。普通对话/自然查询、澄清串题、连接状态、固定 Orb、提醒可见范围与到时提示均有更新；不再要求用户先重做整套第 0 组。二期仍未启动。

一期收尾历史见 [修复记录](docs/finalization-20261016.md)，[完整测试清单](docs/FINAL_ACCEPTANCE_CHECKLIST.md) 保留供查阅和现场验收；当前先收束使用反馈，再讨论 [二期候选](docs/PHASE2_CANDIDATES.md)。三项体验和新 GPT 授权已实现/验证，不能根据旧“下一 case”段落重复开发或要求再次登录。[审计](docs/project-audit-20261016.md) 保留修复前的事实。

1. 阅读 [下一位 Agent 交接](docs/AGENT_HANDOFF.md)：当前状态、运行方式、约束与建议顺序。
2. 阅读 [交付说明](docs/DELIVERY.md) 和 [用户测试清单](docs/MANUAL_TEST.md)。
3. 阅读 [实施现状](docs/implementation-status.md)，区分完成、实验、阻塞与暂缓项。
4. 遵守 [原开发规约](Vivic_Kimi_Handoff_v0.6/AGENTS.md)；产品依据为 [PRD](Vivic_Kimi_Handoff_v0.6/PRD.md) 与同目录架构、组件、契约及验收文档。
5. [原启动指令](Vivic_Kimi_Handoff_v0.6/KIMI_START_PROMPT.md) 保留为历史入口；其中阶段顺序不能覆盖本次交接的实际进度。

切换 Agent 不要求重启服务。开发后端重启会清空 StepFun 内存 Key；不要因此误判账号权限，也不要把 Key 写入文件。最新自动化测试保持静音，不采集物理麦克风。
