---
schema_version: 1
task_id: dsh-p1-business-backup
title: "P1-02 业务备份与 Session 引用"
status: DONE
priority: P1
---

验证恢复后的任务继续使用原 Session，并在第二次独立恢复后保留两个 Run 的输入回执及交付验收历史。范围为主计划 P1-02 的本地 Web/SDK/SQLite 路径。

本地验收通过。[实测证据](evidence/macos-restore.json)记录 Host、原 Session 和两次空库恢复的结果。
