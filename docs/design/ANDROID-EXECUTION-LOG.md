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

## 2026-10-31 · 用户授权持续完成

- 用户明确：优先StepFun，失败回退DeepSeek；增加手机与网页的DeepSeek Key支持；取消后续人工检查，持续做到软件完成。
- 原阶段等待与前端确认不再阻断。采用自动验证/修复与发布前备份、最新资源哈希核对，保护其他人的已有改动。详见 ANDROID-AUTONOMOUS-IMPLEMENTATION.md。
- 开始模型支持与P1–P6实现，不再停在检查点0。

## 持续实现进度（2026-10-31）

- 已实现DeepSeek固定官方端点、Key验证、StepFun优先/DeepSeek推理回退。取消或连接变更不回退；不重提任务。相关92项回归通过，后端typecheck通过；初次全量中2017通过，9项兼容性断言已修正实现后针对复验通过，后续还需全量。
- 网页新增独立`public/vivic-model-support.js`，复用当前设置样式，不存Key；流式响应Schema已加入DeepSeek。尚未部署。当前线上已是同事的`settings-copy-20261031-1`，与旧30日快照不同，部署必须重新取完整基线。
- 原生P1–P4首轮代码已写入：主题/原图标字体天空、真实玻璃、两页Pager、扫码/设备码/登录、加密Cookie、模型设置、聊天任务/取消/澄清、语音录制/播放、核心及声明式卡片、轻操作、更新下载/验签/安装、离线DemoBackend。尚未做实际设备验收，不能记为阶段完成。
- 当前Gradle构建任务`3516`在验证assembleDebug/lintDebug/testDebugUnitTest。上轮已成功assembleDebug，lint两个CameraX opt-in错误已改；新增五项JVM协议测试。OkHttp锁5.3.2、Haze1.6.10、Coil3.4.0以兼容SDK35。
- 网页浏览器：Ego CLI未注册，使用cua_repl的browser 2独立会话，`vivicTab`指向测试标签1872167001；隔离评测代理`node scripts/android-eval-proxy.mjs .cache/android-p0/credentials-private.json`运行于127.0.0.1:19446（exec session 76682）。Cookie仅在代理内存，浏览器无评测Cookie。
- 网页当前连接页DOM：`input[data-vivic-ai-key-input]`的closest(form)为`se-key-block`，父节点`se-connection`；DeepSeek模块在其后插入同样样式。
- 仍待：原生实际安装/交互QA、修复构建警告与边界；后端SSE/大屏遥控及回执；最新网页运行模块桥接/部署；真实模型与跨端E2E；签名覆盖/更新流程；截图录屏与最终APK下载发布。用户要求做到完成，不能因阶段或上下文结束而停工。
## 2026-10-31 · 原生交互、真实备用推理与发布候选

- Android Compose 仪器测试通过：演示入口、真实输入点击发送、待办勾选、删除与撤销、主题切换；5 张截图保存在 `docs/android/evidence/P1/native-qa`。JVM 5 项通过，debug assemble/lint 通过。仅操作独立 `emulator-5580`，未采集物理麦克风。
- 原签名发布候选 0.3.0/code20 已生成：ARM64+ARMv7 12,545,424 bytes；x86_64 QA 10,203,510 bytes。与原 0.2.0 的证书 SHA256 一致。手机包 SHA256 `18abe3aa7583b20f0d86c75b69a4d6a49dd57663b48b70d5fe9018c83e6794eb`。
- 新增可重复构建的 `apps/android-native/scripts/publish.ps1`，核对包名、版本、debug 标记、签名、旧证书及 15 MiB 手机包上限，输出更新清单。尚待公开发布和覆盖安装验收。
- 模型平台和扫码授权生产源码已分两轮取回合并；第二轮基线包含 `connection-qrcode-20261031-1`。后端完整回归 2030 通过、3 默认跳过，类型检查通过；本次设置和数据操作相关网页测试 9/9，通过源网页 typecheck 与 online build。
- 旧网页全量测试 783 通过、20 失败，集中于原有 onboarding、动态天空、唤醒、旧连接/预览断言，与本次增量前端不同。保留失败证据 `.cache/web-tests.json`，不据此声称全站测试全通过。
- 发现通用 provider 持久化默认会使独立 createApp 测试读写本机配置。现改为正式入口显式提供目录。仅本轮误建的测试配置已验证其 unit.test 来源并移入忽略缓存备份，未删除个人配置。
- 模型配置按账号加密保存；旧部署共享设置仅作为初始部署默认值迁移一次，此后的账号修改相互隔离。原有部署 StepFun 默认接入继续保留，DeepSeek 可通过网页或手机单独配置。
- 真实 StepFun 与 DeepSeek 连接均通过；DeepSeek 探针改为确定性 JSON。隔离服务注入 StepFun 503，实际 DeepSeek 推理约1283ms返回有效中文问候，响应标记 `usedProvider: deepseek`，没有任务重提。
- SSE 浏览器联调：大屏实际显示测试便笺；sleep/wake/focus 分别获得实际网页状态回执（约170/475/56ms）。补充原生读取接口，恢复 owner 的 user/display 投影，避免将用户页私有布局当展示布局。
- 网页发布以最新活跃资源为基线，138 个 JS 文件静态语法检查通过；保留扫码、登录、卡片上下文、波浪、时钟和息屏实现。发现最新登录注入缺失函数结束括号，候选中已做精确修复。待部署前再次核对哈希并使用部署锁与后端镜像 CAS。
- 所有候选文件精确私钥扫描无命中；`.cache`、服务器配置和 keystore 不进入 Git。当前仍有生产 E2E、扫码/持久化、更新安装与最终发布验证待完成，继续执行。

