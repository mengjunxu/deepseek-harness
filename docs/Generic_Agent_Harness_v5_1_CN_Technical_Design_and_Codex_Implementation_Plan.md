# Generic Agent Harness v5.1

## 技术设计与 Codex 实施版

版本：v5.1

定位：

Generic Agent Harness 是一个基于 DSH 的通用 Agent 操作框架。

核心目标：

-   DSH 作为 Harness 基础。
-   支持多种 Agent Runtime。
-   支持 Subscription 与 External-Agent 两种运行模式。
-   支持 ACP 作为外部 Agent 标准接入协议。
-   支持任务持久化、Session、Memory、Checkpoint、多设备协同。

------------------------------------------------------------------------

# 1. 总体架构

                             User

                              |

                           DSH UI

                              |

                      DSH Harness Core

                              |

                  Agent Integration Layer

              +---------------+---------------+

              |                               |

     Native Provider Mode             External Agent Mode

              |                               |

     DSH Agent Loop                      ACP Client

              |                               |

     Provider Adapter                    ACP Protocol

              |                               |

     Codex/Codely Provider          Codex/Codely Runtime

              |                               |

            Model                         Agent Loop

------------------------------------------------------------------------

# 2. 核心模块划分

    generic-agent-harness/

    packages/

     core/
       task/
       session/
       event/
       workflow/

     memory/
       store/
       retrieval/
       context/

     agent-integration/
       provider/
       acp/
       capability/

     workspace/
       git/
       worktree/

     distributed/
       github/
       node/

     cli/

     web/

------------------------------------------------------------------------

# 3. DSH 核心职责

DSH 负责：

## 生命周期

-   Task 创建
-   Session 管理
-   Event 记录
-   Workflow 调度

## 状态

-   Checkpoint
-   Recovery
-   Audit

## 权限

-   Approval
-   Tool Permission
-   Execution Policy

## 扩展

-   Plugin
-   Tool Registry
-   Agent Registry

------------------------------------------------------------------------

# 4. Agent Integration Layer

## 4.1 Provider Adapter

用于 Subscription 模式。

接口：

``` typescript
interface ModelProvider {

  initialize(config): Promise<void>;

  chat(request): Promise<Response>;

  stream(request): AsyncIterable<Event>;

  capabilities(): Capability;

}
```

实现：

    providers/

    codex-provider

    codely-provider

    local-provider

------------------------------------------------------------------------

# 4.2 ACP Client

用于 External-Agent 模式。

接口：

``` typescript
interface ExternalAgentRuntime {

  start(task): Promise<Session>;

  send(sessionId,message): Promise<void>;

  stream(sessionId): AsyncIterable<Event>;

  checkpoint(sessionId): Promise<Checkpoint>;

  resume(checkpoint): Promise<Session>;

  cancel(sessionId): Promise<void>;

}
```

------------------------------------------------------------------------

# 5. Agent Capability Manifest

所有 Agent 必须声明能力。

示例：

``` json
{
"name":"codex",

"modes":[
"subscription",
"external-agent"
],

"capabilities":{

"streaming":true,

"terminal":true,

"file_edit":true,

"checkpoint":true,

"approval":true

}
}
```

用途：

-   Agent 选择
-   Workflow 路由
-   能力匹配

------------------------------------------------------------------------

# 6. Task FSM

任务状态：

    CREATED

     |

    QUEUED

     |

    PLANNING

     |

    WAIT_APPROVAL

     |

    EXECUTING

     |

    REVIEWING

     |

    COMPLETED

异常：

    FAILED

    CANCELLED

    INTERRUPTED

    NEEDS_HUMAN

------------------------------------------------------------------------

# 7. Session 设计

Session 采用事件模型。

    Session

     |
     + Event

     |
     + Event

     |
     + ToolCall

     |
     + Checkpoint

     |
     + Event

要求：

-   Append Only
-   可回放
-   可恢复

------------------------------------------------------------------------

# 8. Memory 设计

三层：

## Stored Memory

长期知识。

## Retrieved Memory

当前任务检索结果。

## Injected Context

发送给 Agent 的上下文。

流程：

    Memory Store

    ↓

    Retriever

    ↓

    Context Builder

    ↓

    Agent

------------------------------------------------------------------------

# 9. Workflow Engine

默认流程：

    Planner

    ↓

    Approval

    ↓

    Executor

    ↓

    Reviewer

    ↓

    Complete

示例：

    Planner:

    Codex External-Agent


    Executor:

    Codely External-Agent


    Reviewer:

    Codex External-Agent

角色必须可配置。

------------------------------------------------------------------------

# 10. Codex 接入方案

## Subscription

    DSH

    |

    Codex Provider

    |

    Codex Subscription

DSH 控制 Loop。

## External Agent

    DSH

    |

    ACP Client

    |

    Codex Runtime

Codex 控制 Loop。

------------------------------------------------------------------------

# 11. Codely 接入方案

## Subscription

    DSH

    |

    Codely Provider

    |

    Codely Subscription

## External Agent

    DSH

    |

    ACP Client

    |

    Codely Runtime

------------------------------------------------------------------------

# 12. Workspace

禁止直接修改用户工作目录。

采用：

Git Worktree。

    workspace/

     TASK-001/

     source/

     logs/

     checkpoint/

     report/

------------------------------------------------------------------------

# 13. 多设备节点

GitHub 作为第一版 Control Plane。

    GitHub

     |

    Self Hosted Runner

     |

    DSH Node

     |

    Agent Runtime

节点：

-   home-pc
-   office-pc
-   cloud-node

------------------------------------------------------------------------

# 14. Budget Policy

优先级：

    Local

    ↓

    Subscription

    ↓

    External Specialist

    ↓

    Paid API

默认：

Local:

-   分类
-   搜索
-   Context

Codely:

-   执行

Codex:

-   架构
-   Review

------------------------------------------------------------------------

# 15. 实施路线

## Phase 0

DSH 基础验证。

交付：

-   DSH运行
-   UI
-   Session

------------------------------------------------------------------------

## Phase 1

Core Model。

实现：

-   Task
-   Session
-   Event
-   Checkpoint

验收：

任务可创建、恢复、回放。

------------------------------------------------------------------------

## Phase 2

Agent Integration。

实现：

-   Provider Interface
-   ACP Client
-   Capability Manifest

验收：

注册多个 Agent。

------------------------------------------------------------------------

## Phase 3

Subscription。

实现：

-   Codex Provider
-   Codely Provider

验收：

DSH Native Loop 可以调用。

------------------------------------------------------------------------

## Phase 4

External Agent。

实现：

-   ACP Client
-   Codex ACP
-   Codely ACP

验收：

DSH 可以启动外部 Agent。

------------------------------------------------------------------------

## Phase 5

Workflow。

实现：

-   Planner
-   Executor
-   Reviewer
-   Approval

------------------------------------------------------------------------

## Phase 6

Memory。

实现：

-   Memory Store
-   Retrieval
-   Context Builder
-   Compaction

------------------------------------------------------------------------

## Phase 7

Distributed Node。

实现：

-   GitHub Control Plane
-   Runner
-   Recovery

------------------------------------------------------------------------

# 16. Codex 开发执行规则

第一阶段：

只实现 Core。

禁止：

-   接入具体 Agent
-   接入业务项目
-   接入 Unity

第二阶段：

实现 Agent Integration。

第三阶段：

实现 ACP。

每阶段必须：

-   有测试
-   有 Demo
-   有回滚

------------------------------------------------------------------------

# 17. 最终设计原则

    DSH owns orchestration.

    Agent owns reasoning.

    ACP connects external agents.

    Provider connects models.

    Task owns goals.

    Session owns history.

    Memory owns knowledge.

    Workflow owns execution.
