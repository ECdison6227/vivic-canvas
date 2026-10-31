# Vivic Android 执行日志

## 2026-10-31 · P0 · 检查点 0 待确认

- 接续 Claude 会话 `b8c95511-6822-46c3-8b03-f2ac45f1958d`，按已确认的 Android 执行计划开展 P0。
- 从 `dev/decision-layer` 的 `f6b169a` 建立独立 worktree `Desktop/vivic/vivic-android`、分支 `feat/android-native`。未修改原后端 worktree。
- 新增 `apps/android-native`：Kotlin / Compose、Gradle Wrapper / version catalog / dependency locks、包名 `app.vivic.remote`、0.3.0/code20、API26–35。P0 只含构建冒烟首屏，尚未制作 P1 视觉界面。
- 使用指定 evaluation 账号核验正常线上 API，没有更改服务器程序、配置、前端产物或发布下载。测试凭据仅在忽略目录 `.cache/android-p0`。
- 8 项核验：4 项通过，1 项发现契约与计划不同，3 项因模型未连接待补验。配对/认证、五分钟倒计时、待办勾选、阅读顺序核验完成。
- 重要差异：任务接口接受过期 expectedVersion；409 `request-id-conflict` 对应已有任务，不能统一换新 requestId 重发。原计划 §7.4 的通用 409 重试规则需要更正。
- 语音识别/合成均返回 503 `model-not-connected`；按标题引用任务因主模型未连接失败，不应标为已支持。未借用真实用户模型连接或凭据。
- 导出 3 份脱敏快照夹具（Countdown、Todo、混合 3 类型）。核对无账号、真实 Space ID、用户名、Cookie。
- 测试 Space 已恢复为空，新配对设备已退出；原有 evaluation 会话保持有效。
- Gradle Wrapper 构建 / lint、安装、截图及启动诊断见 [P0 报告](Android-P0-接口核验-20261031.md) 与 `docs/android/evidence/P0/`。
- 模拟器只安装/启动 `app.vivic.remote`；Today (`ai.today.android.app.cn`) 保留，未清数据、重启或重建模拟器。首屏显示异常慢，需要继续排查，不能认定性能达标。
- 当前停在检查点 0。用户确认后从 P1 开始；模型补验和启动性能问题继续跟踪。未进入 P1，也未部署线上。

## 2026-10-31 · P0 模型与语音补验

- 用户提供 DeepSeek、StepFun 等配置并允许使用现有服务器 TTS/ASR。仅保存本次所需配置到 `.cache/android-p0/model-private.json`，限制本机文件访问；未保存/使用其他无关账户凭据。
- DeepSeek 主密钥的模型列表及真实 JSON 推理通过；请求 `deepseek-v4-flash` 返回 `deepseek-flash`。当前线上任务后端尚无 DeepSeek 提供方入口，本轮未部署适配；evaluation 任务补验使用用户给出的 StepFun `step-3.7-flash`。
- 候选语音 Key 返回401；经既有管理入口创建仅有tts/asr权限的独立验证 Key，值仅存私有缓存。没有修改网关代码、生产环境或发布产物。
- 真实TTS→AAC/MPEG_4 16kHz单声道64kbps→ASR通过，原文“请帮我设置五分钟的倒计时。”完整识别；另验分段base64 WAV、时长和nonSilent字段。自动化静音，未采集物理麦克风。
- 首轮样本被PowerShell默认ASCII管道损坏，原证据保留并标注无效内容验收。改UTF-8后增加预期短语断言，重新通过。没有将HTTP200当作内容准确率。
- 引用复测：初轮澄清，补充正文后任务succeeded却新增一张卡，原卡未改，判fail。按计划§7.4暂不启用引用发送，需明确目标引用契约后补验。
- 最新8项：6通过、1契约差异、1失败；测试Space恢复为空，新配对设备退出。模型连接保留于evaluation账号短期内存会话。
- R8优化包构建通过；本机debug签名仅供启动对照。启动从debug约45.9秒降至release10.849秒，强制ART编译后9.990秒，仍未达1.2秒。发现宿主内存压力及模拟器其他进程CPU占用，未停止其他应用或增加模拟器。
- 报告：[P0模型补验](Android-P0-模型补验-20261031.md)。当前仍在检查点0，P1尚未开始。
