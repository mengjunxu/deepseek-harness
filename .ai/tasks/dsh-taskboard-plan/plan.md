# Execution Plan

## Phase 1 — 来源与映射

- [x] 读取 Word 全部正文与表格、查看两张图片，核对 Taskboard Markdown。
- [x] 识别独立 UI、Task 存储与现有复用要求的差异，安排 G0 决策。

Status: DONE

## Phase 2 — 规划更新

- [x] 更新主 PRD、Plan 的要求、依赖和验收映射。
- [x] 检查需求覆盖、相对链接、Diff 与文档 gates，记录限制。

Status: DONE

## Verification

- PASS：bundled Python 提取 Word 全部正文/表格并核对两张源图；原件无修订或评论。Word 长段落/单元格与 Markdown 格式归一化对照无缺项；FR01–14、AC01–20、NFR01–09 编号齐全。
- PASS：pnpm exec tsx 调用仓库 verify-md-links 的 findViolations/anchorCache，三份 Markdown 的相对链接和锚点均有效。
- PASS：Python 定向检查确认 12 项 TBOARD 定义/状态一致、依赖无循环、AC01–20 有实现归属、原有 Checklist 状态全部保留、文件末尾恰有一个换行。
- PASS：git diff --check；完整 Diff 审阅，变更范围不含 vendor。
- FAIL：pnpm run test:docs：18 passed / 2 failed（translation pairing、markdown wrap）。
- FAIL：pnpm run doc-sync：结果如下，与前序关联任务的失败类别一致；保留配对缺失、原稿格式、历史代码块、生成目录检查限制，未扩展修复。

```text
run-gates: 36 passed, 6 failed, 0 skipped in 67.81s.
  - FAILED doc-typecheck (26.49s, exit 1)
  - FAILED doc graphs (21.88s, exit 1)
  - FAILED translation pairing (29.62s, exit 1)
  - FAILED markdown wrap (7.82s, exit 1)
  - FAILED client catalog (2.52s, exit 1)
  - FAILED skill plugin package list (1.19s, exit 1)
```

- NOT_RUN：本轮未重复 pnpm run lint，前序同一聊天已通过且本轮只改 Markdown；未运行产品单元/E2E/真实模型测试，无产品实现或行为变更。
- 详细日志：本机 /tmp/dsh-taskboard-plan-test-docs.log、/tmp/dsh-taskboard-plan-doc-sync.log；受检来源与输出文件内容指纹见 source-sha256.txt。无固定发布 ref，不能以可变分支名充当版本证据。
