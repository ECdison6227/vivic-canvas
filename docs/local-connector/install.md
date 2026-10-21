# 本地启动器安装与运行

RUN-01 是独立原型，不要求 Electron、Tauri 或桌面客户端。需要 Python 3.10+，仅使用标准库。

## 启动

在仓库根目录执行：

```sh
python contrib/local-connector/connector.py serve --port 8791
```

启动器会在终端输出本次 session 的 JSON（包含一次性 token）。只把该 token 交给本机的同一 owner 页面；不要复制到 issue、日志、浏览器存储或仓库文件。默认决策服务是无网络的 `mock_provider.py`，用于验证真实子进程生命周期：

```sh
curl http://127.0.0.1:8791/healthz
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8791/v1/capabilities
curl -X POST -H "Authorization: Bearer <token>" http://127.0.0.1:8791/v1/service/start
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"text":"显示全部"}' http://127.0.0.1:8791/v1/decide
```

返回的 `runId` 用 `/v1/runs/{runId}` 查询，服务控制使用 `/v1/service/stop`、`/v1/service/reconnect`。退出终端时按 `Ctrl-C`，启动器只清理自己的子进程。

## 接入真实适配器

用 `--provider-command` 指定实现上述 JSONL 子进程协议的适配器：

```sh
python contrib/local-connector/connector.py serve --provider-command python path/to/provider.py
```

不要把 API key 放在命令行参数、仓库文件或浏览器中。真实适配器的凭据读取/安全存储应由受控本机后端单独设计；本原型不会把父进程环境变量全部传入子进程。

## 模型下载

`GET /v1/models` 只显示模型大小、受控相对路径和是否配置下载源。只有用户明确调用 `/v1/models/download` 才会复制模型文件，支持进度查询和取消；没有下载源时返回 `MODEL_SOURCE_UNCONFIGURED`，不会静默下载全部模型。

## 平台边界

- Windows 使用 `CREATE_NEW_PROCESS_GROUP`，停止时只终止保存的 `Popen` 进程句柄。
- macOS/Linux 使用独立 process group，停止时发送 `SIGTERM`，超时再对同一 PID `kill`。
- 本轮只在当前开发机运行标准库测试；Windows/macOS 的支持矩阵与真实设备记录见验证文档，不把 Linux/CI 结果冒充两平台通过。
