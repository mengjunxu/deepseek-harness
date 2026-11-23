---
schema_version: 1
task_id: dsh-p1-package-recovery-acceptance
state: HANDOFF_READY
active_agent: null
branch: codely_bridge
---

前序阶段结束。仅 Codex 写当前工作区，临时安装与数据位于测试目录。

正式产物在空目录安装通过；备份双次恢复、前序恢复位置、交付检查、人工验收和 OpenAI 测试端点重试通过。工作台 Web 整组 27 项、Host 29 项均通过。[安装结果与包集指纹](evidence/local.json)。生成目录已同步。最终 doc-sync 为 37 通过、5 个既有失败：文档链接、示例类型检查、换行、仓库引用和双语配对。草稿 PR、远程节点、物理跨设备及 G2 仍待验。分支未推送；已释放写入权。
