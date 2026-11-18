---
schema_version: 1
task_id: dsh-tboard-04
state: HANDOFF_READY
previous_agent: Codex
next_agent: Codex
branch: codely_bridge
updated_at: "2026-11-16T16:18:27Z"
---

# TBOARD-04 交接

当前跨设备提交、验证和接续状态见 [最新交接](../dsh-cross-device-handoff/handoff.md)。下文的未提交状态及额度是本阶段原检查点记录，不能用于判断当前 Git 同步状态。

TBOARD-00、01、02 已完成。TBOARD-04 已交付工作目录准备、原目录与前次工作树确认、独占 SDK 句柄停止、超时与显式强停、原生权限服务握手门槛。当前产品决策是任意工具运行后的强停在什么平台验收。[方案及实测差异](platform.md)。尚未确认该项，任务保持 IN_PROGRESS。按实施 Plan，TBOARD-03 的真实调度依赖此决定。

可在仓库根目录用与 G0 相同的 Node 运行 `node .ai/tasks/dsh-tboard-04/evidence/stop.mjs --controlled-tool` 验证真实工具子进程结束与租约释放；省略参数验证根进程已退出、工具范围不明仍保留租约。运行 `node .ai/tasks/dsh-tboard-04/evidence/permission.mjs` 验证权限配置错误时模型请求和目录写入均为零。受控任务的模型响应由本机确定性服务提供。Web 端到端通过有效浏览器会话验证业务接口，工作台页面归 TBOARD-07。

最终测试：79 项 Taskboard 与存储测试、1 项真实 Web E2E、两个独占 SDK 停止场景及无效审批配置场景通过。Host/Client 类型、Host 构建、定向 lint、文档配对和配置目录复验通过。全仓 doc-sync 仍有旧文档及中文规划文档的问题。命令与范围见 [日志](log.md)，被测文件和构建产物见 [指纹](evidence/sha256.json)。

本步文件归属为 packages/api/taskboard-controller、workspace-changes 的 GitRunner 导出、Web profile 的工作树配置、对应测试和文档、生成目录及本任务记录。分支 codely_bridge 相对本地跟踪的 origin/codely_bridge 领先/落后均为零；新改动在当前工作区，未提交或推送。该工作区还保留较早任务的改动。没有共享工作流或通用记忆变更。

**接续方式**：确认 [首发平台选择](platform.md)，核对分支、工作区和文件指纹，重新取得单写权并读取实时周额度。保留 macOS 时，落实被冻结的适用范围与无法确认时的对账操作；选择 Linux 时，先在真实用户级 systemd 环境验证 Run 与工具的所有权、停止和解锁。完成相应验收后推进 TBOARD-03。2026-11-17 00:18（上海）周剩余 20%，重置为当日 17:33。本次停在产品决策点，Codex 已释放写入权。
