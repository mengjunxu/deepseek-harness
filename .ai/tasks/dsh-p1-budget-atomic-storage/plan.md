# Plan

- [x] Step 1: reproduce the stale-cache problem, audit storage transactions and define the smallest atomic backend/domain operation.
- [x] Step 2: implement SQLite atomic modification and domain consumption with focused rollback/concurrency tests.
- [x] Step 3: verify cross-process topology, update owner/API docs and generated artifacts, run relevant checks and checkpoint.

# Verification

Focused storage/domain tests, deterministic stale-owner regression, rollback and schema-rejection evidence, independent-process contention through supported test launch paths, typecheck/build, owner documentation pairing and documentation gates. No LLM or GUI behavior changes in this foundation.
