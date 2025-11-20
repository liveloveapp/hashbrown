# SKILL: Git Worktrees

## Create a Worktree

1. Create:
   ```bash
   git worktree add ../<folder> -b <branch>
   ```
2. Enter:
   ```bash
   cd ../<folder>
   ```
3. Install deps:
   ```bash
   npm ci
   ```
4. Run Nx:
   ```bash
   npx nx test <library>
   ```

---

## Merge Worktree Branch into Main

1. Go to main repo:
   ```bash
   cd ../path/to/main-repo
   ```
2. Update:
   ```bash
   git pull
   ```
3. Merge:
   ```bash
   git merge <branch>
   ```
4. Push:
   ```bash
   git push
   ```

---

## Remove Worktree After Merge

1. Remove folder:
   ```bash
   git worktree remove ../<folder>
   ```
2. Delete branch:
   ```bash
   git branch -d <branch>
   ```
3. Clean up:
   ```bash
   git worktree prune
   ```
