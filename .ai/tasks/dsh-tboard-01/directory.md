# 首版工作目录与会话历史

2026-11-16 用户确认：工作目录改变时创建新 Run 和新 Session，保留原 Run 与 Session，并记录前序引用。新输入快照只包含用户显式选择继承的材料及本次确认的输入；未选材料不进入新会话。原目录继续执行前核对工作目录与分支，恢复原 Session 后再发送已确认的输入。见[专题 FR08–FR09](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。

Session 创建目录是工具和提示词的目录来源。新 Session 让切换后的工具执行位置与实际工作目录一致，同时保留每段历史的目录归属。[现有目录约定](../../../.agents/notes/implemented/architecture/2026-07-25-web-client-session-scope-and-provide-channel.md)
