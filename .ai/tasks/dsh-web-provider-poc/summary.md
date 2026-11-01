---
schema_version: 1
task_id: dsh-web-provider-poc
title: "当前状态总结（WB-01 / VN4-06 完成时）"
updated_at: "2026-11-02T00:22:00+08:00"
---

# 当前状态总结

本文件面向人工审阅与后续会话，总结 dsh-web-provider-poc（WB-01 / VN4-06）完成时的工作流状态；执行细节以本目录 task.md、plan.md、handoff.md、log.md 与 evidence/ 为准，本文件只做索引与结论。

## 完成路径

2026-11-01T23:58:46+08:00 Codely 按 WORKFLOW §5.2 从 Codex 接手（Codex 因五小时余量 14% 触发停止线释放写入权），核对 Checkpoint 与真实 Git 一致后取得单一写入权。

接手后先补齐最终 prepareCall 修复后未重跑的三项检查：全仓 lint（5060 文件 0 警告 0 错误）、SDK web-validation-admission keyless 回放、两组双语配对（llm README 对与 llm-streaming 子系统对），全部 PASS。

随后完成阶段 3b：独立 Bun worker（web-validation-worker.ts，mock-complete / mock-generating / mock-rejected / real 四场景；real 复用参考进程内 responseRequest 与 Browser Adapter，不启动 Responses listener；console 噪音重定向 stderr，stdout 保持纯 NDJSON 协议；--evidence 镜像全部协议记录）、桥接 Adapter fixture（packages/llm/llm/tests/fixtures/web-bridge.ts，经受限准入注册 chatgpt_web_unofficial 路线，commentary→reasoning 块、最终文本→text 块、错误→LlmError、取消→worker 中止与清理；attribution user-agent 上 wire；意外 tool 流量 fail-closed）、禁用全部本地工具行的运行时 patch（由驱动脚本按运行生成）。

验证分三层推进：适配器层 18 项 PASS（wire JSON 往返、取消、失败映射、三路径子进程清理无孤儿）；运行时层经真实 built sdk profile PASS（mock 完成路径逐字回显、第二次调用 VALIDATION_ADMISSION_DENIED、mock-rejected 失败投影进 turn/end、request/header 无本地工具）；最后经用户确认发起一次真实浏览器请求并 PASS。

## 真实请求结果

唯一标记提示词得到精确回显（exactMarker=true，非手工/Mock），wire 记录 response.created→…→response.completed，真实 usage 为 inputTokens 8937 / outputTokens 24 / totalTokens 8961（参考 estimated 口径，原始记录见 evidence/dsh-web-real.ndjson），request/header 记录 chatgpt_web_unofficial / gpt-5.6-sol 且无本地工具，threadId/turnId 关联真实 user message id，attribution user-agent 在 wire 请求上，worker 干净退出（failure=null、aborted=false、activeTurns=0）。证据入口：evidence/dsh-web-real-request.json。

真实请求前有三次提交前失败（均未消耗模型用量），定位为桥接协议缺陷：参考 transport 经 console.info 输出的 [chatgpt-web] / [chatgpt-web-helper] 日志行混入 worker stdout，炸掉 adapter 的逐行 JSON.parse，中止信号级联导致浏览器 turn 在提示词附载阶段中断；"空白页"为正常初始态（成功流程同样从 origin=null 开始，导航完成后才变为 chatgpt.com）。修复即 console 重定向加容错解析；期间经用户授权重启过一次 DEV launcher（排除进程因素，非根因）。

## 工程结论（已入共享记忆）

built 运行时经 Node 22.18 原生 type-stripping 加载 .ts profile 插件，构造器参数属性（constructor(private readonly x: T)）在 strip-only 模式不支持，需显式字段赋值；--patch 内插件 name 按 patch 文件目录解析 `.` 前缀相对路径，`file://` 形式不可导入；参考代码的 console.info 会污染宿主进程 stdout，任何以行协议复用参考进程内代码的探测必须重定向 console 或容错非 JSON 行；本机 Python SDK 探测使用 /opt/anaconda3/bin/python 加 PYTHONPATH=python/sdk/src。以上见 .ai/MEMORY.md 的 "Built-runtime plugin loading" 与 "ChatGPT integration facts" 两节。

## 边界与未完成

Session 级取消没有 SDK wire-level cancel 入口（Python/TS client 文档明确），取消证据止步适配器层，不冒称 Session 级证据。生产准入按批准范围保持 gated，未放开任何生产政策；生产准入申请与 M2 产品化属后续独立决策。usage 为参考 estimated 口径。主计划 WB-01 / VN4-06 已按用户确认打勾（第 12 节 Checklist 与第 15 节 2026-11-02 段落）。

## Git 与环境状态

全部变更按用户指示提交为两个 commit：共享规则任务（dsh-incremental-handoff）的 AGENTS.md、CODELY.md、.ai/WORKFLOW.md、.ai/MEMORY.md 与其任务目录为一个 commit；本任务的 llm 包准入实现与测试、桥接 fixture、快照、生成目录、子系统与 README 文档对、主计划、锁文件与本任务目录（含本文件）为另一个 commit。用户个人 .codely-cli/settings.json 保持未提交、未读取、未修改。未推送远端。

DEV launcher 为重启后进程（pid 66262），隔离数据目录 .artifacts/cgw-dev-runtime 独占使用中；参考源码、Bun 工具与私有浏览器数据均在忽略目录，不随 git 提交。收尾门禁：全仓 lint PASS（5063 文件含新 fixture）、verify-md-links 2321 文件全过、verify-doc-budgets 8 文件合规、主计划 wrap 0 违规、git diff --check 通过。
