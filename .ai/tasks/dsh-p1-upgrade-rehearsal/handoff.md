---
schema_version: 1
task_id: dsh-p1-upgrade-rehearsal
state: HANDOFF_READY
active_agent: null
branch: codely_bridge
---

上一项已交接，Codex 单写。仅操作隔离构建与临时实例。

旧构建写入两版需求和三条活动。停机复制后，目标构建完整读取、重放旧写入回执，再写入第 3 版并重启验证。旧构建在另一份升级前副本上读回原记录；独立原库散列保持一致。[本机证据](evidence/local.json)。桌面周余 39%，重置于 11 月 24 日 17:34:52。无提交推送，本阶段释放写入权。
