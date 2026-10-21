# RUN-01 本地启动器验证记录

日期：2026-10-21  
基线：`ea9fbe8`（`vivic-canvas/main`）  
范围：`contrib/local-connector/` 独立原型与协议文档。

## 已验证

在 Windows 开发机使用 Python 标准库测试：

```powershell
py -3 -m unittest discover -s contrib/local-connector -p "test_*.py" -v
```

测试覆盖：

1. `/healthz` 无凭据可用，而能力端点拒绝无 token 请求；能力返回 loopback、session-owned 和操作列表。
2. 未启动时 `decide` 返回 `503/OFFLINE`，并明确 `textPathAvailable: true`。
3. 启动真实 `mock_provider.py` 子进程，重复启动返回 `ALREADY_RUNNING`。
4. 决策请求返回 `runId`，取消变为 `canceled`；重连重新拉起同一受管服务，之后请求可完成。
5. 配置的 provider 端口被其他 socket 占用时返回 `PORT_OCCUPIED`，不杀占用者。
6. 未配置模型源时只展示目录信息，下载返回 `MODEL_SOURCE_UNCONFIGURED`，不会默认下载。

## 结果边界

- `mock_provider.py` 是本地真实子进程 fixture，证明的是启动器协议/生命周期，不代表某个具体模型的准确率或联网能力。
- 本轮未启用真实模型权重、真实 API key、物理麦克风、音频播放或公网监听；这些属于后续适配/授权工作。
- 当前设备记录为 Windows 开发机；macOS 只完成代码路径设计审查，尚无真实设备运行记录。Linux/CI 结果也不能替代两平台实测。
- 核心 Vivic `app.ts`、owner/持久化、共享契约和 `scripts/dev.mjs` 未修改。集成时由维护者把浏览器状态读取接到已有本地后端，并保留 `OFFLINE` 降级。

## 复现与手工观察

```powershell
py -3 contrib/local-connector/connector.py serve --port 8791
```

用启动输出的 token 请求 `GET /v1/health`、`GET /v1/capabilities`，再依次调用 `/v1/service/start`、`/v1/decide`、`/v1/runs/{id}`、`/v1/runs/{id}/cancel`、`/v1/service/reconnect` 与 `/v1/service/stop`。另一个程序占用 `--provider-port` 指定端口时，启动会给出结构化 `PORT_OCCUPIED`，不会清理其他进程。
