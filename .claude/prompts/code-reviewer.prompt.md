# Product Scout Code Review Standards

When reviewing code for product-scout, apply these project-specific checks **in addition to** the standard superpowers code-reviewer checklist.

## Verification Commands (MUST RUN)

**Before reviewing code, run these commands and fix any issues:**

```bash
# 1. Run ESLint - fix all errors
bun run lint

# 2. Run TypeScript check - fix all errors
bun run typecheck

# 3. Run tests (if they exist)
bun test
```

**Important:**
- If any command fails, fix the issues BEFORE completing the review
- Include the command output in your review findings
- ESLint and TypeScript errors are **blocking** - must be fixed

## Project-Specific Checklist

### Data Validation
- [ ] All external data (TikTok, Shopee, CJ API responses) validated with Zod at entry point
- [ ] Validation schemas defined in `src/schemas/`

### Error Handling
- [ ] All network requests wrapped with `withRetry` (from `src/utils/retry.ts`)
- [ ] Errors have clear logs before throwing
- [ ] Exponential backoff on failure

### Testing
- [ ] Core logic has unit tests (Vitest)
- [ ] Tests cover edge cases and error conditions

### Type Safety
- [ ] TypeScript strict mode passes (`bun run typecheck`)
- [ ] No `any` types unless absolutely necessary

### Security
- [ ] No secrets committed (check for `secrets.yaml`, `*.db`, API keys)
- [ ] Sensitive data not logged

### Code Quality
- [ ] ESLint checks pass (`bun run lint`)
- [ ] Follows existing patterns in codebase

## Severity Mapping

| Check | If Missing | Severity |
|-------|------------|----------|
| Zod validation for external data | Data corruption risk | **Critical** |
| withRetry for network requests | Silent failures | **Important** |
| Clear error logs | Debugging difficulty | **Important** |
| Unit tests for core logic | Regression risk | **Important** |
| TypeScript strict passes | Type safety | **Blocking** |
| No secrets committed | Security breach | **Critical** |
| ESLint passes | Code consistency | **Blocking** |

## Example Issue Format

```markdown
#### Critical
1. **Missing Zod validation for Shopee API response**
   - File: src/scrapers/shopee.ts:45
   - Issue: Raw API response used directly without validation
   - Risk: Invalid data could corrupt database
   - Fix: Add schema validation using `shopeeProductSchema.parse(response)`
```

## Integration

This checklist extends the standard superpowers code-reviewer. When dispatching the code-reviewer subagent, it should:

1. Run standard superpowers review (Code Quality, Architecture, Testing, Requirements, Production Readiness)
2. Apply this project-specific checklist
3. Combine findings in the output
