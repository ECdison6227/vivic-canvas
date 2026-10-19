# 文档目录

当前入口集中在下表。历史报告放在 [archive/](archive/README.md)，原始产品规格仍保留在 `Vivic_Kimi_Handoff_v0.6/`。

## 开发必读

| 文档 | 用途 |
| --- | --- |
| [根入口](../README_FIRST.md) | 新人/Agent 的阅读顺序 |
| [贡献指南](../CONTRIBUTING.md) | 安装、启动、GitHub Desktop |
| [当前交接](AGENT_HANDOFF.md) | 当前任务与运行边界 |
| [Git 约定](GIT_WORKFLOW.md) | 主仓库、fork、PR 与合入 |
| [团队任务边界](TEAM_TASKS.md) | 按核心依赖分工、接口和代码范围 |
| [实施现状](implementation-status.md) | 已有功能与未验证项 |
| [本地功能路线](LOCAL_ROADMAP.md) | 新功能顺序与可分配范围 |
| [本轮整理记录](REPOSITORY_CLEANUP.md) | 保留、删除、归档的理由 |

## 按模块查阅

| 模块 | 文档 |
| --- | --- |
| 用户页与背景 | [用户页](user-page-20261017.md) |
| 画布与内容交互 | [画布](canvas-interaction.md)、[子卡片与选择](interaction-details.md) |
| 卡片 | [20 场景](scene-cards-20261017.md)、[基础数据卡片](data-cards.md) |
| 模型 | [模型与语音职责](provider-voice-architecture.md)、[连接稳定性](llm-connection-stability-20261017.md) |
| 外部数据 | [数据适配](data-providers.md)、[搜索回退](search-fallback-20261016.md)、[图片输入](image-input.md) |
| 语音 | [本地语音](local-speech.md)、[反馈](voice-feedback.md)、[Plan TTS](stepfun-plan-tts.md)、[ASR](stepfun-asr.md) |
| 实验能力 | [决策模型](local-decision.md)、[评估](decision-model-review.md)、[评测包](decision-model-test-kit.md)、[Laya 记录](laya-poc.md) |
| 决策接入候选 | [JevHarness 初步适配](research/jev-harness-assessment.md)，对应路线 L04 |
| 官网 | [内测入口现状](website-beta-only.md)、[联系信息](website-contact.md)，当前由维护者保管 |
| 许可证与素材 | [项目许可证清单](../LICENSES.md)、[图片来源](images/README.md)、`third-party/` |

## 验证与历史

最新本机自动化事实见 [本地开发基线](verification/local-development-20261019.md)。`verification/` 的 JSON 摘要、原验收清单与历史报告均标记各自日期，不将它们合并成一次“全项目已验收”。

`research/`、PoC 文档、旧稳定性记录是按需查阅的研究资料。涉及历史框架/版本或功能行为时，优先查看当前源码和 [实施现状](implementation-status.md)。
