# Vivic Android 0.3.0

原生 Kotlin / Compose 客户端，包名 `app.vivic.remote`，versionCode 20，Android 8.0+。

下载：<https://vivic.edsionc.top/downloads/android/Vivic-Remote-0.3.0.apk>

旧入口 <https://vivic.edsionc.top/downloads/Vivic-Remote.apk> 同步指向新版。更新清单为 <https://vivic.edsionc.top/downloads/android/latest.json>。

## 已交付

- 原生聊天与工作空间双页、横向切换、共享输入栏、明暗主题、相机扫码、设备码和账号登录。
- 任务进度、取消、澄清、连接恢复；待办、倒计时、便笺、天气和声明式卡片；固定、删除、撤销、结果预览。
- StepFun 优先，推理失败时使用 DeepSeek。仅切换推理，不重提任务或重放持久化命令。取消、账号切换或连接变更会使旧请求失效。
- 网页与手机均可配置 DeepSeek Key。账号配置通过服务端加密文件隔离，手机本地凭据使用 Android Keystore 加密；部署默认模型保留为初始模板。
- 服务器 ASR/TTS、原生录音和播放、提示音；按住说话与轻点听写。
- SSE 同步、大屏聚焦与熄屏/唤醒确认回执。兼容滚动发布期间的旧 owner 投影接口，不混用卡片内容与写入版本。
- 原签名覆盖升级、旧 WebView 登录迁移；更新下载、大小/哈希/包名/版本/签名验证及系统安装器。
- 离线演示模式。关于页连续点击版本七次进入，演示数据不会提交到服务器。

## 发布文件

手机包包含 ARM64 / ARMv7，12,545,424 bytes，SHA256：

`99bdaff2d56ffbe5ab2b954d4c5cab93ef1f5f09458b9377818298c659c9dc63`

签名证书 SHA256 与原 0.2.0 相同：

`0c7ebd410f2eafb5b42b3f0a39062225c5c62d041fc9df8d6c741841b3dd65aa`

x86_64 使用独立 QA 构建，公开手机包不包含模拟器 ABI。没有调试信任配置或测试 CA。

## 验证

- 后端最终集成回归：2030 通过，3 项默认外网诊断跳过；类型检查通过。
- 网页本次设置/数据操作相关测试 9 通过，类型检查和 online 构建通过；发布增量 138 个 JS 文件语法检查通过。
- 原生 JVM 5 项通过，debug/release 构建、R8、lint 通过。演示仪器测试完成聊天、待办、删除/撤销及主题流程。
- 4 项公网仪器测试分别通过：原生 HTTPS 与旧 Cookie 恢复、真实便笺任务及待办操作、大屏实际熄屏/唤醒与更新检查、真实 APK 下载的原签名验证及错误哈希拒绝。Live 测试必须显式传入 `-e live true`，并只使用专门的评估账号。
- 原 0.2.0 实际登录后覆盖安装 0.3.0，旧 Cookie 已迁移并通过原生 HTTPS 会话验证。独立 AVD 为 `emulator-5580`，没有操作共用的 Today 模拟器。
- 隔离服务注入 StepFun 503，真实 DeepSeek 推理约 1283ms 返回有效中文问候，标记实际 `usedProvider: deepseek`。
- 公网主/备用模型、语音、原生投影接口验证成功。公开 APK 实际下载后重新核对大小、SHA256 和原签名；旧下载别名与更新清单均已验证。
- 大屏在浏览器实际渲染测试卡片，并以实际 DOM 状态确认 sleep/wake/focus；并非仅凭 HTTP 请求发出而更新开关。

截图保存在 `docs/android/evidence/P6/native-qa/`；公开安装包是 release 构建，仪器测试 APK 和模拟器 ABI 没有公开作为手机包。

## 边界

- 物理手机的相机、麦克风、扬声器、触觉和各厂商安装器尚未实测。服务器真实 TTS → AAC → ASR 已验证，自动化未采集物理麦克风，也未开启主机音频播放。
- 独立模拟器冷启动观察约 0.9–3.1 秒；物理手机性能尚未量测。
- 原有网页全量测试另有 20 项旧断言失败，集中于 onboarding、动态天空、唤醒与旧连接/预览流程；本次未以旧源码整站覆盖线上前端，未声称全站测试全部通过。
- 按执行计划的 P0 门控，尚未通过目标引用契约验证的“引用后发送”保持关闭。不能原生表达的旧卡片提供可读降级，不执行来自卡片的代码。

## 后续发布

`apps/android-native/scripts/publish.ps1` 从环境变量读取原签名配置，生成 APK、清单和收据，拒绝 debug 包与超限手机包。`deploy/android/` 的发布脚本使用基线哈希、部署锁、备份、原签名与回滚检查。

线上存在并行开发发布。下一次后端发布必须先合并当前容器中的原生接口、账号隔离与模型回退；服务器留有 `backend/ANDROID_NATIVE_CONTRACT.json`。不要用旧任务分支全量覆盖活跃源码或前端资源。
