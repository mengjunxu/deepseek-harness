# 步骤

- [x] 核对 Taskboard SQLite 事务、目录准备、SDK 启动与输入回执的现有入口，以及故障窗口的 G0 证据。
- [x] 扩展现有 Taskboard 数据域，按提交顺序持久化队列。保存启动命令的幂等键、目标任务、需求版本、已确认的目录和输入。原子认领队首并分配一个执行槽和租约代次。两个 Host 竞争只有一个赢家，取消待运行的 Run 不会释放其他 Run 的租约。[Windows 验证](evidence/windows-queue.json)
- [x] 随排队 Run 保存完整工作目录确认或隔离工作树计划。认领后使用 `prepareWorkspace` 复核保存的计划，覆盖 Host 重启、目录变化和错误租约。[Windows 验证](evidence/windows-workspace-plan.json)
- [x] 保存投递意图后才发送。保存 `session/prompt` 的实际回执。回执写入失败时保留待对账状态，重启或重放不重复投递。[Windows 真实 SDK 验证](evidence/windows-sdk-input.json)
- [x] 通过认证 Web API 提交及取消 Run。相同请求并发或重启后重放返回原 Run 和回执。Host 配置解析执行路线，操作者提供目录确认及材料选择。
- [x] 接入可显式启用的 Host 调度。认领后核对保存配置及实际目录，SDK 权限握手通过后才投递。认证 Web 复验覆盖并发重放、目录变更失败后释放槽、真实输入回执、等待取消及范围未知保留租约。[验证](evidence/macos-dispatch.json)
- [x] 正式调度故障复验。无效权限配置使 SDK 拒绝启动，零模型请求。首次回执写入失败后，同一 Host 补写原 SDK 消息 ID，同时只发出一次模型请求。跨 Host 对账归 TBOARD-08。[故障证据](evidence/macos-dispatch-faults.json)
- [x] 接入原目录恢复和换目录新建 Session。认证 Web 实测新 Run 复用原 Session，换目录只带入显式材料，原 Session 缺失时零新增请求且保留历史。SDK 拒绝工作目录不匹配或有待处理输入的恢复。见 [平台验证](evidence/macos-resume.json)。
- [x] 使用真实 Web Host、SDK 与本机确定性模型验收串行启动、回执、取消和恢复。传输回执丢失时从原 Session 对账，停止确认后到达的回执记入原 Run。[最终定向验收](evidence/macos-web-acceptance.json)
- [x] 首发 macOS 正式 SDK 路径在用户级 launchd resource coalition 内运行。真实 Bash 后代离开原进程组，SDK 根退出后仍持锁，完整范围归零后自动释放租约并调度下一项。[实机验收](evidence/macos-launchd-scope.json)
