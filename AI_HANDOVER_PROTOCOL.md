# ALISHANAPP — MANDATORY AI HANDOVER PROTOCOL

> **Applies to:** Every AI assistant, coding agent, developer, reviewer, and contributor working on AlishanApp.  
> **Mandatory companion document:** `PROJECT_SOURCE_OF_TRUTH.md`  
> **Rule:** These instructions must be followed for every future task, not only the current Export Center and Settings work.

---

## 1. Before starting any task

Every AI/developer must:

1. Read the complete `PROJECT_SOURCE_OF_TRUTH.md`.
2. Read this complete `AI_HANDOVER_PROTOCOL.md`.
3. Inspect the actual source files relevant to the task.
4. Identify the exact user-approved scope and the related Pending Work Tracker entry.
5. Check existing code paths, data structures, calculations, storage, dependencies, and UI before proposing a change.
6. Identify locked decisions and avoid changing them without explicit user approval.
7. Report conflicts, missing files, or uncertainty before making assumptions.

**Do not begin coding based only on a chat summary when the project files and source-of-truth documents are available.**

---

## 2. Mandatory status rules

Use only these statuses:

- `PENDING` — approved work not yet implemented in the delivered source.
- `IN PROGRESS` — currently being worked on.
- `IMPLEMENTED — NOT VERIFIED` — code changed, but required verification is incomplete.
- `COMPLETED` — delivered source contains the change and required verification passed.
- `BLOCKED` — a documented dependency or issue prevents progress.
- `SUPERSEDED` — an old decision has been replaced; its history must remain.

### Never mark work Completed when

- only a plan or prompt exists;
- code was merely shown in a chat response;
- the changed source files were not delivered;
- the implementation was not checked against the requirement;
- required tests were not run;
- the result is only partially implemented;
- a feature is a mockup, placeholder, or non-functional control.

If updated source files have not been delivered to the user, the task must not be marked `COMPLETED`.

### Partial completion

If only part of a task is finished:
- record the implemented portion as `IMPLEMENTED — NOT VERIFIED` or `COMPLETED`, depending on evidence;
- create or retain a separate `PENDING` entry for the unfinished portion;
- never mark the entire task complete merely because one part works.

---

## 3. Scope protection — no unrelated changes

1. Implement only what the user asked for or explicitly approved.
2. Do not redesign unrelated pages.
3. Do not rename unrelated files, functions, IDs, CSS classes, database fields, or APIs.
4. Do not change calculations, conversion rules, data formats, permissions, or persistence behavior unless the request requires it and the user has approved it.
5. Do not add dependencies or change architecture without approval.
6. Do not remove existing features just because they appear unused. Inspect references and behavior first.
7. Preserve existing working functionality.
8. If an additional issue is discovered, document it separately as Pending and ask before expanding scope.

---

## 4. Source of Truth and decision history

- `PROJECT_SOURCE_OF_TRUTH.md` is the authoritative project requirements and decision record.
- This protocol is mandatory for all contributors.
- If code conflicts with a locked requirement, do not silently choose one. Report the conflict and ask for a decision unless the task explicitly directs a compatible fix.
- Do not delete historical requirements or change records.
- Never silently overwrite a locked decision.
- To change a locked decision:
  1. Preserve the original entry.
  2. Mark it `SUPERSEDED`.
  3. Record `Replaced By`, `Date`, and `Reason`.
  4. Add a new uniquely identified decision.
  5. Link the new decision to the old one using `Replaces`.
- Append new change-history entries chronologically.

---

## 5. Required workflow for every coding task

### Phase A — Understand
- Read the relevant documentation and source.
- Identify the exact files and code paths involved.
- Understand existing behavior before changing it.
- List acceptance criteria.
- Identify possible regression risks.

### Phase B — Plan
- Give a concise implementation plan.
- List files expected to change.
- Identify data migration, calculation, storage, permission, and compatibility risks.
- Keep the plan within the approved scope.

### Phase C — Implement
- Make the smallest complete change that satisfies the request.
- Follow existing project patterns unless they conflict with an approved requirement.
- Do not insert fake controls or claim non-functional UI is complete.
- Handle errors and edge cases relevant to the change.
- Preserve user data and existing records.

### Phase D — Verify
Run the checks relevant to the change and report the exact results. Examples:
- JavaScript syntax checks
- HTML structure and duplicate-ID checks
- Type checks / linting / build
- Unit or integration tests
- Data and calculation checks
- Persistence and migration checks
- Browser/runtime checks
- Mobile and desktop layout checks
- Regression checks on related pages

Do not report a test as passed if it was not actually run. Clearly distinguish:
- static checks;
- mocked tests;
- automated tests;
- actual browser/runtime tests;
- manual user acceptance testing.

### Phase E — Handover
Deliver:
- updated source files or complete project archive, as applicable;
- list of changed files;
- summary of behavior changes;
- tests actually run and their results;
- known limitations and untested cases;
- remaining Pending items;
- updated `PROJECT_SOURCE_OF_TRUTH.md`;
- updated `AI_HANDOVER_PROTOCOL.md` only if the protocol itself changed.

---

## 6. Documentation update rules

Every change must be documented in the same task/handover.

For each change, record:
- unique change ID;
- date;
- status;
- user requirement;
- old problem;
- new behavior;
- reason for change;
- files changed;
- data/calculation-flow impact;
- tests required;
- tests actually run and results;
- known limitations;
- related Pending item.

### Pending-to-Completed transition

When work is finished:
1. Locate the matching Pending entry.
2. Preserve the original requirement and history.
3. Record the delivered source version/date.
4. List the actual modified files.
5. Record the verification evidence.
6. Mark it `COMPLETED` only if all completion criteria pass.
7. If something remains, keep or create a separate Pending entry.

Never convert an item to Completed based on an AI's verbal assurance alone.

---

## 7. Required handover report format

Every AI/developer must provide a report in this structure:

### Task
- Task ID:
- User-approved scope:
- Starting status:

### Source inspection
- Files inspected:
- Existing behavior found:
- Relevant locked decisions:

### Implementation
- Files changed:
- Changes made:
- Changes deliberately not made:

### Verification
- Commands/checks actually run:
- Results:
- Browser/runtime testing:
- Mobile/desktop testing:
- Untested areas:

### Documentation
- Source of Truth updated: Yes/No
- Pending Tracker updated: Yes/No
- Change history appended: Yes/No

### Final status
- PENDING / IN PROGRESS / IMPLEMENTED — NOT VERIFIED / COMPLETED / BLOCKED
- Remaining work:
- Known limitations:

### Delivered files
- Exact filenames:
- Archive name, if one was actually created:
- Confirm that the delivered files exist and are accessible.

---

## 8. Current assigned pending work

The next AI receiving the project must start by reviewing these pending items in `PROJECT_SOURCE_OF_TRUTH.md`:

1. `ALISHAN-PEND-2026-11-04-001` — Home Advanced Export Center.
2. `ALISHAN-PEND-2026-11-04-002` — Settings cleanup and organization.
3. `ALISHAN-PEND-2026-11-04-003` — Export restore and backup safety.
4. `ALISHAN-PEND-2026-11-04-004` — Export and backup advanced capabilities.
5. `ALISHAN-PEND-2026-11-04-005` — Regression and runtime verification for v73 work.

These items are recorded as `PENDING` because the updated source files for the discussed v73 changes have not yet been delivered to the user as a completed verified project. Treat the descriptions as requirements to inspect and implement, not as evidence that the code already contains them.

The next AI must inspect the supplied source version first. If some of these features are already present in the supplied code, audit them against the requirements, test them, and document the evidence instead of duplicating them.

---

## 9. Rules for blockers and uncertainty

- If a required source file is missing, say exactly which file is missing.
- If the environment cannot create an archive or file, do not claim it was created.
- If a test cannot be run, mark it untested and explain why.
- If a requirement is ambiguous, ask one focused question.
- If an implementation is blocked, retain `BLOCKED` or `PENDING` and record the dependency.
- Never hide failures, warnings, incomplete behavior, or known limitations.

---

## 10. Protocol changes

This protocol itself may be changed only when the user explicitly approves the change.

When changed:
- preserve the previous rule/history;
- append a dated protocol change entry;
- explain what changed and why;
- do not silently weaken mandatory status, verification, scope, or history-preservation rules.

---

## 11. Mandatory acknowledgement for every new AI

Before coding, the AI must confirm in its own task plan that it will:
- follow both Markdown documents;
- inspect the actual source;
- stay within the approved scope;
- preserve old decisions and history;
- keep unimplemented work Pending;
- mark work Completed only after delivery and verification;
- update documentation and provide a complete handover.

This acknowledgement does not itself prove compliance. The final delivered code and documentation must demonstrate compliance.

---

## 12. Append-only protocol history

Add protocol changes below. Never delete prior entries.

### Initial protocol — 2026-11-04
- Established mandatory compliance for every AI/developer working on AlishanApp.
- Established explicit work statuses and evidence-based Pending-to-Completed transition.
- Established scope protection, append-only decision history, testing transparency, and mandatory handover report.


---

## 13. Implementation status correction — 2026-11-04

The list in Section 8 is the original assignment snapshot created before the v73 source changes were made. Preserve it as historical context; the current status is now governed by `PROJECT_SOURCE_OF_TRUTH.md` Section 7.

Current status in the delivered source:
- `ALISHAN-PEND-2026-11-04-001` — `IMPLEMENTED — NOT VERIFIED` (Home Advanced Export Center).
- `ALISHAN-PEND-2026-11-04-002` — `IMPLEMENTED — NOT VERIFIED` (Settings cleanup and five-section navigation).
- `ALISHAN-PEND-2026-11-04-003` — `IMPLEMENTED — NOT VERIFIED` (ZIP restore, checksum validation, and full pre-restore safety snapshot).
- `ALISHAN-PEND-2026-11-04-004` — `PENDING` (incremental backups, backup comparison, and additional retention/scheduling capabilities).
- `ALISHAN-PEND-2026-11-04-005` — `PENDING` (real browser, mobile, ZIP round-trip, and regression verification).

Do not mark the first three items `COMPLETED` until the required real-browser checks are performed and the results are recorded.


## 14. Append-only implementation history — 2026-11-05

### Data-driven Export Center filters
- Replaced manual text entry for record-backed filters with options populated from saved application records.
- Added dependent Quality Type → Quality → Colour selections, date presets, a live matching-quality count, and Clear all filters.
- Status is `IMPLEMENTED — NOT VERIFIED`; do not mark complete until browser interaction and resulting exports are tested and recorded in `PROJECT_SOURCE_OF_TRUTH.md`.
- All prior protocol requirements remain unchanged.

---

## 15. ZIP version rule — 2026-11-06 (added; nothing above was changed)

Every delivered update must change the version of the project ZIP file.

1. Name: `AlishanApp-v<NN>-<Short-Description>.zip`. `<NN>` is the previous version + 1. Never reuse, skip or keep an old number.
2. The same task adds a line to the Version log (section 10 of `PROJECT_SOURCE_OF_TRUTH.md`): version, file name, date, change IDs, summary.
3. A documentation-only change is also an update and also gets a new version.
4. The handover report (section 7) must state the new ZIP file name.
5. Reason: so the owner can always tell which ZIP is newest and which change IDs it contains.

---

## 16. Phone check — 2026-11-08 (added; nothing above was changed)

Any task that changes a screen must look at that screen in a real browser at 390, 360 and 320 px wide before delivery (script tests cannot see layout). The handover report must say what was looked at and what was not. See rule 9 in section 0 of `PROJECT_SOURCE_OF_TRUTH.md` for the CSS rules learned from v74–v77.

