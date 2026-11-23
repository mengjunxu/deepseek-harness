---
schema_version: 1
task_id: dsh-p1-sdk-patch-identity
state: HANDOFF_READY
active_agent: null
branch: codely_bridge
---

前项已交接，Codex 单写。

部署补丁原地更改时，旧 Run 在启动前失败并释放租约。旧命令返回原回执，新 Run 使用更新后的部署，原 Session 的续接在补丁更换后被拒绝。旧格式归档可恢复原 Run 状态及回执。[本机验证](evidence/local.json)。仅核对显式顶层文件在入队和启动准备时的字节，未校验环境变量或插件依赖。无外部模型请求、提交或推送，未更改共享工作流和 Memory。已释放写入权。
