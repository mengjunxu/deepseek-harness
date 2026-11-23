---
schema_version: 1
task_id: dsh-tboard-10
status: DONE
---

# G3 工作台调度

有限并行默认一项，互斥目录及 Session；同项目父子任务和阻塞依赖可在工作台维护；操作者可针对已选任务授予一次条件领取，撤销或失败后不能自行重试。参考机复测留在 G2。

范围取自[实施计划](../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md)和[工作台 PRD](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。默认并发 1，部署可配置 1–32。本轮自动领取的授权粒度为一个任务的当前版本、一个全新 Session、一个隔离工作树，最多一次执行。父任务仅分组，阻塞关系单独配置。

已完成三项功能及并发、授权与恢复验收。[运行证据](evidence/macos-parallel.json)。
