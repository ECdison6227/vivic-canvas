# MOB-01 验证与交付边界

2026-10-21，Windows，Node 24.14.0，pnpm 11.25.0，隔离 Edge 浏览器，亚洲/上海。Refs #12；**不满足关闭 Issue 的 A/B/C 全部验收条件**。

## 本轮结果

| 部分 | 已实现/验证 | 仍待完成 |
| --- | --- | --- |
| A 手机 UI 与协议 | 独立手机入口、设置/12 配色、配对、设备/画布、文字、固定卡片、取消/查询/撤销；严格 Schema 与 transport 边界 | 实体手机系统键盘/安全区/触控现场确认 |
| B 独立中继与电脑 connector | 本机真实 WebSocket、独立鉴权、一次性码、权限/epoch/版本、心跳、去重、取消、撤销和恢复状态；可操作电脑 DEMO | 程佳锐批准共享接线；电脑正式文字入口和 connector 生命周期；可访问的可信 WSS 测试环境 |
| 既有 owner 适配 | 新增不自动挂载的注入 adapter；真实 ControlHost + 内存 DB + DisplayClient 测试固定卡片、保存、切换与提交前 guard | 正式产品设置/入口接入；生产保存失败与完成回执语义核定 |
| C 双设备 | 本机两个独立 browser context 与真实中继可复现 DEMO | 真手机同局域网、移动网络/异网、真实锁屏/休眠/电脑重启与正式 Display 全闭环 |

没有修改共享 App/ControlApp/owner/持久化/API/全局 CSS、根依赖/锁文件或 CI。原目录已有 DEC/语音/落地页等工作保留；本项不混入这些成果。没有推送、创建 PR、合并、部署或购买资源。

## 实际检查

| 命令（仓库根目录） | 结果与证明范围 |
| --- | --- |
| `pnpm --dir contrib/mobile-console test` | 36/36，包含真实本机 WS 中继测试与 connector/client 状态机测试；contrib 需单独执行 |
| `pnpm --dir contrib/mobile-console typecheck` | 通过，独立协议/中继/adapter |
| `pnpm --filter @vivic/web test` | 66 文件、584/584 通过，其中本项 UI 5 项，真实现有 owner adapter 4 项 |
| `pnpm typecheck` | contracts、local-api、web 全部通过 |
| `pnpm build` | 通过；既有桌面生产构建，独立手机入口没有自动挂载到产品 |
| `pnpm --filter @vivic/web exec vite build --config src/control/mobile/vite.mobile.config.ts` | 独立手机 + 电脑 DEMO 双入口构建通过，输出 `contrib/mobile-console/dist-ui/` |
| `pnpm --filter @vivic/web exec playwright test --config src/control/mobile/playwright.mobile.config.ts` | 4/4，静音 Edge、5174、独立 context，本机真实 WS + 明示 DEMO 的执行器 |

本轮未改本地 API 生产文件，因此未重复运行其完整测试；已运行全工作区类型检查。既有根构建仍有语音 wasm 运行时路径、浏览器 externalization 和大 chunk 提示，构建退出码为 0；本项不通过关闭告警/跳过测试制造通过，也不把构建通过当作语音运行验收。

浏览器四项覆盖：

1. 360/390/430 宽度、浅色设置、横屏、错误态、无页面横向溢出；无 local/sessionStorage 凭据、无手机 `vivic` IndexedDB。
2. 真实本机中继 + DEMO 电脑：配对、文字、卡片固定、画布切换、owner 不可用/恢复、手机撤销。
3. 执行中取消先显示未知，执行器提交前 guard 阻止写入；刷新清空内存凭据，新码重新配对。
4. 可操作电脑 DEMO 页 + 独立手机 browser context：真实配对、文字显示、卡片固定、电脑停止使手机失效；截图前清空输入并消费配对码。

手机软键盘检查使用缩小 visual viewport/窗口高度模拟，不能证明物理输入法、iOS Safari、安全区或锁屏行为。两个 context 也不是两台实体设备。实际远程 owner 和模型没有通过 DEMO 替身冒充验收。

## 修复与安全回归

独立模块审查/测试发现并修复：owner.status 与 snapshot.request 的反馈循环、迟到 ACK/执行状态覆盖终态、结果查询失败误判未执行并允许重复重试、失效 token 无限重连、owner 撤销等待网络回执的提交竞态、跨会话迟到结果范围、停止后旧 connector 复用、已消费配对码继续展示。

最终用例保留：重复 ID/内容冲突、过期版本/owner、跨设备/跨画布查询、超限、已撤销 token/旧 socket、无权限角色、过期/单次码、取消提交边界、未知结果禁止重放、snapshot sequence 和 WSS/Origin 边界。开发公网代理头测试是模拟，未验证真实证书/TLS 链路。停止离线 connector 只证明电脑不会再执行，不能声称中继收到了撤销。

## 本机证据与复现

截图保留在被忽略的 `evidence/mobile-console/`，不含配对码/接入凭据：

- `pair-dark-360.png`、`pair-dark-390.png`、`pair-dark-430.png`
- `settings-light-430.png`、`pair-light-landscape.png`、`pair-error-light.png`
- `connected-demo-390.png`、`connected-demo-keyboard-height.png`
- `owner-offline-demo.png`、`unknown-demo.png`、`computer-demo-after-pairing.png`

已实际查看手机配对、连接、浅色设置、缩小视口和横屏截图，无发现有意义的裁切/横向溢出缺陷；内容在滚动容器内可继续向下查看。配对界面较长时允许纵向滚动。未采集麦克风、未播放音频，浏览器 trace/video 关闭。完整复现命令、运维要求、TLS 边界、回退在 `contrib/mobile-console/README.md` 和 `deploy/`。

## 继续集成所需的具体输入

1. 按 [接线方案](../design/mobile-console.md)，由程佳锐在工单/PR 确认：`App.tsx`、`ControlApp.tsx`、新增 `sync/remoteControlBridge.ts` 的准确范围；当前没有该确认。
2. 批准后复用现有文字执行链，返回真实执行结果，并确定异步保存失败的展示/回执语义；不能直接将 void 提交 callback 视为成功。
   现有查询占位会推进版本；正式接线需采用已提案的无占位单次提交或批准请求自身版本推进规则，不能直接取消 guard。
3. 维护者提供可信 HTTPS/WSS 测试环境，再用实体手机同网/移动网络各执行一次正式电脑画布 → owner 保存 → Display → 手机结果闭环，记录真实设备/浏览器/网络。当前没有该环境和实体设备证据。

只有以上接线与真实验收完成后，才能使用 `Closes #12`。本轮交付不是最终手机远程控制上线。
