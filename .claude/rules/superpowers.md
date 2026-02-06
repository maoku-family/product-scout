# Superpowers Workflow

Always follow the superpowers skill pipeline. If a skill might apply (even 1% chance), invoke it.

## Complete Workflow

```
User Request
    ↓
1. brainstorming (new features/ideas)
    → Output: docs/plans/YYYY-MM-DD-<topic>-design.md
    → Sync to Notion: Design Doc
    ↓
2. using-git-worktrees (isolate work)
    → Create isolated workspace for implementation
    ↓
3. writing-plans (create execution plan)
    → Output: docs/plans/YYYY-MM-DD-<feature-name>.md
    → Sync to Notion: Create new plan page under product-scout
    ↓
4. Choose execution method:
   A) subagent-driven-development (same session)
      - Fresh subagent per task
      - Two-stage review: spec compliance → code quality
      - Subagents use test-driven-development internally

   B) executing-plans (separate session)
      - Batch execution with human checkpoints
      - Use test-driven-development for each task
      - Use systematic-debugging when tests fail
    ↓
5. finishing-a-development-branch
    → Verify tests → Present options (merge/PR/keep/discard)
    ↓
6. Update Notion documentation
    → Design Doc: scope/requirement changes
    → Architecture Doc: tech stack/pattern changes
```

## Notion Documentation

**Before writing code**, read:
- [Design Doc](https://www.notion.so/2fd63f4877fd812b9877f00874bb81aa) - requirements, data flow, scope
- [Architecture Doc](https://www.notion.so/2ff63f4877fd81cbb45ec15d9115d02f) - tech stack, patterns, structure

**After completing features/milestones**, update both docs with any changes.

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
4. **Document to Notion** - brainstorming and plans sync to Notion
5. **Never skip TDD** - tests first, then implementation
