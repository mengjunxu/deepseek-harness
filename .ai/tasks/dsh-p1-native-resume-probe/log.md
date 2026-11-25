2026-11-25T14:04:29+0800 Codex 接手，已核对分支与上步写入权释放记录。

- Codex app-server 和 Codely ACP 首轮完成后分别退出，在新进程内验证恢复。持久 Codex 线程返回了原轮次；Codely 的两个标准方法均返回 method not found。增加 Codely 扩展、未知 ID 和新会话对照后，两种产品分别在四次本地模型调用中验证历史隔离。
- `node .ai/tasks/dsh-p1-native-resume-probe/evidence/probe.mjs` 通过。使用本机已登录 Codely、临时项目和本地测试模型，仅保存类别、版本、错误码和断言结果。
- `node_modules/.bin/vitest run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts -t 'dispatches the selected native Codex'` 通过 1 项，35 项未选择。
- `node apps/web/tests/fixtures/taskboard-smoke.mjs --native-codely` 通过。两种工作台路径都在备份恢复后用同一前序 Run 提交显式和省略执行器的续接请求，均拒绝，任务详情和模型请求数保持一致。
- 两个修改过的 MJS 文件均通过 Node 语法检查和真实执行。仓库 Oxlint 忽略 MJS，未将该命令计为通过。Git 空白检查通过。全仓 doc-sync 37/42，五项既有失败见证据。

2026-11-25T14:09:26+08:00 已完成当前验证任务，Codex 释放写入权。
