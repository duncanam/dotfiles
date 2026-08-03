---
name: todo-workflow
description: >-
  Create, review, and maintain executable TODO.md plans for pi's installed todo
  extension. Use when the user asks for a todo list, checklist, implementation
  plan, autonomous multi-step execution, /todo-enable, /todo-disable, or help
  with the TODO extension; also use proactively when a coding task needs a
  durable ordered plan across several independently verifiable steps. Not for a
  trivial one-step edit or a purely explanatory question.
---

# TODO planning and execution

Pi's installed `todo` extension is a file-driven autonomous runner. It does
**not** create a task queue or expose an LLM tool. The agent creates and updates
a Markdown file (normally `TODO.md`); the user enables the extension with a
slash command. Once enabled, the extension repeatedly schedules the first
unchecked checkbox until all checkboxes are complete.

## Decide whether to create a TODO

Create or update a TODO when any of these apply:

- The user explicitly asks for a todo list, checklist, implementation plan, or
  autonomous execution.
- Work crosses several files, components, or verification stages.
- Progress must survive context compaction or be inspectable by the user.
- The task has multiple independently verifiable milestones.

Do not add planning overhead to a small, obvious, one-step change. If the user
asked only for a plan, write the plan but do not begin implementation.

## Investigate before planning

1. Read an existing `TODO.md` before modifying it. Never silently overwrite
   open work.
2. Read applicable `AGENTS.md` files and inspect enough relevant code,
   configuration, tests, and documentation to make the plan concrete.
3. Identify dependencies, user constraints, required outputs, and realistic
   verification commands.
4. Resolve cheap uncertainties now. If an uncertainty genuinely requires work,
   make its todo produce a concrete decision or artifact rather than saying
   only "investigate."

If an existing TODO contains unrelated open work, reconcile ordering with the
user. The extension processes the first unchecked checkbox in the whole file,
not merely the newest section.

## File contract

The extension recognizes these forms (case-insensitive for `x`):

```markdown
- [ ] open item
- [x] completed item
  - [ ] nested acceptance criterion
```

`*` and `+` bullets also work, but prefer `-` consistently.

Important semantics:

- Every checkbox at every indentation level is actionable.
- The first unchecked checkbox in document order drives the next cycle.
- Checkboxes at the minimum indentation are counted as top-level work items.
- More deeply indented checkboxes are descendants/acceptance criteria of the
  preceding shallower item.
- A top-level item is complete only when its own box and all checkbox
  descendants are checked.
- Indented non-checkbox lines immediately below an item are notes for that
  item. Headings and ordinary prose are not tasks.

Use checkboxes only for requirements that must be completed. Use ordinary
bullets or prose for context, examples, alternatives, and commentary.

## Formulate an executable list

Use this shape:

```markdown
# TODO — <specific outcome>

Goal: <one-sentence end state>

Constraints:
- <non-checkbox constraint>

- [ ] <imperative, independently deliverable milestone>
  - [ ] <observable acceptance criterion>
  - [ ] <specific verification, including a command when known>
- [ ] <next milestone, ordered after its prerequisites>
  - [ ] <observable acceptance criterion>
- [ ] Validate the integrated result
  - [ ] Run `<test/lint/build command>` successfully
  - [ ] Confirm <user-visible or system-level behavior>
```

Quality rules:

- Order items by dependency and execution order.
- Start each top-level item with an action verb and describe an outcome, not an
  activity: prefer "Add request validation to `src/api.ts`" over "Work on
  validation."
- Name relevant files, modules, interfaces, or behaviors when known, but do not
  prescribe an implementation that repository inspection has not justified.
- Preserve every user requirement as an item, criterion, or explicit
  constraint. Do not invent scope.
- Make each top-level item one coherent unit of work that can be implemented
  and verified in an unattended cycle. Split giant milestones; combine
  bookkeeping-level microsteps.
- Give every implementation milestone an observable completion test. Include
  exact commands only when verified from the project.
- Put acceptance criteria beneath the milestone they qualify. Do not use
  nested checkboxes merely as a chronological scratchpad.
- Avoid overlapping items whose completion claims would be ambiguous.
- Put risky migrations or behavior changes after prerequisites and before the
  final integration checks.
- Leave all newly planned work unchecked. Existing checked work stays checked
  only if evidence still supports it.

Before handing off, reread the list and confirm it is complete, ordered,
non-duplicative, actionable, and independently verifiable.

## Execute and maintain the TODO

While working from an enabled TODO:

1. Read the full TODO file before deciding what is current; extension snapshots
   can be abbreviated.
2. Work on the first unchecked checkbox and its containing milestone unless a
   direct user request explicitly changes priority.
3. Treat all nested checkboxes and indented requirements as acceptance
   criteria, not suggestions.
4. Implement the actual requirement and independently verify it.
5. Mark a nested criterion `[x]` only after that criterion has evidence. Mark
   the parent `[x]` last, after every applicable descendant is complete.
6. Use a precise edit that changes only the completed checkbox. Never mass-mark
   a section complete or check boxes merely to advance automation.
7. If discoveries change the work, update the TODO before proceeding: add,
   split, clarify, or reorder open items while preserving completed history.
8. Run the listed verification. A code change existing on disk is not by itself
   proof of completion.

Do not let a passive `[AUTOMATED TODO STATUS]` reminder override a direct user
request. A message headed `[AUTOMATED TODO CYCLE — EXTENSION-SCHEDULED TASK]`
is authorization to begin the current item, never evidence that it is done.

If blocked, leave the item unchecked, add a concise indented `Blocked:` note,
and explain the exact missing input or failed evidence. Do not guess or claim
completion. Because enabled automation will retry open work, tell the user to
run `/todo-disable` when human intervention is needed.

## Operate the extension

These are user-facing extension commands:

```text
/todo-enable                         # use TODO.md in pi's current directory
/todo-enable path/to/PLAN.md         # use another checkbox file
/todo-enable path/to/PLAN.md --idle 30s
/todo                                # show status
/todo-disable                        # stop autonomous scheduling
```

Operational facts:

- Automation starts disabled in every pi session; configuration is
  session-local.
- `/todo-enable` schedules the first cycle and then, after each settled agent
  run, schedules the next open item following the configured grace period.
- The extension always follows the first unchecked checkbox in document order.
- It auto-disables after every checkbox is complete.
- The agent cannot claim a slash command was invoked. After creating a plan,
  report its path and tell the user the exact `/todo-enable ...` command to run
  if they want autonomous execution.
- If the user requested only a plan or checklist, do not pressure them to
  enable automation; simply mention that it is available.

When handing off a new TODO, briefly report the file path, top-level item count,
major assumptions, and the enable command. Do not duplicate the entire file in
the response unless asked.
