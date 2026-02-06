# Superpowers Workflow

Always follow the superpowers skill pipeline. If a skill might apply (even 1% chance), invoke it.

## Complete Workflow

```
User Request
    ↓
0. Read docs/design.md and docs/architecture.md
    ↓
1. brainstorming (new features/ideas)
    → Output: docs/plans/YYYY-MM-DD-<topic>-design.md
    → Sync to Notion: product-scout/Designs/
    ↓
2. using-git-worktrees (isolate work)
    → Create isolated workspace for implementation
    ↓
3. writing-plans (create execution plan)
    → Output: docs/plans/YYYY-MM-DD-<feature-name>.md
    → Sync to Notion: product-scout/Plans/
    ↓
4. Choose execution method:
   A) subagent-driven-development (recommended, same session)
      - Fresh subagent per task
      - Two-stage review: spec compliance → code quality
      - Subagents use test-driven-development internally

   B) executing-plans (separate session, when needed)
      - Batch execution with human checkpoints
      - Use when tasks are tightly coupled
      - Or when you want more manual control
    ↓
5. finishing-a-development-branch
    → Verify tests → Present options (merge/PR/keep/discard)
    ↓
6. Update documentation
    → Local: docs/design.md, docs/architecture.md
    → Notion: product-scout/Design, product-scout/Architecture
```

## Key Skills

| Skill | When to Use |
|-------|-------------|
| brainstorming | New features, before any implementation |
| using-git-worktrees | Isolate feature work from main |
| writing-plans | Have requirements, need execution plan |
| subagent-driven-development | Execute plan in same session |
| executing-plans | Execute plan in separate session with checkpoints |
| test-driven-development | Writing any code (RED-GREEN-REFACTOR) |
| systematic-debugging | Bugs, test failures, unexpected behavior |
| requesting-code-review | After major implementation |
| verification-before-completion | Before claiming work is done |
| finishing-a-development-branch | Complete and merge/PR work |

## Rules

1. **Invoke skills before responding** - even for clarifying questions
2. **Announce which skill you're using** - "I'm using [skill] to [purpose]"
3. **Follow skills exactly** - especially rigid ones (TDD, debugging)
4. **Sync to Notion** - any docs/ changes must sync to Notion
5. **Never skip TDD** - tests first, then implementation
