---
schema_version: 1
task_id: dsh-web-provider-priority
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-01T00:06:32+08:00"
---

# Checkpoint

用户要求 Web ChatGPT Provider 作为当前第一优先验证方案，并指定 https://github.com/miuuyy/codex-chatgpt-web 为参考。本 Task 的排期、验收定义和参考源码复核已完成，释放写入权；不代表 WB-01 / VN4-06 的真实验证通过。用户已授权将当前累计成果提交本地；本检查点随本次提交保存，不 Push。

## Changes

有效 Plan 顶部、第 0/10/11/12/14/15 节和 PRD 的 FR-WEB-02、M0 前置、M2 产品化及 D-09 同步优先级。WB-01 / VN4-06 为 TODO / FIRST，排在剩余 QR-02、额度策略和 Executor 产品化之前，不再等待完整 P2/P3/P4 或 VN4-02 UI。既有成果保留，其他任务编号不重建。主 Plan 第 15 节唯一拥有五步验证顺序与证据标准；PRD、现有 proposed ADR 和架构索引指向该顺序。没有第三份有效 Plan/PRD，没有改动 legacy 记录。

第一候选为参考仓库的 Browser-only 自动收发；Full Harness、MCP/Tunnel、Reverse Codex/活动 Native Host 不是最小验证前置。实际网页通路、DSH LlmAdapter/Session 接入、Mock/Manual、生产准入分别判定。唯一文本标记、实际模型/effort、发送是否确定、回复与终态、流、取消/失效/断连/限额及会话绑定需要证据。禁止把 Mock 或 SIWC 成功当作 Web 成功，也不以 local/api_metered 标记真实 Web 规避既有门禁。默认生产政策和账号/使用条件要求没有因为排期调整而被解除。

前序 agent-default-model README 的扩展 Model Experience 不符合该包既有 indirect 格式门禁，本轮保持事实并按固定格式修正双语说明；未改其源码、提示词或运行行为。既有 ADR 仍 proposed，未废弃任何 implemented 决策；无需要新增的独立 Memory 事实。

## Reference evidence

参考仓库当前浅检出 packageVersion 为 6.1.17，本轮只静态阅读，源码链接与指纹见 evidence/reference-audit.json。检出位于忽略的 .artifacts/references，不是 vendor 或产品复制代码；未安装依赖、运行其脚本、启动其应用或修改全局 Codex 配置。历史 CGW_REFERENCE_LOCK 保留原有日期和范围，新复核不冒充运行验收。

参考实现通过本地 Responses 桥调用浏览器 worker，Browser-only 与完整工具链分离。ChatGptWebAdapter 依赖 CodexParsedRequest 和 launcher 持有的浏览器租约；DSH 需要单独解决输入/身份/生命周期映射，不能将其视为只改 baseURL 即可直接复用的 LlmAdapter。选取 browser-worker 的 UI 发送/接受路径、conversation-key、turn-execution 和 DOM 变体说明作定向审阅，未覆盖整个仓库。根许可为 MIT，后续复制时仍须核对对应文件和依赖许可。

Computer Use 仅盘点连接：本机有原生 Edge，当前没有已连接的 Chrome/Edge 浏览器扩展，in-app browser 无 tab；账号状态未知。没有打开 ChatGPT 页面、读取 Cookie 或提交模型请求。这不证明浏览器通路不可用，也不构成真实 PoC 通过。

## Verification

- PASS：verify-md-links（2321 文件）；verify-repository-references；两组命名双语配对（ADR、README）；verify-package-readme-model-experience（317 README）；lint:contracts-ready；git diff --check。
- PASS：优先级一致性断言，确认两个 FIRST、移除原 P4-only/DEFER 顺序、PRD 前置行和 D-09、ADR 仍 proposed；前序 dsh-p1-intent-routing 的全部源码/配置/fixture 指纹保持不变。
- 已执行 pnpm run test:docs：17 PASS / 3 FAIL。该运行曾包含本轮新增 ADR 链接 locale 错误和前序 README 格式问题，两者已修复并单独复验；原有未配对 Plan/PRD/legacy 与硬换行仍失败。
- 已执行 pnpm run doc-sync：35 PASS / 7 FAIL。剩余门禁为旧 legacy 文档代码块、ChatgptPlanState 类型链接导致的 doc graphs/cordis catalog、Client/插件目录，以及历史/输入文档配对和硬换行。未伪称全仓通过。
- API Key 真实验证 NOT_RUN（用户免测）；参考运行、网页真实往返、Browser-only 实际模型能力、DSH Adapter PoC 均 NOT_RUN。没有业务源码改变，本轮未重复单元测试/真实执行器 probe 或全仓 coverage；doc-sync 已进行 Host 构建。

## Next and Git

下一项为 WB-01 / VN4-06 的 Browser-only 受控最小验证：核对隔离浏览器/launcher 通路与账号条件，得到真实单轮收发证据，再实现/验证 DSH 适配。不能继续以“后期可选研究”延后，也不能先做完 QR-02、预算或 Executor 才开始。真实访问须满足现有准入；缺失时先完成可独立进行的通路与 Mock 检查，具体记录未满足的外部条件，不把 NOT_RUN 记成 FAIL 或 PASS。

已有 P0/P1 未提交代码、Task 和用户 .codely-cli/settings.json 均保留；该设置未被读取或修改。用户于 2026-11-01 要求一并提交累计 P0/P1 与本轮成果；提交范围排除 .codely-cli/settings.json，保留验证限制，不 Push。实际提交通过 Git 日志核对。文档指纹见 evidence/document-sha256.txt。
