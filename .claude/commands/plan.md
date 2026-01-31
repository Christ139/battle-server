# Plan: $ARGUMENTS

**This command implements the workflow defined in `RULES.md`.** In case of conflict, RULES.md wins. 

---

## MANDATORY PRE-WORK

### Step 1: Read Learnings
```bash
cat .claude/docs/learning/master_learnings.md
```
Do NOT repeat previous mistakes.

### Step 2: Read Violations
```bash
cat .claude/docs/reasoning/violations.md
```
**Review the "Violation Patterns" table. Do NOT repeat known patterns.**
- If your approach could trigger a known pattern → STOP and redesign

### Step 3: Search Existing Plans
```bash
ls .claude/docs/plans/
grep -ri "{relevant keywords}" .claude/docs/plans/
```

**If similar plan exists:**
1. Read it
2. Summarize for user
3. Ask: "Found existing plan: {name}. Continue with this or create new?"
4. STOP and wait for user response

---

## STEP 4: CLASSIFY REQUEST (REQUIRED)

**Analyze $ARGUMENTS and classify:**

| Type | Indicators |
|------|------------|
| 🐛 **Bug** | "not working", "broken", "error", "crash", "wrong", "fails", regression |
| ✨ **New Feature** | "add", "create", "implement", "new", "build", doesn't exist yet |
| 🔧 **Modify Feature** | "change", "update", "improve", "refactor", existing feature adjustment |

**State classification explicitly:**
```
Classification: {🐛 Bug | ✨ New Feature | 🔧 Modify Feature}
Confidence: {High | Medium | Low}
Reasoning: {1 sentence}
```

**If confidence is Low:** Ask user to clarify before proceeding.

**Route:**
- 🐛 Bug → Go to **PHASE A: DEBUG PATH**
- ✨ New Feature → Go to **PHASE B: FEATURE PATH**
- 🔧 Modify Feature → Go to **PHASE B: FEATURE PATH**

---

# 🐛 PHASE A: DEBUG PATH

## A1: Invoke Systematic Debugging Skill (REQUIRED)

Per RULES.md, bugs require the systematic-debugging skill:

```
Invoking superpowers:systematic-debugging...

Topic: $ARGUMENTS
```

**Show skill output before proceeding.**

## A2: Debug Framework

Follow these steps in order. Document findings for each.

### 1. Reproduce & Observe
- What is the expected behavior?
- What is the actual behavior?
- Steps to reproduce?
- Error messages / stack traces?

### 2. Isolate
- Which layer is involved? (Socket/Manager/Controller/UI/Data)
- Which file(s) likely contain the bug?
- When did it last work? (if known)

### 3. Hypothesize
- List 3+ possible causes ranked by likelihood
- Check against learnings (common mistakes)
- Check against violations (known patterns)

### 4. Test Hypotheses
- Start with most likely cause
- Add targeted logging/breakpoints
- Verify one hypothesis at a time

### 5. Root Cause
- Confirm root cause before fixing
- Document why it happened

### 6. Proposed Fix
- Minimal fix that addresses root cause
- List files to change

## A3: Present Fix Proposal to User

```
🐛 Bug Analysis Complete

**Issue:** {description}
**Root Cause:** {1 sentence}
**Proposed Fix:** {1 sentence description}
**Files:** {list}
**Risk:** {Low | Medium | High}

Proceed with fix?
```

**STOP and wait for user approval.**

## A4: Implement Fix (ON APPROVAL ONLY)

1. Apply minimal fix
2. Verify fix works
3. Proceed to **PHASE C: CODE REVIEW**

---

# ✨🔧 PHASE B: FEATURE PATH

## B1: Invoke Brainstorm Skill (REQUIRED)

Per RULES.md, features require the brainstorm skill:

```
Invoking superpowers:brainstorm...

Topic: $ARGUMENTS
```

**Show skill output, then use it for B2.**

## B2: Brainstorm Analysis

Using the skill output, think through:

1. Which layer(s) affected?
2. Which manager owns this? (check existing boundaries)
3. Any new socket events? (need contracts)
4. What are 3+ possible approaches?
5. What's the simplest solution?
6. What could go wrong? (check learnings AND violations)
7. Edge cases and failure modes?
8. **Does any approach risk a known violation pattern?** → Reject it

**Output:** Summary of brainstorm findings.

## B3: Write Plan

Using brainstorm output, create plan following the PLAN FORMAT at end of this file.

**Before finalizing, verify:**
- [ ] Plan does NOT repeat any violation patterns from Step 2
- [ ] Plan addresses risks identified in brainstorm
- [ ] Plan is under 100 lines

## B4: Architect Review (REQUIRED - BEFORE USER SEES PLAN)

**BEFORE presenting to user**, invoke `unity-architect`:

```
unity-architect, please review this plan:

{paste your complete plan}
```

**You MUST show the architect's response:**
```
Invoking unity-architect...

[PASTE FULL ARCHITECT RESPONSE HERE]
```

- If "✅ ARCHITECT APPROVED" → Proceed to B5
- If "⚠️ CHANGES REQUESTED" → Revise plan, resubmit to architect, show new response
- **DO NOT proceed to user without architect approval and shown response**

## B5: Present Plan to User

**ONLY after architect approves (response shown above):**

```
✅ Plan ready for review

**Plan:** {name}
**Type:** {✨ New Feature | 🔧 Modify Feature}
**Architect Review:** ✅ Approved (see above)
**Violations Check:** ✅ No known patterns triggered

## Summary
{3-5 sentence summary}

## Files to Change
{list from plan}

Approve this plan?
```

**STOP and wait for user approval.**

## B6: Execute Plan (ON APPROVAL ONLY)

1. File the plan with document-keeper:
   ```
   document-keeper, please create plan folder for: {plan name}
   ```
   Show response: `[PASTE RESPONSE]`

2. Follow plan steps in order
3. Update plan status: 📋 Planned → 🔄 In Progress
4. Check off each step as completed
5. If blocked, update plan with blocker and notify user
6. When implementation complete → Proceed to **PHASE C: CODE REVIEW**

---

# PHASE C: CODE REVIEW (AFTER IMPLEMENTATION, BEFORE PRESENTING RESULTS)

**This phase runs AFTER code is written, BEFORE presenting completion to user.**

## C1: Code Review (REQUIRED)

Invoke `code-reviewer`:

```
code-reviewer, please review the changes made for: {task description}

Files changed:
{list files}
```

**You MUST show the code-reviewer's response:**
```
Invoking code-reviewer...

[PASTE FULL CODE-REVIEWER RESPONSE HERE]
```

- If "✅ CODE REVIEW COMPLETE" with no violations → Proceed to C2
- If violations found → Fix them, re-run code-reviewer, show new response
- **DO NOT proceed without code-reviewer approval and shown response**

## C2: Contract Validation (IF NETWORKING CODE)

**Skip this step if no networking code was changed.**

Invoke `contract-validator`:

```
contract-validator, please verify the DTOs and socket events for: {task description}

Events/DTOs involved:
{list}
```

**Show response:**
```
Invoking contract-validator...

[PASTE FULL CONTRACT-VALIDATOR RESPONSE HERE]
```

- If "✅ CONTRACT VALIDATION PASSED" → Proceed to C3
- If issues found → Fix them, re-run validator, show new response

## C3: Present Results to User

**ONLY after code-reviewer approves (and contract-validator if applicable):**

```
✅ Implementation Complete

**Task:** {description}
**Classification:** {🐛 Bug | ✨ New Feature | 🔧 Modify Feature}
**Code Review:** ✅ Passed (see above)
**Contract Validation:** {✅ Passed | N/A - no networking}

## Changes Made
{summary of changes}

## Files Modified
{list}

Ready to finalize and document?
```

**STOP and wait for user confirmation.**

---

# PHASE D: DOCUMENTATION (AFTER USER CONFIRMS)

## D1: Document with document-keeper

Invoke `document-keeper`:

```
document-keeper, please:
1. Update plan status to ✅ Complete (if feature)
2. Log any learnings from this task
3. Review CLAUDE.md for needed updates
4. Log any violations that occurred

Task: {description}
Classification: {type}
Files changed: {list}
Learnings: {any patterns discovered}
Violations: {any that occurred, or "None"}
```

**Show response:**
```
Invoking document-keeper...

[PASTE FULL DOCUMENT-KEEPER RESPONSE HERE]
```

## D2: Final Summary

```
✅ Task Complete

**Task:** {description}
**Plan:** {location or N/A for bugs}
**Status:** ✅ Complete

**Agent Reviews:**
- unity-architect: {✅ Approved | N/A - bug fix}
- code-reviewer: ✅ Passed
- contract-validator: {✅ Passed | N/A}
- document-keeper: ✅ Updated

All documentation current.
```

---

## PLAN FORMAT (For Feature Path - Max 100 Lines)

```markdown
# Plan: {Name}

**Status:** 📋 Planned | 🔄 In Progress | ✅ Complete
**Type:** {✨ New Feature | 🔧 Modify Feature}
**Created:** {DATE}

## Problem
{2-3 sentences max}

## Brainstorm Summary
{Key findings - approaches considered, why chosen approach is simplest}

## Solution
- {Bullet point approach}
- {Not paragraphs}

## Files
| File | Action |
|------|--------|
| `path/to/file.cs` | Create/Modify/Delete |

## Socket Events (if any)
| Event | Direction | Contract |
|-------|-----------|----------|
| `event:name` | Server→Client | `contracts/x.contracts.md` |

## Steps
- [ ] 1. {Step}
- [ ] 2. {Step}

## Risks
| Risk | Mitigation |
|------|------------|
| {risk} | {mitigation} |

## Violation Safeguards
| Known Pattern | How This Plan Avoids It |
|---------------|-------------------------|
| {pattern from violations.md} | {specific safeguard} |
```

---

## WORKFLOW SUMMARY

```
┌─────────────────────────────────────────────────────────────┐
│  PRE-WORK (Steps 1-4)                                       │
│  1. Read learnings                                          │
│  2. Read violations                                         │
│  3. Search existing plans                                   │
│  4. Classify request                                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│  🐛 BUG PATH             │   │  ✨🔧 FEATURE PATH           │
│                          │   │                              │
│  A1: systematic-debugging│   │  B1: brainstorm skill        │
│      skill [SHOW OUTPUT] │   │      [SHOW OUTPUT]           │
│  A2: Debug framework     │   │  B2: Brainstorm analysis     │
│  A3: Present to user     │   │  B3: Write plan              │
│      ⏸️ WAIT FOR APPROVAL │   │  B4: unity-architect review  │
│  A4: Implement fix       │   │      [SHOW RESPONSE]         │
│                          │   │  B5: Present to user         │
│                          │   │      ⏸️ WAIT FOR APPROVAL    │
│                          │   │  B6: Execute plan            │
└────────────┬─────────────┘   └──────────────┬───────────────┘
             │                                │
             └──────────────┬─────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE C: CODE REVIEW (after implementation)                │
│                                                             │
│  C1: code-reviewer [SHOW RESPONSE]                          │
│      → Fix any violations, re-run if needed                 │
│  C2: contract-validator (if networking) [SHOW RESPONSE]     │
│  C3: Present results to user                                │
│      ⏸️ WAIT FOR CONFIRMATION                               │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE D: DOCUMENTATION (after user confirms)               │
│                                                             │
│  D1: document-keeper [SHOW RESPONSE]                        │
│      - Update plan status                                   │
│      - Log learnings                                        │
│      - Review CLAUDE.md                                     │
│      - Log violations                                       │
│  D2: Final summary                                          │
└─────────────────────────────────────────────────────────────┘

REQUIRED SKILLS (per RULES.md):
┌─────────────────┬────────────────────────────┐
│ Classification  │ Required Skill             │
├─────────────────┼────────────────────────────┤
│ 🐛 Bug          │ superpowers:systematic-    │
│                 │ debugging                  │
├─────────────────┼────────────────────────────┤
│ ✨ New Feature  │ superpowers:brainstorm     │
├─────────────────┼────────────────────────────┤
│ 🔧 Modify       │ superpowers:brainstorm     │
└─────────────────┴────────────────────────────┘

AGENT INVOCATION RULES:
┌────────────────────┬─────────────────────┬──────────────────┐
│ Agent              │ When                │ Evidence         │
├────────────────────┼─────────────────────┼──────────────────┤
│ unity-architect    │ Before user sees    │ Paste full       │
│                    │ plan (features)     │ response         │
├────────────────────┼─────────────────────┼──────────────────┤
│ code-reviewer      │ After code written, │ Paste full       │
│                    │ before presenting   │ response         │
├────────────────────┼─────────────────────┼──────────────────┤
│ contract-validator │ After code, if      │ Paste full       │
│                    │ networking changed  │ response         │
├────────────────────┼─────────────────────┼──────────────────┤
│ document-keeper    │ After user confirms │ Paste full       │
│                    │ completion          │ response         │
└────────────────────┴─────────────────────┴──────────────────┘

⚠️ NO AGENT RESPONSE = VIOLATION
   You must SHOW each agent's response, not just claim invocation.
```

---

## RULES SUMMARY

| Rule | Required |
|------|----------|
| Read learnings first | ✔ |
| Read violations first | ✔ |
| Search existing plans | ✔ |
| Classify request explicitly | ✔ |
| **superpowers:systematic-debugging for bugs** | ✔ |
| **superpowers:brainstorm for features** | ✔ |
| unity-architect before user sees plan | ✔ (features only) |
| User approval before implementing | ✔ |
| code-reviewer after code, before presenting | ✔ |
| contract-validator if networking | ✔ |
| document-keeper after user confirms | ✔ |
| Show ALL skill outputs and agent responses | ✔ |
| Keep plan under 100 lines | ✔ |
| Follow RULES.md | ✔ |