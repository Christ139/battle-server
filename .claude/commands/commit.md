# Git Commit Helper

Review the staged changes using `git diff --cached` and generate a concise, meaningful commit message.

## Instructions

1. Run `git diff --cached` to see what's staged
2. If nothing is staged, let the user know and suggest files to stage
3. Run `gh issue list --state open` to fetch open GitHub issues
4. Analyze the staged changes and compare against open issues:
   - Look for issue numbers referenced in code comments, branch names, or related functionality
   - Match bug fixes to issues describing the same bug
   - Match new features to feature request issues
5. Generate a commit message following conventional commits format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactoring
   - `test:` for adding tests
   - `chore:` for maintenance tasks
6. **Never** add Claude attribution, "Co-authored-by", or any AI-related credits to the commit
7. **Only commit** - never push, sync, or perform any remote operations
8. Keep the subject line under 50 characters
9. Add a body if the changes need more explanation
10. If matching issues are found, add closing keywords at the end of the commit body:
    - Use `Fixes #123` for bug fixes
    - Use `Closes #123` for features or other issues
    - Multiple issues can be referenced: `Fixes #123, Closes #456`
11. Show the proposed message and ask for confirmation before committing

## Example Output

```
fix: resolve null pointer in user validation

- Add null check before accessing user properties
- Return early if user object is undefined

Fixes #42
```

Commit with this message? (y/n)