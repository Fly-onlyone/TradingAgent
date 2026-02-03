---
name: commit
description: Create a conventional commit and push to GitHub
command-type: prompt
allowed-tools: Bash, Grep, AskUserQuestion
---

# Commit Command

Create a conventional commit and optionally push to GitHub.

## Workflow

### Step 1: Check Git Status

Run `git status --porcelain` to detect changes.

**If no changes**: Report "No changes to commit. Working tree is clean." and exit.

**If changes exist**: Categorize into:
- Staged (A/M in first column)
- Modified (M in second column)
- Untracked (??)

### Step 2: Stage Changes

If nothing staged but changes exist, use `AskUserQuestion` with options:
- **All** - Stage all changes (`git add -A`)
- **Modified only** - Stage only modified tracked files (`git add -u`)
- **Select files** - Let user specify which files

Run the appropriate `git add` command.

### Step 3: Review Context

Run `git log --oneline -5` to show recent commit style for consistency.
Run `git diff --cached --stat` to show what will be committed.

### Step 4: Build Commit Message

Use `AskUserQuestion` for each component:

**4a. Commit Type** (required)

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies |

**4b. Scope** (optional)
Component or module name. Leave empty if not applicable.

**4c. Description** (required)
Short description in imperative mood ("add" not "added"). Keep under 50 characters.

**4d. Body** (optional)
Longer explanation of what and why (not how). Wrap at 72 characters.

**4e. Breaking Change** (optional)
If yes, add `BREAKING CHANGE:` footer with description.

### Step 5: Create Commit

Build message format:
```
<type>(<scope>): <description>

<body>

<footer>
Co-Authored-By: Claude <noreply@anthropic.com>
```

Execute using heredoc for proper formatting:
```bash
git commit -m "$(cat <<'EOF'
<constructed message>
EOF
)"
```

Verify with `git log -1 --oneline`.

### Step 6: Push to Remote

Check remote: `git remote -v`

If remote exists, ask: "Push to remote?"

If yes:
- Check if branch tracks upstream: `git status -sb`
- If tracking: `git push`
- If not tracking: `git push -u origin <branch>`

Report final status with commit hash.

## Error Handling

| Condition | Response |
|-----------|----------|
| Not a git repo | "Error: Not a git repository. Run `git init` first." |
| No changes | "Nothing to commit. Working tree is clean." |
| Commit hook fails | Report hook output, suggest fixes |
| Push rejected | "Push rejected. Pull latest changes: `git pull --rebase`" |
| No upstream | Suggest `git push -u origin <branch>` |
| No remote | "No remote configured. Commit created locally." |

## Validation Rules

1. Type must be: feat, fix, docs, style, refactor, perf, test, chore
2. Subject line under 72 characters (warn if over 50)
3. Use imperative mood ("add" not "added")
4. No period at end of subject
5. Always include Co-Authored-By line
