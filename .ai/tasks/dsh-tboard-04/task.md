---
schema_version: 1
task_id: dsh-tboard-04
status: DONE
---

# 工作目录与停止隔离

按专题 FR01、FR07、FR09 和 AC12、AC15、AC18、AC19 实施。工作目录切换遵循已确认的新 Run、新 Session 规则。

已验证目录准备与工作树隔离。[Windows PC 实测](evidence/windows-pc-acceptance.json)覆盖固定 PowerShell 进程退出后的复核放锁、范围未知时保留租约和无效审批配置阻止输入。首发沿用 [macOS G0 组合及可核实的工具范围](platform.md)，[macOS 实机复验](../dsh-cross-device-handoff/evidence/macos-receipt.json)已通过。
