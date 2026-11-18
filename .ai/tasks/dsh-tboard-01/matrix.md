# TBOARD-01 接入验证

需求来自[专题第 10 节](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)及[主 PRD 第 9.4 节](../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md)。G0 接入基线冻结为 macOS 15.6.1 arm64、Node 26.5.0、本仓库 CLI 与 SDK 0.1.7-rc.2 加本地修改、sdk profile、deepseek-official 适配器和 deepseek-v4-pro 模型配置。实际请求发往本机确定性模型。模型调用问答需要在 profile 中加载问答工具；审批测例在临时目录配置 write 询问策略。SDK、脚本与结果按 [SHA-256 清单](evidence/g0-sha256.json)识别。

| 专题接入用例 | 本分支实测 |
| --- | --- |
| 创建真实 Session | [创建与初始目录](../dsh-tboard-00/evidence/sdk-result.json)和[恢复前首次输入](evidence/fork-resume.json)均取得真实回执。 |
| 同一任务两次执行 | [两个 Run 的 SQLite 记录](evidence/restart.json)关联同一 taskId、不同 runId、Session 和 runtime；每个显式输入只到达模型一次。 |
| 关闭后恢复 | [双实例恢复](evidence/fork-resume.json)在写锁占用时拒绝；原实例退出后恢复同一 Session，直到下次显式输入才请求模型，且带上先前历史。 |
| 审批允许、拒绝、取消 | [实际 write 调用](evidence/fork-approvals.json)仅在允许一次时写入测试文件。无效或关闭后迟到的答复也未产生写入。 |
| 用户问题响应 | [工具往返与撤销](evidence/fork-interactions.json)验证按问题 ID 回答，等待中关闭得到匹配原请求的撤销通知，迟到答复没有触发模型。 |
| 停止一个 runtime | [双实例停止](evidence/stop-tree.json)从正常 shutdown 回执、runtime 退出、真实 shell 子进程消失分别取证；另一实例的子进程存活至自身关闭。SDK 单元用例还覆盖观察超时后同一进程仍可应答。业务租约与用户选择强制停止归 TBOARD-04。 |
| 工作目录变化可追溯 | [两个真实 Git worktree](evidence/directory.json) 的工具输出、Session 创建目录与分支一致。新 Run 引用前序 Run/Session，材料按显式选择进入新 Session，原日志字节保持一致。[目录决策](directory.md)。 |
| 服务中断后不重复执行 | [中断脚本](evidence/restart.mjs)在真实 SDK 接纳输入、临时任务服务仍未提交回执时终止该服务。在两个新的服务进程中执行恢复，核对同一 Session 的唯一输入回执，追加模型调用为零。[结果](evidence/restart.json) |

复现时先在仓库根目录构建 Host 产物，然后用 Node 分别执行 evidence 下同名的六个 .mjs 脚本。每次使用独立的临时数据目录。restart.mjs 使用 Node SQLite 和本机 zstd 解码多帧 Session 日志。中断测例使用临时单写服务，仅覆盖上述故障窗口；正式存储、目录锁和运行服务分别归 TBOARD-02、04、03。用户选定的 Web 入口归 TBOARD-07。G0 八项接入用例已通过。备份采用代码目录与 runtime home 外的操作者指定本地目录；本次在停机后复制运行引用与 Session，在新的 home 中恢复了两个 Session，恢复过程中模型调用为零。正式业务库导出导入与真实工程验收归 G2。未配置 DEEPSEEK_API_KEY，外部模型未实测；本表仅冻结上述本地接入组合。
