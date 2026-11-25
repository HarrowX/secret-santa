---
name: commit-and-todo
description: Use after completing any task or subtask in the secret-santa project to commit the change and mark it in ToDo.md. Triggers include "готово", "закомить", "отметь в ToDo", and finishing an implementation or design step.
---

# Commit and ToDo workflow

Use ONLY in the secret-santa project. Every completed task or subtask ends with a commit and an updated `ToDo.md`.

## Rules

1. Finish one logical subtask at a time. Do not combine unrelated changes in one commit.
2. Verify the subtask before committing:
   - run `npm run build` for frontend changes;
   - smoke-test the dev server when the UI changes;
   - run any existing lint or test command if one is configured.
3. Update `ToDo.md` in the same subtask:
   - change `- [ ]` to `- [x]` only when the item is actually complete;
   - if only a mock or prototype is complete, add the word "прототип" to the item instead of claiming production readiness;
   - if the item is partially complete, keep it unchecked and add a remaining subitem.
4. Stage only files that belong to the subtask.
5. Before committing, inspect `git status`, `git diff --cached` and `git log --oneline -3`.
6. Commit with a concise conventional message: `feat:`, `fix:`, `style:`, `docs:` or `chore:`.
7. After committing, confirm `git status --short` is clean before starting the next subtask.
8. If the ToDo update belongs to the same subtask, include it in that commit. Otherwise make a separate `docs: update todo` commit.
9. If an opencode config, agent or skill file changed, remind the user to restart opencode.

## Checklist

- [ ] Verification command passed
- [ ] `ToDo.md` reflects the finished subtask
- [ ] Only intended files staged
- [ ] Commit created
- [ ] Working tree clean
