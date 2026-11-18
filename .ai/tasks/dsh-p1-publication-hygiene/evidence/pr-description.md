## Human-reviewed duplicate-install-safe Host export

Explicitly approved by the user on 2026-11-15: classify only `@deepseek-ai/dsh-home-paths#defaultDshHome` as duplicate-install-safe. It returns an OS-default path string without shared instance state; a two-module artifact probe preserves its value. Other exports in the package remain outside this exception. The exact entry is applied. Retain this heading in the eventual pull request.

`validateLlmRequestPolicy` remains peer-required because its invalid-policy HarnessError has module-local class identity. The Session manifest must preserve a shared LLM peer rather than installing a private copy.
