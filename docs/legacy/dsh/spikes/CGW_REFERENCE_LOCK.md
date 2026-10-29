# External reference source lock

English | [中文](CGW_REFERENCE_LOCK.zh.md)

## Scope and evidence

Static source review on 2026-10-28; both repositories were available as local read-only checkouts under a temporary reference directory. Remote HEAD values were checked with git ls-remote and matched each checkout. No reference app, install script, account flow or browser automation was run. Immutable source links below lock revisions without putting raw commit identifiers in maintained prose. Both root LICENSE files declare MIT; retained notices and dependency licenses require review before copying.

## Selected modules

| Reference / locked source | Observed entry | Reuse / limits | DSH work |
|---|---|---|---|
| [codex-chatgpt-web tree](https://github.com/miuuyy/codex-chatgpt-web/tree/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119) | src/adapters/chatgpt-web/conversation-key.ts: chatGptConversationKey, retainedConversationResumeRequest | Conversation keys and retained-context checks inform binding; Codex request identity must map to DSH Session/ContextEpoch rather than be copied as authority | VN4-06/08; CGW-04/10/11 |
| [turn broker](https://github.com/miuuyy/codex-chatgpt-web/blob/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119/src/adapters/chatgpt-web/turn-broker.ts) | TurnBroker; owner_completion_fence_begin/commit; retirement | Request leases and monotonic completion revisions inform tool settlement; DSH must authenticate caller/scope and own revocation, not trust model-supplied IDs | VN4-07/10; CGW-02/08/09 |
| [turn execution](https://github.com/miuuyy/codex-chatgpt-web/blob/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119/src/adapters/chatgpt-web/turn-execution.ts) | ChatGptTurnSession, ChatGptTurnSessions, chatGptTurnRetryKey | Distinguishes logical execution, physical cleanup and capability retirement; does not establish DSH TurnAttempt durability or account authorization | VN4-06/07; CGW-07/08/10 |
| [ChatToHarness task store](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/task-store.cjs) | TaskStore.start, request, existing | Project/idempotency key and payload fingerprint reject conflicting repeats; bounded waits return original IDs. Reuse semantics, not a second JSON Task Store | VN4-07/10; P1-03, P3-07/08 |
| [task worker](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/task-worker.cjs) | main; durable claim and saved state | Crash-surviving claim illustrates avoiding duplicate command execution; it does not supply cross-machine fencing or prove resumability | VN4-07/11; T17/25 |
| [MCP gateway](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/mcp-gateway.cjs) | McpGateway; MCP Server handlers | Tool transport and persistent task guidance inform optional inbound Gateway; do not replace external-agent execution or adopt instructions without DSH authorization review | VN4-10; T21/22/24/27 |

## Unverified scope

Other CGW-01–22 claims remain input research targets, not independently audited capabilities: browser submission and model identity, attachment/context budgeting, production diagnosis/drain, packaging/upgrades, multiagent support and global Codex injection were not exercised. Never import global Codex config injection as a default integration. No active Codex Native Host was demonstrated. Public source availability does not establish Web use permission or a billing entitlement. Recheck moved paths against these pinned revisions before implementation; broader reference testing belongs to a separately authorized phase.
