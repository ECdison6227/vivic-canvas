# Vivic Online 部署预览版

本版本供服务器部署，使用者直接打开浏览器，不需要安装本地启动器。当前支持用户自己的 StepFun Coding Plan Key；没有共享开发者 Key、套餐、计费或云端账号。决策专用 API 暂未配置，不影响已有规则与 StepFun 规划。本轮未发布到服务器。

## 产品流程

首次进入是“认识 Vivic → 连接在线服务 → 进入 Space”。示例明确标为演示；连接会实际验证推理，进入时可带一条草稿，由用户确认发送。没有 Key 可先体验基础文字功能。设置中的“新手引导”可重新打开；已有画布、owner 和配置草稿保留。

线上设置隐藏启动器、本地模型与Pi登录。连接组折叠项「手机连接」可生成当前会话的一次性二维码，手机入口 `/remote/` 只有聊天与纵向Space，不创建新的owner，也不获取模型Key。电脑页需保持打开；失效会话和撤权会终止手机权限。外观与声音稍后设置；麦克风只在使用语音或点击授权时请求。UI 复用 library Hark `26ac2724` 的原字体、glyph、连续圆角、透明表面与冻结天空；三步引导是 Vivic 的产品流程，不声称来自 Hark 原版。

画布、外观及引导完成标记在当前浏览器保存。**尚无账户与跨浏览器云同步**；换浏览器不会自动得到原画布。模型 Key 不写入浏览器存储或服务器磁盘，只存在隔离会话的服务端内存；默认闲置30分钟或最长8小时到期，服务重启也需重新连接。断开即清除。退出在线会话接口为 `DELETE /api/online/session`。

## 本机验证运行

需要 Node 24.21.0、pnpm 12.11.2。先安装锁定依赖并构建在线专用产物：

```sh
pnpm install --frozen-lockfile
pnpm --filter @vivic/web build:online
```

Windows PowerShell：

```powershell
$env:PORT='18794'
$env:VIVIC_ONLINE_ORIGIN='http://localhost:18794'
cd apps/local-api
node --import tsx src/online/index.ts
```

macOS / Linux：

```sh
cd apps/local-api
PORT=18794 VIVIC_ONLINE_ORIGIN=http://localhost:18794 node --import tsx src/online/index.ts
```

访问 `http://localhost:18794`。这里演练的是在线服务器入口；没有运行本地模型。非 loopback 的生产 Origin 必须是 HTTPS。后端默认只监听127.0.0.1；线上入口不加载本地 `.env`、Pi授权、偏好或手机中继文件。不得将本地 `src/index.ts` 当作多人线上服务器。

## Linux 容器部署

镜像默认安装已固定版本的 **Lark CLI 1.0.97 与 WeCom CLI 1.3.4**（Linux amd64/arm64）。安装器使用官方发行档案，核对仓库内固定 SHA256/SHA512，只提取审阅的原生二进制，并在干净环境执行 `--version`；缺库、错误架构、摘要或版本不符会让构建失败。无需 npm 全局包布局或宿主登录。飞书/McDonald/钉钉远程 MCP 不需要额外 CLI。

固定运行路径为 `/opt/vivic/connectors/lark/1.0.97/lark-cli` 与 `/opt/vivic/connectors/wecom/1.3.4/wecom-cli`，通过 `VIVIC_LARK_CLI_PATH` / `VIVIC_WECOM_CLI_PATH` 指定。运行时每次查询仍使用临时独立配置目录和用户会话授权；容器只读根文件系统、`/tmp` tmpfs 与非 root 用户兼容。

若部署者只需要远程 MCP，可设置 `VIVIC_CONNECTOR_CLIS=0` 再构建；此时企微 CLI 和飞书 CLI 模式会明确显示主机未安装，不视为已启用。普通 Linux 主机也可运行 `node deploy/online/install-connector-clis.mjs --dest /opt/vivic/connectors`，然后设置上述两个绝对路径。安装器需要 Node 24、tar、系统 CA；两种架构的已锁定原生档案均检查为静态 ELF，无动态加载器依赖，变成动态二进制时会拒绝安装等待复核。Docker 基础镜像为 Debian bookworm-slim，安装步骤只增加 CA 与 tar。非 Linux 本地安装包使用服务主机已安装的官方原生 CLI，或同名两个环境变量指定审核后的原生路径；不附带或读取个人登录。二进制 MIT 版权声明随部署目录及镜像保留。

此轮已核对平台档案摘要/ELF 架构以及现有 Windows 两个官方 CLI 的隔离版本运行。新增 Docker 安装层需要下一次目标 Linux 构建验收，不能沿用旧镜像验收报告宣称已通过。

部署包包含源码、锁文件和已构建的网页。没有携带 Windows 的 node_modules；Linux 镜像会在本机架构安装 sharp/esbuild 等依赖。[官方 Node 镜像](https://hub.docker.com/_/node)固定到24.21.0 bookworm-slim及manifest SHA256。本轮已使用目标Linux现有Docker实际构建和启动，并通过隔离TLS反代、会话隔离、流式响应、手机长轮询及非root原生sharp检查。具体archive SHA与证据见 [服务器验收](verification/online-server-20261023.md)；测试只绑定回环端口，没有替换原公开站点。临时私有测试CA的TLS验证不等同正式域名已发布。

在包根目录执行，替换为自己的专用域名：

```sh
export VIVIC_ONLINE_ORIGIN=https://vivic.example.com
docker compose -f deploy/online/compose.yaml config
docker compose -f deploy/online/compose.yaml up --build -d
```

使用[Compose环境变量插值](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)要求显式Origin。容器内部监听0.0.0.0，但宿主只映射127.0.0.1:8790；由现有反向代理终止TLS。当前使用域名根路径 `/`，不支持直接挂在 `/vivic/` 子路径；不要挤占已有网站根路由。

Nginx 的已配置HTTPS虚拟主机可使用以下 location，不包含证书、域名或任何模型Key：

```nginx
location / {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 150s;
    client_max_body_size 9m;
}
```

代理应保留Cookie、Origin、Sec-Fetch-*和流式响应，不记录请求体、Authorization、Cookie或完整查询数据。接口严格同源；浏览器直接发Bearer会拒绝，无法绕过会话。健康检查 `/healthz` 返回 `vivic-online-api`；前端启动前还会核对专用 `.vivic-online-build.json`，避免误用本地版网页。

每会话独立应用、凭据及provider状态；限流、会话数量、并发、请求体、响应体和超时有界。单进程内存会话暂不支持多副本随机转发；扩大部署前应增加共享会话基础设施。上游网络/IP定位不会把服务器位置当用户所在地，缺少真实设备坐标时询问城市或定位。

## 交付与停止

`pnpm package:online` 生成 `.cache/vivic-online-<时间>.tar.gz`、SHA256及源包目录。该包不含个人数据、模型权重或服务器凭据；正式运行后的目录不可直接重新分发。Linux与隔离TLS的实际验收见上述记录；正式公网域名发布以及真实Key的LLM/ASR/TTS权限和延迟仍需单独验收。ASR/TTS验证与LLM连接成功分开计算，不因Plan模型响应就保证语音权限。

本机预览用 Ctrl+C 停止；容器用 `docker compose -f deploy/online/compose.yaml down`。停止会丢弃服务端会话凭据，保留浏览器画布。
