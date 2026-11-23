# 工作台浏览器测量

| 项 | 口径 |
| --- | --- |
| 用户操作 | 在已登录的 DSH Web 点击工作台。2,000 条任务进入看板，等待真实浏览器两次动画帧。外部操作者通过同一 Web Host 变更一张卡片，计时至卡片进入目标列并等待两次动画帧。 |
| 输入 | 一个项目，2,000 条任务，不同标题、模块、标签及优先级，每条含任务描述和两条验收标准。12 个状态变更使用分散的提交时点。 |
| 路径 | `/opt/homebrew/bin/node apps/web/tests/fixtures/taskboard-smoke.mjs --performance` 启动已构建的 dsh Web profile、SQLite 和 Chromium。没有外部模型或网络请求。 |
| 计时 | macOS 15.6.1 arm64，Node 26.5.0，16 物理核，64 GiB。每个样本使用新浏览器和页面；Host 先完成任务写入，不计 Host 启动、鉴权及造数时间。 |
| 判定 | 首屏使用 12 个样本的 nearest-rank P95。更新延迟报告全部样本和最大值。与 PRD 的 2 秒、1 秒比较；机器规格与 PRD 的 8 核/16 GiB 不同。 |
| 内存与行为 | 看板保留全部任务并检查列内卡片数。此诊断没有采集堆或 RSS，不据此判断内存目标。保留现有 Web 测试对排序、需求和 Run 的功能验收。 |

[原轮询样本](evidence/browser-performance-before.json)首屏 P95 392 毫秒，最慢可见更新 1,381 毫秒。[提交通知样本](evidence/browser-performance-after.json)首屏 P95 414 毫秒，最慢更新 116 毫秒，更新最大值降低 91.6%。原轮询实现复现了超过 1 秒的情况。首屏变化为 22 毫秒。两组均为同一 16 核、64 GiB 机器的本地测量。
