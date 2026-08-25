# Repository Instructions

## Project State
- This repository is at project bootstrap stage. Do not assume a language, framework, or architecture until implementation files exist.
- Keep durable project context in `docs/PROJECT_STATUS.md` and update it when purpose, architecture, blockers, or next steps materially change.

## Repository Structure
- `AGENTS.md`: durable working instructions for Codex sessions.
- `docs/PROJECT_STATUS.md`: current handover and restart context.
- Add source, tests, scripts, and additional docs only when the project needs them.

## Development And Validation
- Before changing code, inspect the relevant files and existing conventions.
- Use the project-native commands once a stack is introduced. Until then, validate documentation-only changes with Git diff/status review.
- Do not add generated output, dependency folders, local caches, credentials, `.env` files, or editor-specific noise to commits.

## Git Workflow
- Local routine Git operations are allowed: initialize the repository, create/switch local branches, stage related changes, and make clear atomic commits.
- The user handles remote pushes unless explicitly requested.
- Do not push, force-push, rewrite history, rebase, reset, amend commits, delete branches, or discard uncommitted work without explicit approval.
- Before each commit, review `git status` and the relevant diff, run applicable validation, and confirm the commit is one coherent unit of work.
- Preserve unrelated user changes and keep them out of commits unless required for the task.

## Session Startup
- Read `AGENTS.md` and `docs/PROJECT_STATUS.md`.
- Inspect `git status --short --branch` and recent history.
- Examine relevant implementation files before making assumptions.
- Briefly summarize current state, proposed next action, and any mismatch between docs and the repository.
