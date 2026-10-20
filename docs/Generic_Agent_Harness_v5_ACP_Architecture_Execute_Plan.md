# Generic Agent Harness v5.0

## ACP-based Agent Integration Architecture & Execute Plan

## 1. Architecture Positioning

Generic Agent Harness is a universal Agent orchestration framework.

Core decisions:

-   DSH is the Harness foundation.
-   DSH owns UI, Session, Workflow, Memory, Permission, Tool Registry
    and Task lifecycle.
-   Codex and Codely are Agent capabilities, not the Harness itself.
-   No business project is part of the core design.

The system supports two integration modes:

1.  subscription mode
2.  external-agent mode

------------------------------------------------------------------------

# 2. Integration Modes

## Subscription Mode

DSH owns the Agent Loop.

Architecture:

    DSH
     |
    Agent Loop
     |
    Provider Adapter
     |
    Codex / Codely Subscription

Responsibilities:

DSH: - context - tools - session - memory - workflow

Provider: - model access - authentication - inference

------------------------------------------------------------------------

## External-Agent Mode

External Agent owns its own Agent Loop.

Architecture:

    DSH
     |
    ACP Client
     |
    ACP Protocol
     |
    External Agent Runtime
     |
    Codex / Codely

Responsibilities:

DSH: - task lifecycle - permissions - approval - audit - checkpoint

External Agent: - reasoning - internal tools - internal context

------------------------------------------------------------------------

# 3. Agent Integration Layer

    agent-integration/

    native-provider/

      codex-provider
      codely-provider
      local-provider


    external-agent/

      acp-client
      codex-acp-adapter
      codely-acp-adapter

------------------------------------------------------------------------

# 4. Agent Capability Manifest

Example:

``` json
{
  "name": "codex",
  "modes": [
    "subscription",
    "external-agent"
  ],
  "capabilities": {
    "streaming": true,
    "terminal": true,
    "file_edit": true,
    "checkpoint": true
  }
}
```

------------------------------------------------------------------------

# 5. Core Data Model

## Task

Task describes objective, not execution engine.

## Session

Session stores immutable events.

## Checkpoint

Checkpoint enables recovery.

## Memory

Memory is separated into:

-   stored memory
-   retrieved memory
-   injected context

------------------------------------------------------------------------

# 6. Multi Device

GitHub is the initial coordination layer.

    GitHub Control Plane

            |
            |

    Home Node ---- Office Node

            |
           DSH

            |
    Agent Runtime

Each node executes locally.

------------------------------------------------------------------------

# 7. Execution Policy

Recommended priority:

    Local
     |
    Subscription
     |
    External Specialist
     |
    Paid API

Default roles:

-   Codex: architecture, planning, review
-   Codely: implementation
-   Local model: classification and context tasks

------------------------------------------------------------------------

# 8. Implementation Roadmap

## Phase 0

Foundation:

-   DSH project initialization
-   Task model
-   Session model
-   Event store

Acceptance:

-   create task
-   replay session

## Phase 1

Agent Integration Layer:

-   provider interface
-   ACP client
-   capability manifest

## Phase 2

Subscription Support:

-   Codex subscription provider
-   Codely subscription provider

## Phase 3

External Agent Support:

-   ACP client
-   Codex adapter
-   Codely adapter

## Phase 4

Workflow:

-   planner
-   executor
-   reviewer
-   approval

## Phase 5

Memory:

-   storage
-   retrieval
-   context building
-   compaction

## Phase 6

Distributed Execution:

-   GitHub control repository
-   self-hosted runner
-   checkpoint recovery

# Final Principles

DSH owns orchestration.

Agent owns reasoning.

ACP connects external agents.

Provider connects models.

Task owns goals.

Session owns history.

Memory owns knowledge.

Workflow owns execution.
