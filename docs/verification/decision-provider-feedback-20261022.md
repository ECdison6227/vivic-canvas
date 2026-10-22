# DEC-01：配置反馈与状态提示验收

日期：2026-10-22。基于 `9329f3383b76bbaf87d6a9d4d5accd70e1eec3a6`（PR #15 已合入），响应 [维护者反馈](https://github.com/ECdison6227/vivic-canvas/pull/15#issuecomment-6319357753)，关联 [Issue #7](https://github.com/ECdison6227/vivic-canvas/issues/7)。

## 本轮修改

维护者已修复非法配置导致 API 启动失败的问题。本轮补齐设置页：识别 `configurationError`，显示固定错误提示并禁用启用按钮，隐藏与该错误无关的 Kev 下载/清理入口。配置错误时，若旧服务实际仍处于启用状态，仍保留停用能力。

provider 状态现在区分服务故障、超时、判断不确定、判断已接纳和取消；“已接纳”只代表决策层结果，执行结果需查看对话。启用/停用等控制请求的非 2xx 响应显示固定错误，不读取或展示上游错误正文。后端、阈值、候选与原评测数据未改。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| 设置页定向回归 | 新增断言在修复前 8 失败、原有 4 通过；修复后 12/12 通过 |
| Web 全量单测 | 60 个文件，554/554 通过 |
| API 配置与 provider 定向回归 | 65/65 通过，含维护者新增的 5 项非法配置回归 |
| Web TypeScript | 通过 |
| Web Vite 构建 | 通过；仍有既有 native config/WASM、browser externalization 与 chunk 提示 |
| 补丁检查 | `git diff --check` 通过 |

复用现有依赖目录，没有将本轮检查描述为干净安装。两工作区 `pnpm-lock.yaml` SHA-256 均为 `73590b730ac5d39915ef3df93f5a38296cbfe699cec98da0dbc19ee5d708d435`。因依赖目录使用 junction，检查直接调用已安装工具：

```powershell
# apps/web
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
# apps/local-api
node node_modules/vitest/vitest.mjs run tests/decision-config.test.ts tests/decision-provider.test.ts tests/decision-provider-http.test.ts
```

## 真实浏览器与模型

使用独立 Edge 无头 context、Web `5174` / API `8788`，静音、TTS 关闭，无物理麦克风权限；未连接 StepFun/GPT 主规划模型、未触碰用户画布。按顺序检查：

| 场景 | 实际结果 |
| --- | --- |
| local-chat 配置缺少 MODEL | API 正常启动，日志仅记录固定事件；设置页显示“配置无效”，不出现 Kev 下载/清理按钮；真实“十分钟倒计时”请求仍返回规则 CountdownCard |
| 配置有效，但模型服务尚未启动 | “把便笺内容完整铺开”请求返回 `unknown/rules-offline`；状态 `lastState=error`，最近约 13 ms；设置页显示服务暂不可用与回退提示 |
| 启动真实 MiniCPM 后重试 | 先通过浏览器创建独立测试便笺，再发送同一句自然表达；状态变为 `lastState=deferred`，最近约 370 ms；旧错误清除，显示判断不确定或缺少评分，未自动展开便笺 |
| 点击停用，再重新启用 | 依次显示“未启用”与“已启用（服务状态待请求确认）”；按钮可用状态同步更新，启用未被描述为健康检查通过 |

切换配置时主动重启了隔离 API，浏览器日志有 **4 次预期的轮询 HTTP 502**：`/api/providers/status` 3 次、`/api/decision/status` 1 次；没有观察到 JavaScript 异常。不能将此记录表述为控制台零错误。

真实模型为 llama.cpp b9660 Vulkan + MiniCPM5-1B-Q8_0，端口 `8790`，启动参数含 `--reasoning off --reasoning-budget 0`。完整复现步骤见 [provider 配置说明](../decisions/decision-provider.md#配置与复现)。本轮重新核验文件 SHA-256：

- 模型：`0dc7638539067268774c275a14a6ec9c7e01f7eeb2cff606c8590361fa527e4c`
- llama-server.exe：`30181acd93201040b8d3ae36032015250ed3577c6270a60317e4b813f4f83a24`

以下截图直接来自上述浏览器过程，截取决策设置区域：

![配置错误保留原流程](decision-provider-feedback-preview/configuration-error.png)

![真实模型未启动时显示故障](decision-provider-feedback-preview/unavailable.png)

![模型恢复后显示不确定判断](decision-provider-feedback-preview/deferred-dark.png)

## 证据与限制

本机原始截图、页面快照与控制台日志保留在 `output/playwright/dec01-feedback-20261022/`，不提交整个目录。历史模型诊断仍保留在 `evidence/dec01-runtime-20261021-2119/`。本次测试的浏览器、API、Web 和模型进程均已关闭，隔离端口已释放。

本轮证实了配置容错的界面反馈、故障到恢复的状态更新及安全回退。当前 `local-chat` 只返回候选选择，没有可信候选评分，仍按 `deferred/missing_scores` 转交原流程；主规划模型未连接时返回 `unknown/rules-offline`。明确的“展开便笺/收起便笺”由已有前端规则处理，不属于新 provider 自动执行的证据。真实评分服务、远程 API 与模型执行质量仍未验收，也未重跑或改变 [冻结准确率基准](../decisions/decision-evaluation-20261021.md)。
