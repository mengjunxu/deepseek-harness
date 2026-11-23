# 工作台发布验收证据

所列测试使用本仓库的 DSH Web 和 TypeScript SDK 0.1.7-rc.2 构建，以及已登录的 macOS 15.6.1 arm64、Node 26.5.0 和本地 SQLite。基础自动化的 `deepseek-official` 请求使用确定性的本地模型服务。文末涵盖独立的真实 OpenAI 编码验收。端到端运行是否适用其他操作系统需单独验证。项目发布门槛为[专题 PRD](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。

| 条目 | 自动化证据 |
| --- | --- |
| AC01 | 已认证 Web 重启恢复项目、任务历史和原回执，Host 测试核对排序持久化。 |
| AC02 | 跨 Host 竞争和命令重放只保留一个有效 Run、输入和回执。 |
| AC03 | 修改需求后保留旧 Run 快照，旧验收失效。 |
| AC04 | 真实 SDK 接收模型端点拒绝后保存失败与 Session。显式重试创建新 Run、关联失败记录并使用新 Session。 |
| AC05 | 轮次结束而无交付时保持阻塞，完整交付仍需人工验收。 |
| AC06 | 未执行的检查保留原证据；无豁免时拒绝接受。 |
| AC07 | 人工退回后，正式 SDK 的下一 Run 输入携带反馈，旧交付仍可打开。 |
| AC08 | 任务版本或未提交代码变化后拒绝接受旧交付，活动目录占用也拒绝。 |
| AC09 | 使用原生 SDK 问题 ID 回答，撤销后拒绝迟到回复。 |
| AC10 | 允许一次、拒绝和取消分别核对外部文件效果。 |
| AC11 | 缺失 Session 和未来日志版本拒绝继续。还原兼容 Session 后可继续；也可在浏览器[显式选择新 Session 和材料](../dsh-p1-explicit-fresh-recovery/handoff.md)，历史回执保留。 |
| AC12 | 目标 SDK 根进程先退出，完整进程范围退出后记中断；独立 SDK 实例停止隔离见 [G0 矩阵](../dsh-tboard-01/matrix.md)。 |
| AC13 | 强制结束正式 Web Host；冷启动核对原锁和范围，原输入未重发。 |
| AC14 | Session 序号去重与不回退；SDK 通知断流时核对持久化回执和结束事件。 |
| AC15 | Host 检查绝对目录、别名、父子目录、占用和固定基线；不能制备隔离目录时无需发送输入。 |
| AC16 | 正式 Web 下载和上传备份；损坏、版本未知、重复 ID 或非空目标拒绝；无队列或交互重放。 |
| AC17 | SDK 接纳回执丢失和 SQLite 保存故障都以原命令和 Session 对账。 |
| AC18 | 原生强制结束超时后保留目录和租约；工具退出后复核并继续队列。 |
| AC19 | 禁用审批依赖的实际 SDK 握手失败，模型请求为零，Run 保留可见原因。 |
| AC20 | 分别保留未来格式和原日志字节；补回兼容 Session 后继续原会话。 |

自动化入口见 [Web 测试](../../../apps/web/tests/taskboard.e2e.ts)、[Host 测试](../../../packages/api/taskboard-controller/tests/taskboard.host.spec.ts)、[调度故障证据](../dsh-tboard-03/evidence/macos-dispatch-faults.json)和[重启及升级结果](../dsh-tboard-08/evidence/macos-g2-recovery.json)。

| 要求 | 已核验范围 |
| --- | --- |
| NFR01 | Run 详情显示连接、输入接纳、最近事件、退出结果和未确认停止的原因。 |
| NFR02 | [2,000 任务实测](performance.md)使用 16 核、64 GiB 主机。PRD 的 8 核、16 GiB 环境尚未测量。 |
| NFR03 | 工具接纳故障、SQLite 重启及人工验收记录在已执行用例中保持一致。 |
| NFR04 | 独占启动、冗余请求、已结束 Run 与冷启动对账均有回归。 |
| NFR05 | 发布补丁通过同一 Web profile 加载，默认仅回环。未认证请求无法导出，SDK 权限配置错误拒绝输入。 |
| NFR06 | 备份与项目交接不包含部署密钥、原始工具输出和 Session 文件。 |
| NFR07 | 校验后从版本化 JSON 备份原子恢复元数据，排队请求保留为已取消历史。 |
| NFR08 | 实测停止、强制停止超时及验收保留代码目录。工作台没有自动清理入口。 |
| NFR09 | [部署和升级说明](../../../packages/api/taskboard-controller/README.zh.md#upgrade-or-roll-back)提供兼容校验和独立恢复。此表是本地实测组合，未对发布包签名。 |

## 真实 OpenAI 编码验收

使用独立 Git 工作目录和 SQLite，通过实际 Web 界面与正式 SDK 完成三次 Run。首轮因临时 SDK 补丁引用缺失凭据而失败。恢复原配置后，gpt-5.4-mini 实现解析器、运行 Node 测试并提交交付。操作者退回后，新 Run 的 Session 持久化原反馈，模型补充示例并重新交付。再次验收前校验解析器和测试文件的 SHA-256 与第一版一致，核对三项 Node 测试和十二个独立用例。操作者接受第二版，重启 Host 后两版交付及两条决定仍可读取。

首轮试验中模型报告了实际测试文件缺少的非字符串检查。最终验收增加对具名测试、文件哈希和示例结果的独立检查。最终演示连续录自同一浏览器和 Web 实例，以 2.4 倍速播放，结尾保留 2.8 秒。[运行记录和本地演示指纹](evidence/macos-openai-coding.json)。

本轮交付确认 OpenAI 路线的真实编码闭环。发布矩阵仍待 PRD 参考机的性能复测，既有全仓文档检查结果见 [发布检查](evidence/macos-release-checks.json)。
