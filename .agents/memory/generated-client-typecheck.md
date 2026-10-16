---
name: Generated client typecheck
description: TypeScript library settings needed by Orval-generated browser clients.
---

Orval-generated fetch clients can use `Headers.entries()`, which requires the `dom.iterable` library alongside `dom` during TypeScript builds.

**Why:** The generated client typechecks can fail even when codegen itself succeeds if the shared client library omits iterable DOM types.

**How to apply:** When a generated browser client reports that `Headers.entries()` is missing, add `dom.iterable` to that library's `compilerOptions.lib` rather than editing generated output.