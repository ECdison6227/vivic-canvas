# MOB-01 验证与交付边界

更新：2026-10-22，Asia/Shanghai。Refs #12；PR #14 保持 Draft，**不满足关闭 Issue 的 A/B/C 全部验收条件**。

## 维护者反馈与修订

[维护者 review](https://github.com/ECdison6227/vivic-canvas/pull/14#pullrequestreview-5601783741) 要求本轮不合并，暂停手机控制台及公网中继产品集成。后续须先用 Issue 明确目标、权限与验收，不进入 PLAT-01/02 或旅游卡片主线。本次仅修复 workspace 安装边界、代理后的限流身份和验证记录。

原文档的 Web 584/584 与全根检查结果来自个人开发工作区，不能作为本 PR head 的验证证据，现撤回。历史本机实测证据保留，不删除，但不用于替代本次干净 clone 验证。

## 旧 PR head 干净复现

旧 head：`9ea2496eb6cafe0b2e945a4e8ce905abe35ea83f`。从 Git 创建独立 clone，不复制任何 node_modules、不单独安装 contrib。Windows，Node 24.14.0，pnpm 12.11.2（根 packageManager 指定版本）。

| 命令 | 实际结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，4 workspace，757 包 |
| `pnpm typecheck` | 失败；contrib `protocol.ts` 无法解析 zod，并引发隐式 any |
| `pnpm --filter @vivic/web test` | 58 文件：57 通过，1 个加载失败；524 项通过；`MobileConsole.test.tsx` 因缺 zod 未收集测试 |

本地日志保留在被忽略的 `evidence/mobile-console-feedback-20261022/baseline/`。验证后 tracked 工作区干净，contrib 无 node_modules。

## 修订后的验证

修订采用维护者允许的正式 workspace 方案：Web 声明包依赖，通过显式 exports 引用原型；根锁文件包含 contrib 的全部依赖，删除重复的嵌套锁文件。根 test/typecheck/build 命令包含原型对应检查，真实浏览器回归另行串行执行。没有放宽断言、删除或跳过原有测试。

修订提交的干净 clone 检查结果将在本节记录。验证从根锁定安装开始，不使用个人工作区或其他分支的结果。

## 证明范围与未完成项

| 部分 | 原型覆盖 | 未完成 |
| --- | --- | --- |
| 手机 UI/协议 | 配对、设备/画布、文字、固定卡片、设置/12 配色、取消/查询/撤销；严格 Schema | 实体手机系统键盘、安全区、触控 |
| 中继/connector | 本机真实 WebSocket、鉴权、单次码、权限/epoch/版本、心跳、去重、取消、恢复 | 公网 WSS/TLS 部署与真实异网 |
| 既有 owner adapter | 注入边界；内存 DB 上 ControlHost/DisplayClient 的固定、保存、切换、提交前 guard | 产品入口与生命周期未挂载；真实模型和生产保存失败回执 |
| 电脑 DEMO | 明确标注的内存画布与模拟文字执行器 | 正式 Vivic owner → 保存 → Display → 手机结果闭环 |

浏览器回归使用独立 context、静音、关闭 trace/video，不采集物理麦克风、不触碰个人画布。缩小 viewport 只能证明模拟键盘高度下的布局，两个 context 不能证明两台实体设备。代理头测试仅模拟 Node 的可信上游，不代表实际 nginx/TLS 配置已运行；同一 NAT 公网 IP 仍共享鉴权计数。

本次没有修改 App/ControlApp/owner/持久化/API/全局 CSS 或 CI 工作流，没有部署或合并。正式接线方向暂停；后续须按维护者的新 Issue 范围重新确认。不能使用 `Closes #12`。
