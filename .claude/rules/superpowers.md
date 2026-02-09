# Superpowers Workflow

Always follow the superpowers skill pipeline. If a skill might apply (even 1% chance), invoke it.

## Complete Workflow

```
User Request
    ↓
0. Read docs/design.md and docs/architecture.md
    ↓
1. brainstorming (new features/ideas)
    → Output: docs/designs/<feature>-design.md
    → Sync to Notion: product-scout/Designs/
    ↓
2. Create branch docs/<feature> from main
    → Commit + push design doc
    ↓
3. writing-plans (create execution plan)
    → Output: docs/plans/<feature>-plan.md
    → Sync to Notion: product-scout/Plans/
    → Commit + push plan doc
    ↓
4. Create PR (docs/<feature> → main)
    → Claude summarizes design + plan in PR description
    → Wait for human approve
    → Merge PR
    ↓
5. Create branch feat/<feature> from main
    → using-git-worktrees if needed
    ↓
6. Choose execution method:
   → Create: docs/plans/<feature>-progress.md
   → Sync to Notion: product-scout/Plans/
   → Update progress after each task completes

   A) subagent-driven-development (recommended, same session)
      - Fresh subagent per task
      - Two-stage review: spec compliance → code quality
      - Subagents use test-driven-development internally

   B) executing-plans (separate session, when needed)
      - Batch execution with human checkpoints
      - Use when tasks are tightly coupled
      - Or when you want more manual control
    ↓
7. finishing-a-development-branch
    → Verify tests → Present options (merge/PR/keep/discard)
    ↓
8. Update documentation
    → Review implementation, capture new insights and decisions
    → docs/architecture.md: module responsibilities, data flow, technical decisions
    → docs/design.md: mark completed items, update changed decisions, document trade-offs
    → Sync to Notion: product-scout/Architecture, product-scout/Design
```

## Key Skills

| Skill | When to Use |
|-------|-------------|
| brainstorming | New features, before any implementation |
| writing-plans | Have requirements, need execution plan |
| using-git-worktrees | Isolate feature work from main |
| subagent-driven-development | Execute plan in same session |
| executing-plans | Execute plan in separate session with checkpoints |
| dispatching-parallel-agents | 2+ independent tasks with no shared state |
| test-driven-development | Writing any code (RED-GREEN-REFACTOR) |
| systematic-debugging | Bugs, test failures, unexpected behavior |
| requesting-code-review | After major implementation |
| verification-before-completion | Before claiming work is done |
| finishing-a-development-branch | Complete and merge/PR work |

## Rules

1. **Invoke skills before responding** - even for clarifying questions
2. **Announce which skill you're using** - "I'm using [skill] to [purpose]"
3. **Follow skills exactly** - especially rigid ones (TDD, debugging)
4. **Sync to Notion** - every commit + push that touches docs/ must immediately sync the changed files to their corresponding Notion pages
5. **Never skip TDD** - tests first, then implementation
