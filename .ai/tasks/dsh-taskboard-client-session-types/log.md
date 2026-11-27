2026-11-27 客户端构建复现 SessionStore 缺少 scopeOf、binding 等浏览器接口。工作台共享 types.ts 从子代理 Host 入口导入活动分类。
2026-11-27 将 NativeActivityKind 的同一份声明放到已有的 projection-types，并从客户端入口导出。原 Host 类型与根入口仍导出同一类型。先构建 taskboard-controller 声明，再运行 pnpm run build:lib:client，原有 61 个客户端诊断消失，所有客户端包构建完成。类型等价检查已使用新声明位置并通过。
2026-11-27 pnpm run lint、pnpm run doc-sync（42/42）、pnpm exec vitest run packages/api/taskboard-controller/tests/taskboard.host.spec.ts（36/36）及 git diff --check 均通过。
