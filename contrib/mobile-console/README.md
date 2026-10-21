# Vivic 手机控制台（MOB-01）

关联 [Issue #12](https://github.com/ECdison6227/vivic-canvas/issues/12)，当前为独立可运行模块。手机 UI 使用真实 WebSocket client；电脑正式 owner 的生命周期/文字请求接线仍待核定。DEMO 电脑不是用户画布，不能把本模块测试称作真实手机远程控制已交付。

同局域网首版也需要互联网、中继在线及电脑运行 Vivic。手机刷新需重新配对；同一页面断网可用内存凭据重连。未实现局域网自动直连、全量云存储、原生 App 或语音。

## 安装与检查（仓库根目录）

```powershell
pnpm --dir contrib/mobile-console install --ignore-workspace --frozen-lockfile
pnpm --dir contrib/mobile-console test
pnpm --dir contrib/mobile-console typecheck
pnpm --filter @vivic/web test
pnpm typecheck
pnpm build
pnpm --filter @vivic/web exec vite build --config src/control/mobile/vite.mobile.config.ts
```

独立安装使用本目录的 `pnpm-lock.yaml`，不改根依赖/CI。`dist-ui/` 是独立 UI 构建输出，不把中继 secret 烘焙进前端。Node 22+；本轮实测 Windows / Node 24。

新增运行依赖为 `ws`（MIT）与 `zod`（MIT），准确解析版本固定在本目录锁文件。其余 UI 依赖复用现有项目批准的组件；开发工具只在本模块声明。

## 启动独立中继

在专用 PowerShell 终端，通过运维安全方式将随机、专用的 `VIVIC_RELAY_ADMISSION_SECRET` 注入进程环境（32–256 字符）；不要复用模型/本地 API Key，不把具体值写进命令、脚本、文档或 Git。其他非秘密配置：

```powershell
$env:VIVIC_RELAY_ORIGINS='http://127.0.0.1:5174,http://localhost:5174'
$env:VIVIC_RELAY_HOST='127.0.0.1'
$env:VIVIC_RELAY_PORT='8791'
pnpm --dir contrib/mobile-console relay
```

进程只输出端口/模式，不打印配对码或请求正文。`GET /healthz` 返回服务身份，WS 路径是 `/relay`；本地开发 URL 为 `ws://127.0.0.1:8791/relay`。非 loopback 的明文 WS 被客户端拒绝。生产部署参考 [deploy/README.md](deploy/README.md)，只提供说明，不自动部署。

## 手机 UI 与电脑 DEMO

```powershell
pnpm --filter @vivic/web exec vite --config src/control/mobile/vite.mobile.config.ts
```

占用 5174 时不要终止他人进程；先确认服务身份。若现有服务器确实是本仓库主 Vite，可直接访问 `http://127.0.0.1:5174/src/control/mobile/index.html`（手机界面）与同目录 `computer.html`（电脑 DEMO）。独立服务器对应 `/` 与 `/computer.html`。

电脑 DEMO 输入专用 admission secret，仅保存在当前内存，连接真实中继后才显示短时配对码；手机输入该码。DEMO 的文字执行、画布和卡片只是明确标注的内存测试数据，既不调用模型，也不连接用户 IndexedDB/Display。要让真实手机访问，需由维护者配置可信 HTTPS/WSS 环境；`127.0.0.1` 只用于本机开发，不能让手机访问电脑。

## 独立浏览器验证

```powershell
pnpm --filter @vivic/web exec playwright test --config src/control/mobile/playwright.mobile.config.ts
```

使用 5174、串行运行、独立 browser context、静音；不需要本地 API，不采集麦克风。已有测试进程/浏览器之间不要并发运行不同 Playwright 命令。可设置 `VIVIC_E2E_CHROMIUM` 指向已安装 Edge；否则使用 Playwright Chromium。截图在被忽略的 `evidence/mobile-console/`，关闭 trace/video，配对码不进入截图。

这组测试验证真实本机 WS 中继 + DEMO adapter 和手机尺寸浏览器；不是实体手机/移动网络/锁屏/真实键盘验证。真实 owner 的固定卡片、保存和 Display 同步另由 `apps/web/src/control/mobile/__tests__/vivicHostAdapter.test.ts` 在内存 DB 上验证，也不是实体双设备证明。

## 文件和接线

| 文件 | 职责 |
| --- | --- |
| `protocol.ts` | 严格运行时 Schema、权限和消息 |
| `transport.ts` | 可替换传输接口、WSS 边界 |
| `client.ts` | 手机状态机、内存凭据、查询/取消/结果 |
| `connector.ts` | 电脑会话、权限、串行执行和去重 |
| `vivicHostAdapter.ts` | 注入既有 owner 接口，不创建 owner、不自动挂载 |
| `relay.ts` / `server.ts` | 独立鉴权中继与 CLI |
| `tests/` / `browser/` | 独立模块及真实 WS 浏览器测试，根 CI 不自动覆盖 |
| `../../apps/web/src/control/mobile/` | 独立手机 UI、电脑 DEMO、局部样式、构建/浏览器配置 |

connector 单次生命周期：stop/过期后新建实例与设备身份。已配对设备仅限三项白名单操作；文字 callback 必须遵守提交前 guard，并返回真实完成结果。512 条去重额度耗尽后结束旧会话再新建，不能清空旧记录后在同一会话重放。离线 stop 只证明本地不能执行，不能伪称已通知中继撤销。

精确待批准文件和消息流见 [最小接线方案](../../docs/design/mobile-console.md)，协议见 [传输决策](../../docs/decisions/mobile-control-transport.md)，实际检查与未测项见 [验证记录](../../docs/verification/mobile-console.md)。本轮不自动提交 PR、推送、合并或部署；部分交付仅使用 `Refs #12`。
