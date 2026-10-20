---
description: "修复子模块检出中阻止本地 Git 钩子安装的公共 core.worktree 设置。"
---

# 实操手册：修复 Git worktree 配置

[English](repairing-worktree-config.md) | 中文

## 概述

依赖安装或 push 报告 `cannot enable extensions.worktreeConfig while core.worktree is in the common config` 时，可使用此修复。脚本备份当前检出的 Git 配置，将源码目录设置移到 `config.worktree`，并在依赖已存在时重新安装 Lefthook 钩子。脚本不会提交或推送。

## 目录

- [运行修复](#run-the-repair)
- [检查结果](#check-the-result)
- [失败与恢复](#failure-and-recovery)
- [开发备注](#dev-note)

<a id="run-the-repair"></a>
## 运行修复

使用 Git 2.26 或更高版本及本仓库支持的 Node 版本。从主检出运行，且没有注册额外的 linked worktree。先停止其他 Git 配置编辑或依赖安装。两个入口根据脚本自身位置定位仓库，因此也可以从其他目录调用。

Windows，在仓库根目录运行：

```bat
scripts\repair-worktree-config.bat
```

macOS/Linux，在仓库根目录运行：

```sh
sh scripts/repair-worktree-config.sh
```

两个入口均调用 `scripts/install-lefthook.mjs --repair-worktree-config`。此显式修复可在安装依赖前运行；若缺少 Lefthook，会修复 Git 配置并提示安装依赖。普通安装仍保留原有行为，不会自动迁移公共 `core.worktree`。

<a id="check-the-result"></a>
## 检查结果

需要迁移时，输出会显示公共 Git 目录内名为 `dsh-worktree-config-backup-*` 的备份目录。其中包含原始 `config`、原始 `config.worktree`（若存在），以及该文件原先是否存在的记录。修复启用 worktree 专属配置并保留检出路径；依赖就绪时，钩子安装会输出 `sync hooks`。

源码文件及分支不受影响。这些设置与备份属于 Git 本地管理目录，不参与提交。成功迁移后重复运行，不会再生成迁移备份。后续 push 仍会运行正常的 typecheck 钩子。

<a id="failure-and-recovery"></a>
## 失败与恢复

脚本拒绝 linked 检出、已注册的额外 worktree、冲突的既有 worktree 路径，以及钩子安装器拒绝的不安全或自定义配置。应解决诊断指出的冲突，不要删除 Git 元数据。配置迁移失败时，脚本恢复原始文件；恢复失败则报告备份目录。迁移成功后若钩子安装失败，修复后的配置和备份会保留：解决钩子诊断后重新运行修复。

手动恢复时，先停止 Git 配置写入者，从输出的备份目录恢复 `config`。同时恢复备份中的 `config.worktree`；仅当备份记录说明该文件原先不存在时，才移除新建的 `config.worktree`。脚本不会修改全局 Git 设置。

<a id="dev-note"></a>
## 开发备注

`scripts/install-lefthook.spec.ts` 的平台 fixture（测试前置数据）在 POSIX 上执行 shell 入口，在 Windows 上执行批处理入口。共用测试覆盖迁移、备份内容、重复运行、有 linked worktree 时拒绝，以及仓库扩展被拒绝后的恢复。
