# macOS 停止证据与首发范围

Taskboard 首发沿用 [macOS G0 组合](../dsh-tboard-01/matrix.md)。Host 在确认目标 SDK 和所属工具进程范围退出后释放目录租约。证据不足时保留租约。仍持有目标进程句柄的 Host 可以重新核对退出证据，跨 Host 重启的进程对账归 TBOARD-08。

G0 在本机确认了正常 shutdown、目标 runtime 退出、测试 shell 子进程消失和另一 Run 存活。[双实例证据](../dsh-tboard-01/evidence/stop-tree.json)。专题 FR07、AC12 和 AC18 要求结束前确认目标进程树，确认不足时保留租约，禁止用服务重启、PID 消失或租约过期代替确认。

当前 [subprocess-local 平台限制](../../../packages/subprocess/subprocess-local/README.md#known-limitations-and-deferred-work)说明，macOS 没有该后端支持的持久 OS 进程范围，普通命令使用进程组，终端使用观测到的进程身份。[SDK 关闭](../../../packages/sdk/server/src/index.ts)先答复 shutdown，再处置根运行时；根进程的退出码不包含逐个子进程的存活证据。目标不明确时强制发送信号或释放目录，均无法满足 FR07。

在正式 Taskboard 控制器接入两个独占 SDK 的实测中，固定的一次工具调用只运行 `/bin/sleep`。Host 收到真实输入回执，观察到目标 SDK 和该子进程均已退出、另一 SDK 仍存活，才将 Run 标为中断并释放对应的一代租约。[受控进程结果](evidence/controlled-stop.json)。在相同 Host 中将工具范围设为无法核实时，正常停止、命令重放和显式强停均保留原租约。[未确认结果](evidence/stop.json)。前一试验的进程观察只覆盖固定命令，不能用于证明任意 macOS 工具的完整进程范围。

| 首发选项 | 可对用户承诺的行为 |
| --- | --- |
| 保留本机 macOS 与已有工具 | 已确认的范围按证据收尾；无法核实完整范围的 Run 显示停止未确认，保留目录和租约，须对账。对于这类 Run 不承诺强制停止后可以立即继续。 |
| 将完整强停验收放在有持久 OS 范围的环境 | 用实际支持的 Linux 用户级 systemd 环境重新验证 SDK/runtime、工具范围、强停与隔离，再决定支持组合。macOS 保留已有接入验证。 |

两案都保留已确认的 Web 入口、独占 runtime 和换目录新 Session。前者限定自动解锁的适用场景，后者调整首发环境并需新的运行验证。
