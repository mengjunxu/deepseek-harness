# Execution Plan

## Phase 1 — 准备

- [x] 核对旧任务、Git、官方 SIWC 文档与单写入者。
- [x] 准备独立诊断脚本和受保护的本地凭据目录。

Status: DONE

## Phase 2 — 真实探测

- [x] 用户浏览器授权；校验 state、PKCE、ID token 与订阅权限。
- [x] 查询账户模型列表，完成一次短流式请求；分别记录失败或成功。

Status: DONE

## Phase 3 — 验证与交接

- [x] 更新供应商矩阵双语对与清单。
- [x] 执行定向检查并记录结果，停止监听器。

Status: DONE

## Verification

- `node .ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs`：PASS；用户完成真实浏览器授权。OAuth 注册、OIDC 签名/issuer/audience/expiry/nonce 校验、订阅 scope、7 个可见模型和 `gpt-6.1-sol` 流式 `response.completed` 均通过；预期输出匹配，13 输入 / 7 输出 token。
- 被测脚本版本：SHA-256 记录于 [siwc-result.json](artifacts/siwc-result.json)。实测后仅把 usage 日志裁剪为总输入/输出计数；留存源码的独立 SHA-256 亦在该文件中，授权和推理请求未变化；不重复消费订阅做相同请求。
- `node --check .ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs`：PASS。
- 本地 HTTP 检查：根页面 200、错误 state 回调 400；授权跳转 302，目标、回环 URI、PKCE S256、资源、订阅 scope 与应用名均符合预期。检查程序未输出授权参数值。
- Python 结果与安全检查：PASS；六个真实验证阶段通过、证据无 token/账号/PKCE 字段、仓库外目录 0700、JSON 凭据文件 0600、监听器已关闭。
- `corepack pnpm exec oxlint .ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs`（包括 `--no-ignore` 重试）：未检查文件；配置未发现该路径。随后用 Python 将源码逐字节复制到私有临时目录，对该副本执行 `corepack pnpm exec oxlint <temporary>/siwc-probe.mjs`：PASS；没有修改源码或 lint 配置。
- `corepack pnpm exec tsx scripts/verify-translation-pairing.ts --write docs/dsh/spikes/model-provider-matrix.md`：PASS；随后无 `--write` 的命名对检查 PASS。
- 本任务 Markdown 局部链接与文件结尾检查：PASS；本轮新增链接均存在。
- `corepack pnpm run test:docs`：17 PASS、3 FAIL；translation pairing、markdown wrap、repository references，与此前共享指令任务的失败类别一致。
- `corepack pnpm run doc-sync`：37 PASS、5 FAIL；doc-typecheck、cordis catalog、translation pairing、markdown wrap、repository references，与此前完整检查的失败类别一致；新供应商矩阵和 SIWC 任务无诊断。输出分别保存在 `/tmp/dsh-siwc-test-docs.log` 和 `/tmp/dsh-siwc-doc-sync.log`，并对照此前 `/tmp/dsh-shared-agent-docs-after.log` 和 `/tmp/dsh-shared-agent-doc-sync.log`。
- `git diff --check`：PASS。
- `git fetch origin`：PASS；分支相对远端跟踪引用无 ahead/behind 标记，工作区成果仍未提交/推送。
- 产品行为测试、真实 API Key 请求、token 刷新/撤销、订阅额度耗尽：NOT_RUN；本任务只验证独立 SIWC 可行性，没有改产品包，也没有 API Key。
