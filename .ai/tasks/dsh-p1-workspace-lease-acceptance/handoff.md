---
schema_version: 1
task_id: dsh-p1-workspace-lease-acceptance
state: HANDOFF_READY
active_agent: null
branch: codely_bridge
---

前项已交接。当前为本地单一写入者，保留原工作树。下一步受控验证别名排队。

真实 SDK 场景中四个 Run 各自保留 Session。先排队的子目录别名等原工作树释放，后排队的独立工作树可启动；独立 SDK 停止后原 SDK 继续运行。子目录仅收到一次输入。Web 4 项与 Host 4 项通过；权限失败、停止超时和基线及目录复核覆盖 AC12/15/18/19。主计划 P1-09 的范围为首发本机工作台。无共享流程或 Memory 调整，已释放写入权。[本机验证](evidence/local.json)。
