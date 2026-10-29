# 当前线上前端的完整恢复备份

用户于 2026-10-29 要求服务器只保留最新版，并把最新版备份到 GitHub。后端源码与执行工具在当前分支；此目录补充最新版完整网页恢复包，弥补早先仅保存源码与增量补丁的不足。

- 当前页面版本：`unified-background-20261029-1`。
- 恢复包：`frontend-unified-background-20261029-1.zip`，24,114,830 字节。
- SHA256：`e42713d3eb58f86023028618aa0ec6cf453fb014200747a74bc283474ebc6690`。
- 包含全部 1,645 个文件，以及目录、文件权限、路径和校验哈希；重复内容只存一份，共 405 个内容对象。
- 包含当前 `web/`、nginx 前端头配置及发布说明。数据库、环境变量和密钥不在这个公开网页备份内。
- 对应后端运行源码：Git `ff981e1ee401c5d3b4e6554d3f40366d64fc4179`，后续开发提交继续保留历史。

## 校验与恢复

使用 Python 3.9 或更新版本，无第三方依赖：

```sh
python deploy/online-snapshot/snapshot.py verify deploy/online-snapshot/frontend-unified-background-20261029-1.zip
python deploy/online-snapshot/snapshot.py restore deploy/online-snapshot/frontend-unified-background-20261029-1.zip /tmp/vivic-restored-release
python deploy/online-snapshot/snapshot.py verify deploy/online-snapshot/frontend-unified-background-20261029-1.zip --source /tmp/vivic-restored-release
```

恢复目标必须不存在，不会覆盖正在运行的网站。完整还原校验通过后，可以用恢复目录中的 `web/` 和 `frontend-headers.conf` 恢复部署。

本次在服务器临时目录执行完整还原，并逐文件重算哈希；本机下载后也验证了全部内容对象与整个 ZIP 的 SHA256。确认 GitHub 推送成功后，才清理旧发布目录。
