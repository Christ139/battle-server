# Enforce Rules Compliance Check

You are being audited for compliance with `RULES.md`. 

**Ground rules for this audit:**
- Do NOT answer from memory
- Do NOT assume actions were taken
- Scroll back and FIND evidence for every claim
- If you cannot find evidence, the answer is NO
- "I think I did" = NO
- "I intended to" = NO
- Only "Here is the evidence: [quote/screenshot]" = YES

---

## PART 0: Agent Invocation Audit (Complete First)

**This part is MANDATORY. Do not proceed to Part 1 until complete.**

List every agent you invoked during this task. Paste evidence.

### unity-architect
- [ ] **Invoked** — Paste response excerpt:
```
[PASTE unity-architect RESPONSE HERE — If empty, mark NOT invoked]
```
- [ ] **Not invoked** — Reason: _______________
- [ ] **N/A** — This was a bug fix, not a plan

### code-reviewer
- [ ] **Invoked** — Paste response excerpt:
```
[PASTE code-reviewer RESPONSE HERE — If empty, mark NOT invoked]
```
- [ ] **Not invoked** — Reason: _______________

### contract-validator
- [ ] **Invoked** — Paste response excerpt:
```
[PASTE contract-validator RESPONSE HERE — If empty, mark NOT invoked]
```
- [ ] **Not invoked** — Reason: _______________
- [ ] **N/A** — No networking code changed

### document-keeper
- [ ] **Invoked** — Paste response excerpt:
```
[PASTE document-keeper RESPONSE HERE — If empty, mark NOT invoked]
```
- [ ] **Not invoked** — Reason: _______________

**STOP. If any required agent was not invoked, you are already NON-COMPLIANT.**
Mark Part 9 as non-compliant and complete remediation before continuing.

---

## PART 1: Pre-Work Compliance

### 1.1 Did you read `RULES.md` BEFORE coding?
- [ ] Yes — Quote something specific you applied: _______________
- [ ] No → **VIOLATION.** Read it now.

### 1.2 Did you read `.claude/docs/reasoning/violations.md` BEFORE coding?
- [ ] Yes — Which patterns did you check for? _______________
- [ ] No → **VIOLATION.** Read it now.

### 1.3 Did you search existing plans?
- [ ] Yes — Search results: _______________
- [ ] No → **VIOLATION.** Search now: `ls .claude/docs/plans/`

### 1.4 Did you classify the request?
| Classification | Selected |
|----------------|----------|
| 🐛 Bug | [ ] |
| ✨ New Feature | [ ] |
| 🔧 Modify Feature | [ ] |

- [ ] Classification stated explicitly in response
- [ ] Classification not stated → **VIOLATION**

### 1.5 Did you invoke the REQUIRED SKILL for your classification?

**If 🐛 Bug:**
- [ ] Invoked `superpowers:systematic-debugging` — Paste output excerpt:
```
[PASTE SKILL OUTPUT HERE]
```
- [ ] Did NOT invoke → **VIOLATION (🟡 Warning)**

**If ✨ New Feature or 🔧 Modify Feature:**
- [ ] Invoked `superpowers:brainstorm` — Paste output excerpt:
```
[PASTE SKILL OUTPUT HERE]
```
- [ ] Did NOT invoke → **VIOLATION (🟡 Warning)**

### 1.6 Did you get user approval BEFORE implementing?
- [ ] Yes — User said: _______________
- [ ] No → **VIOLATION**

---

## PART 2: Code Quality

### 2.1 Are changes as SIMPLE as possible?
- [ ] Yes — Explain why simpler wasn't possible: _______________
- [ ] No → **VIOLATION.** Simplify.

### 2.2 Did you fix ROOT CAUSE (not symptoms)?
- [ ] Yes — Root cause was: _______________
- [ ] No → **VIOLATION.** Find root cause.

### 2.3 Did you avoid adding comments?
- [ ] Yes
- [ ] No, but user requested them
- [ ] No, added without request → **VIOLATION.** Remove.

### 2.4 (If Bug) Did you follow debug framework?
| Step | Evidence |
|------|----------|
| Reproduce & Observe | [ ] Done: _______________ [ ] Skipped |
| Isolate | [ ] Done: _______________ [ ] Skipped |
| Hypothesize (3+) | [ ] Done: _______________ [ ] Skipped |
| Test Hypotheses | [ ] Done: _______________ [ ] Skipped |
| Confirm Root Cause | [ ] Done: _______________ [ ] Skipped |
| Fix & Verify | [ ] Done: _______________ [ ] Skipped |

If any skipped → **VIOLATION**

---

## PART 3: Architecture Compliance

### 3.1 Layer Separation
| Rule | Compliant | Evidence |
|------|-----------|----------|
| UI doesn't call sockets directly | [ ] Yes [ ] No [ ] N/A | _______________ |
| Managers don't update UI directly | [ ] Yes [ ] No [ ] N/A | _______________ |
| Data classes are pure containers | [ ] Yes [ ] No [ ] N/A | _______________ |
| Socket handlers only dispatch | [ ] Yes [ ] No [ ] N/A | _______________ |

If any "No" → **VIOLATION.** Refactor.

### 3.2 DI vs Singleton
| Rule | Compliant |
|------|-----------|
| No mixed patterns (both Instance AND [Inject]) | [ ] Yes [ ] No |
| No fallback to static when DI available | [ ] Yes [ ] No |
| New code uses DI by default | [ ] Yes [ ] No [ ] N/A |

If any "No" → **VIOLATION.** Fix DI.

### 3.3 File Placement
| Type | Correct Location | Evidence |
|------|------------------|----------|
| Network code in `Networking/` | [ ] Yes [ ] No [ ] N/A | _______________ |
| Managers in `Managers/` | [ ] Yes [ ] No [ ] N/A | _______________ |
| DTOs in `Data/` | [ ] Yes [ ] No [ ] N/A | _______________ |
| UI in `UI/` | [ ] Yes [ ] No [ ] N/A | _______________ |

If any "No" → **VIOLATION.** Move files.

---

## PART 4: Networking Compliance

### 4.1 Did changes touch networking code?
- [ ] Yes → Complete 4.2
- [ ] No → Skip to Part 5

### 4.2 Networking Rules
| Rule | Compliant | Evidence |
|------|-----------|----------|
| Used `long` for credits/IDs | [ ] Yes [ ] No | _______________ |
| socket.On has matching Off in OnDestroy | [ ] Yes [ ] No | _______________ |
| Callbacks use MainThreadDispatcher | [ ] Yes [ ] No | _______________ |
| Payload classes in `Data/` | [ ] Yes [ ] No | _______________ |
| Contract exists in `contracts/` | [ ] Yes [ ] No | _______________ |

If any "No" → **VIOLATION.** Fix before proceeding.

---

## PART 5: Unity Lifecycle

| Rule | Compliant | Evidence |
|------|-----------|----------|
| No coroutines started in Awake | [ ] Yes [ ] No [ ] N/A | _______________ |
| No cross-object calls in Awake | [ ] Yes [ ] No [ ] N/A | _______________ |
| Subscriptions have matching unsubscriptions | [ ] Yes [ ] No [ ] N/A | _______________ |
| Async code wrapped in try/catch | [ ] Yes [ ] No [ ] N/A | _______________ |

If any "No" → **VIOLATION.** Fix.

---

## PART 6: Review Phase Verification

**Verify each step was ACTUALLY completed. Paste evidence.**

### Step 1: code-reviewer
- [ ] **DONE** — Agent response shown in Part 0
- [ ] **NOT DONE** → Invoke now, paste response in Part 0

### Step 2: contract-validator (if networking)
- [ ] **DONE** — Agent response shown in Part 0
- [ ] **NOT DONE** → Invoke now, paste response in Part 0
- [ ] **N/A** — No networking changes

### Step 3: document-keeper
- [ ] **DONE** — Agent response shown in Part 0
- [ ] **NOT DONE** → Invoke now, paste response in Part 0

**All review agents must have responses in Part 0 to mark DONE.**

---

## PART 7: Plan Filing Verification (If Feature/Plan)

### 7.1 Was a plan created?
- [ ] Yes → Continue
- [ ] No, but should have been → **VIOLATION**

### 7.2 Plan location
- [ ] Plan exists at: `.claude/docs/plans/___-___/PLAN.md`
- [ ] Plan does NOT exist at expected location → **VIOLATION**

**Verify the file exists:**
```bash
ls -la .claude/docs/plans/{NNN}-{name}/PLAN.md
```
Paste output: _______________

### 7.3 Plan status updated?
- [ ] Status line shows current state (📋/🔄/✅)
- [ ] Status not updated → **VIOLATION**

---

## PART 8: Violation Summary

**If ANY checkbox in Parts 1-7 was marked "No" or any VIOLATION occurred:**

### 8.1 List ALL violations discovered

| Part | Section | Rule Violated | Severity |
|------|---------|---------------|----------|
| | | | 🔴/🟡 |
| | | | 🔴/🟡 |
| | | | 🔴/🟡 |

**Severity Guide:**
- 🔴 **Critical**: False compliance claim, skipped required agent, architecture violation, no user approval
- 🟡 **Warning**: Missing documentation, skipped optional step, minor process deviation

### 8.2 Explanation (Required for each violation)

**Violation 1:** _______________
- What happened: _______________
- Why it happened: _______________
- Evidence of violation: _______________
- How I'm fixing it: _______________

*(Copy for each violation)*

### 8.3 Pattern Check

Cross-reference with `.claude/docs/reasoning/violations.md`:
- [ ] This matches an EXISTING pattern → **RECURRING** 🔴 — Why did existing safeguards fail? _______________
- [ ] This is a NEW violation type

### 8.4 Log the Violation (MANDATORY)

Invoke document-keeper now:
```
document-keeper, please log these violations to violations.md:

Date: {TODAY}
Task: {task name}
Violations:
{paste table from 8.1}

Root Cause Category:
- [ ] Ambiguity (rule unclear)
- [ ] Conflict (rules contradict)  
- [ ] Skipped (capability existed, not used)
- [ ] Missing enforcement (no mechanism)

Remediation Status: ✅ Fixed / 🚧 In Progress / ❌ Not Fixed
```

Paste document-keeper response:
```
[PASTE RESPONSE HERE]
```

---

## PART 9: Compliance Declaration

### Pre-Declaration Acknowledgment (REQUIRED)

Before declaring compliance, state:

> "The following items I am claiming but cannot independently verify in this audit: [list any, or 'None']"
> 
> "The following agents were invoked and their responses are shown in Part 0: [list]"

---

### If NO violations (all Parts 0-7 passed):

**I confirm with evidence:**
- [x] All required agents invoked (responses shown in Part 0)
- [x] RULES.md read before coding (quoted specific application)
- [x] violations.md read before coding (checked for patterns)
- [x] Classification stated explicitly
- [x] User approval obtained before implementation
- [x] Changes are minimal and simple
- [x] Root cause fixed (not symptoms)
- [x] Layer separation maintained (evidence provided)
- [x] Networking rules followed (if applicable, evidence provided)
- [x] Lifecycle safety verified (evidence provided)
- [x] All review agents invoked (responses in Part 0)
- [x] Documentation updated (document-keeper response in Part 0)

✅ **COMPLIANT** — All claims have evidence.

---

### If violations occurred AND fully remediated:

**I confirm:**
- [ ] All violations listed in Part 8.1
- [ ] Each violation explained in Part 8.2
- [ ] Pattern check completed in Part 8.3
- [ ] document-keeper invoked and response shown in Part 8.4
- [ ] All violations fixed (describe fixes): _______________
- [ ] All required agents now invoked (Part 0 complete)

⚠️ **COMPLIANT WITH VIOLATIONS** — Violations logged and fixed. Evidence provided.

---

### If violations NOT fully remediated:

**I confirm:**
- [ ] All violations listed in Part 8.1
- [ ] Each violation explained in Part 8.2
- [ ] document-keeper invoked (response in Part 8.4)
- [ ] Remaining issues: _______________
- [ ] Reason cannot remediate: _______________

🔴 **NON-COMPLIANT** — Requires user decision to proceed.

---

## Self-Assessment Verification Protocol

**When answering ANY checkbox in this audit:**

1. ❌ Do NOT answer from memory
2. ✅ Do scroll back through the conversation
3. ✅ Do FIND the actual action/invocation
4. ✅ Do QUOTE or reference the evidence
5. ✅ THEN mark the checkbox

**Evidence standards:**
- Agent invocation: Paste the agent's response
- File creation: Show file path and `ls` output
- Rule compliance: Quote the code or change
- User approval: Quote user's approval message

**If you cannot find evidence, mark NO.**

---

## Quick Reference

```
AUDIT FLOW:
┌─────────────────────────────────────────┐
│ PART 0: Agent Audit (do first)          │
│ - List all agents invoked               │
│ - Paste their responses                 │
│ - If missing required agents → STOP     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ PARTS 1-5: Rule Compliance              │
│ - Provide evidence for each claim       │
│ - Mark violations immediately           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ PART 6: Review Phase                    │
│ - Verify agents against Part 0          │
│ - If agent not in Part 0 → NOT DONE     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ PART 7: Plan Filing (if applicable)     │
│ - Verify file exists (ls command)       │
│ - Show evidence                         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ PART 8: Violations (if any)             │
│ - List all violations                   │
│ - Invoke document-keeper                │
│ - Paste response                        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ PART 9: Declaration                     │
│ - State what cannot be verified         │
│ - Confirm evidence exists for claims    │
│ - Select appropriate compliance level   │
└─────────────────────────────────────────┘

REQUIRED AGENTS BY TASK:
┌─────────────────┬────────────────────────┐
│ Task Type       │ Required Agents        │
├─────────────────┼────────────────────────┤
│ Plan/Feature    │ unity-architect        │
│                 │ code-reviewer          │
│                 │ document-keeper        │
├─────────────────┼────────────────────────┤
│ Bug Fix         │ code-reviewer          │
│                 │ document-keeper        │
├─────────────────┼────────────────────────┤
│ Networking      │ + contract-validator   │
└─────────────────┴────────────────────────┘

REQUIRED SKILLS BY CLASSIFICATION:
┌─────────────────┬────────────────────────┐
│ Classification  │ Required Skill         │
├─────────────────┼────────────────────────┤
│ 🐛 Bug          │ superpowers:systematic-│
│                 │ debugging              │
├─────────────────┼────────────────────────┤
│ ✨ New Feature  │ superpowers:brainstorm │
├─────────────────┼────────────────────────┤
│ 🔧 Modify       │ superpowers:brainstorm │
└─────────────────┴────────────────────────┘

EVIDENCE REQUIRED:
- "I invoked skill X" → Paste skill output
- "I invoked agent X" → Paste agent's response
- "File exists" → Show ls output  
- "User approved" → Quote approval
- "Rule followed" → Show the code
```