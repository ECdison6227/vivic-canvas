# 待前端配合的交互

2026-10-30，按执行手册记录；本轮不修改、构建或覆盖线上前端。

1. NoteCard 的 bullets 与 NewsCard 的 keyPoints 条目高亮。目前后端仅支持 TodoCard 的单条高亮；其他要点请求应说明能力边界，不能假装已高亮。
2. 澄清候选列表支持点选。服务端 E3 将沿用任务候选编号协议；当前文字列表仍需用户回复编号。该项待 E0 批准后实施对应后端闭环。
3. 图片分析复用 NewsCard。仓库源码的 MediaImage/useMediaUrl 已支持 `media:image_<sha>` 和账号鉴权读取；当前线上打包页面尚待视觉验收。若页面不显示，应先核对 hosted media resolver；按手册必要时使用 PhotoCoverCard 作为临时兼容，不能改成无图便笺冒充完成。

前三项不会在产品里新增“编程制作卡片”入口。.vivicard 由用户本地 Codex/Claude 按后续指南制作后导入。
