# 本地启动器协议（RUN-01）

版本：`0.1`。启动器是本机 Web 应用与一个**由本会话启动的决策子进程**之间的最小桥接层。它不是 MCP server，也不把 localhost 端口或模型 API 称为 MCP。

## 传输与会话

- 启动器只绑定 `127.0.0.1`，使用 HTTP/1.1 JSON；不监听公网，不发送 CORS 头。
- 启动时创建随机 `sessionId` 和一次性 bearer token。浏览器请求必须带 `Authorization: Bearer <token>`；token 只在本机启动终端输出，不能写入源码、日志、浏览器 storage 或画布。
- 每个启动器进程只有一个 owner session。服务管理只使用该进程保留的 `Popen` 句柄，不按进程名或端口杀进程，因此不会结束其他程序。
- `/healthz` 只返回无敏感信息的存活信号；其余 `/v1/*` 端点均需本地会话凭据。

## 端点

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/healthz` | 无凭据存活探针 |
| GET | `/v1/health` | 服务状态、异常和文字链路可用性 |
| GET | `/v1/capabilities` | 版本、loopback 传输、能力和操作列表 |
| POST | `/v1/service/start` | 启动一个受管决策服务；重复启动返回 `ALREADY_RUNNING` |
| POST | `/v1/service/stop` | 停止本会话启动的服务；未运行返回 `NOT_RUNNING` |
| POST | `/v1/service/reconnect` | 停止并重新启动本会话服务 |
| POST | `/v1/decide` | 提交文字，返回 `202` 与 `runId`；服务离线返回 `503/OFFLINE` |
| GET | `/v1/runs/{runId}` | 查询一次决策的 queued/running/completed/failed/canceled 状态 |
| POST | `/v1/runs/{runId}/cancel` | 取消仍在运行的请求 |
| GET | `/v1/models` | 返回模型名称、大小、受控显示路径和是否已下载 |
| POST | `/v1/models/download` | 用户显式选择模型后开始下载；不会默认下载 |
| GET | `/v1/downloads/{taskId}` | 查询下载进度 |
| POST | `/v1/downloads/{taskId}/cancel` | 取消下载并删除 `.part` 文件 |

错误统一为：

```json
{"error":{"code":"OFFLINE","message":"本地决策服务不可用；文字主链路可以继续使用 LLM","retryable":true,"textPathAvailable":true}}
```

已定义的主要错误码包括 `UNAUTHORIZED`、`PORT_OCCUPIED`、`ALREADY_RUNNING`、`NOT_RUNNING`、`PROVIDER_START_FAILED`、`PROVIDER_EXITED`、`OFFLINE`、`PROVIDER_UNAVAILABLE`、`RUN_NOT_FOUND`、`MODEL_SOURCE_UNCONFIGURED` 和 `DOWNLOAD_ALREADY_RUNNING`。

## 子进程协议

默认 fixture `mock_provider.py` 是真实启动的子进程，仅通过 stdin/stdout JSONL 通信：

```json
{"event":"ready","protocolVersion":"0.1"}
{"op":"decide","runId":"…","text":"显示全部"}
{"event":"result","runId":"…","result":{"action":"fit","source":"local-fixture"}}
{"op":"cancel","runId":"…"}
```

实际模型适配器只需实现这组 JSONL 消息，仍由启动器负责进程生命周期。启动器传给子进程的环境只有 `PATH`、`PYTHONIOENCODING` 和可选 provider 端口，不继承 API key/OAuth 等凭据。

## 与文字主链路的关系

决策服务未启动或已离线时，`/v1/decide` 返回 `503/OFFLINE` 和 `textPathAvailable: true`；宿主应继续原有文字/LLM 流程。当前原型未接入核心路由，也尚未实现 provider 启动/推理时限；超时终止和宿主降级须在真实服务集成前补齐并验收。
