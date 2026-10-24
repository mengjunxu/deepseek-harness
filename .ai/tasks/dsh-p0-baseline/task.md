---
schema_version: 1
task_id: dsh-p0-baseline
title: "完成 DSH P0-01 至 P0-03 基线与供应商验证"
status: BLOCKED
priority: P0
created_at: "2026-10-23T00:17:00+08:00"
updated_at: "2026-10-23T00:17:00+08:00"
---

# Goal

按 `docs/workflows/DSH_IMPLEMENTATION_PLAN.md` 完成 P0-03 及其前置 P0-01、P0-02，并把实际验证结果写入可复查的文档与清单。

## Background

计划和清单要求先完成 P0 基线与技术验证。仓库没有这两项任务的执行记录；本任务补齐 P0-01 仓库基线、P0-02 Mock 网关证据和 P0-03 供应商矩阵，并如实区分 Mock 与真实账户验证。

## Scope

### In scope
- 落盘 `docs/dsh/spikes/repository-baseline.md` 及其中文对照与 `*.i18n.yaml` 记录。
- 核对 `packages/test-support/llm-mock-server` 对正常流、工具调用、失败、断流的覆盖，并记录可复现命令。
- 新增 `packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts`，覆盖 OpenAI 路线的成功、拒绝、额度耗尽与未配置凭据。
- 落盘 `docs/dsh/spikes/model-provider-matrix.md` 及中文对照，记录 SIWC 状态与 fallback。
- 更新 `docs/workflows/DSH_CHECKLIST.md` 的状态、证据台账与交接日志。

### Out of scope
- P0-04 及之后的 Codely、Codex 能力探测。
- 真实 OpenAI 账户联调与 SIWC 授权。
- 修改 `packages/llm/llm-pi-ai/src` 的产品代码。

## Acceptance criteria

- [x] P0-01 基线的工具链、Git 状态、能力对照与缺口有可复现证据。
- [x] P0-02 四类 Mock 场景由现有自动化测试覆盖并可复现。
- [x] P0-03 的 OpenAI 路线四类路径由自动化测试覆盖，结论区分 Mock 与真实账户。
- [x] 新增文档构成完整双语对并通过配对检查。
- [x] `DSH_CHECKLIST.md` 的状态与证据台账反映实际结果；P0-03 真实账户部分标为 BLOCKED。
- [x] 相关验证已执行，或限制已记录。

## Dependencies and constraints

- 基线验证时没有 API Key 或订阅登录；后续 [dsh-p0-siwc](../dsh-p0-siwc/handoff.md) 已完成 SIWC 独立实测，真实 API Key 路线仍待验证。
- 本机 Node 为 v22.18.0，低于仓库声明的 `^22.19.0 || >=24.0.0`，命令仍执行成功。
- `docs/**` 文档必须同时提供英文、中文与 `*.i18n.yaml` 记录。
- 工作区已存在他人修改：`.codely-cli/settings.json`、`docs/workflows` 中的计划与清单；本任务不改动无关内容。

## User decisions

- 无待确认事项；真实账户验证按计划规则保持阻塞，等待凭据可用。
