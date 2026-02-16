---
name: git-commit
description: Create conventional commits and optionally push to remote. Use when the user asks to commit changes, stage selected files, write a commit message, or push the current branch.
---

# Git Commit

Create a conventional commit from current repository changes and optionally push.

## Workflow

### 1. Check repository state

Run:

- `git rev-parse --is-inside-work-tree`
- `git status --porcelain`

If not a repository, report:
`Error: Not a git repository. Run git init first.`

If there are no changes, report:
`No changes to commit. Working tree is clean.`

### 2. Stage changes

If nothing is staged but working tree has changes, ask the user how to stage:

- `All` -> `git add -A`
- `Modified only` -> `git add -u`
- `Select files` -> stage only specified paths

Re-run `git status --porcelain` and confirm staged entries.

### 3. Review context

Run:

- `git log --oneline -5`
- `git diff --cached --stat`

Run `git diff --cached` only when detailed review is needed.

### 4. Build commit message

Collect:

- `type` (required): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- `scope` (optional)
- `description` (required, imperative, no trailing period, target <= 50 chars)
- `body` (optional, explain why/what)
- `breaking change` footer (optional): `BREAKING CHANGE: <details>`

### 5. Commit

Use non-interactive commit creation.

Example:

```bash
git commit -m "fix(api): handle empty trade list" -m "Avoid 500 error when no positions exist." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Verify with `git log -1 --oneline`.

### 6. Push (optional)

Run `git remote -v`.

If no remote exists, report:
`No remote configured. Commit created locally.`

If remote exists, ask user whether to push.

If yes:

- Run `git status -sb`
- If upstream exists: `git push`
- If no upstream: `git push -u origin <branch>`

Report commit hash and push status.

## Validation rules

Before commit, enforce:

1. `type` must be one of allowed values
2. Subject uses imperative mood
3. Subject has no trailing period
4. Warn when subject > 50 chars; treat > 72 as invalid
5. Include `Co-Authored-By: Claude <noreply@anthropic.com>`

## Error handling

- Hook failure: stop and show hook output
- Push rejected: suggest `git pull --rebase` then push
- No upstream branch: suggest `git push -u origin <branch>`
- Nothing staged: ask whether to stage additional files or abort
