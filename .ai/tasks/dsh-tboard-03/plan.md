# 步骤

- [x] 核对 Taskboard SQLite 事务、目录准备、SDK 启动与输入回执的现有入口，以及故障窗口的 G0 证据。
- [x] 扩展现有 Taskboard 数据域，按提交顺序持久化队列。保存启动命令的幂等键、目标任务、需求版本、已确认的目录和输入。原子认领队首并分配一个执行槽和租约代次。两个 Host 竞争只有一个赢家，取消待运行的 Run 不会释放其他 Run 的租约。[Windows 验证](evidence/windows-queue.json)
- [x] 随排队 Run 保存完整工作目录确认或隔离工作树计划。认领后使用 `prepareWorkspace` 复核保存的计划，覆盖 Host 重启、目录变化和错误租约。[Windows 验证](evidence/windows-workspace-plan.json)
- [x] 保存投递意图后才发送。保存 `session/prompt` 的实际回执。回执写入失败时保留待对账状态，重启或重放不重复投递。[Windows 真实 SDK 验证](evidence/windows-sdk-input.json)
- [ ] 将认领、目录准备、`createTaskRuntime` 和输入投递接入正式调度。完成权限握手和目录验证后再发送输入。覆盖双击、重放、权限或目录准备失败，以及启动后回执写库失败。
- [ ] 依据同目录恢复及换目录新建的决定接入重试与继续。覆盖恢复时零模型调用、恢复失败保留历史，以及只携带操作者显式选择的材料。首次发送的结果未知时保留记录供对账。
- [ ] 使用真实 Web Host、SDK 与本机确定性模型验收串行启动、回执、取消和恢复；记录用例与版本证据。
