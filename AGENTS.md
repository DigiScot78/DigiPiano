# Repository Instructions

## Project State
- This repository contains a browser-only TypeScript proof of concept for a piano learning tool.
- The current milestone proves the path: MusicXML/MXL file -> OSMD notation rendering -> normalized expected score events -> Web MIDI input -> correct-note/chord advancement.
- Keep durable project context in `docs/PROJECT_STATUS.md` and update it when purpose, architecture, blockers, or next steps materially change.

## Repository Structure
- `src/App.tsx`: single-page PoC shell and UI orchestration.
- `src/components/ScoreRenderer.tsx`: OpenSheetMusicDisplay rendering and cursor control.
- `src/music/`: score loading, MXL decompression, MusicXML timeline normalization, note helpers.
- `src/midi/`: MIDI message decoding and held-note state.
- `src/hooks/useMidiInput.ts`: browser Web MIDI access and selected input subscription.
- `src/learning/`: expected-versus-held note comparison and learning progress.
- `docs/PROJECT_STATUS.md`: current handover context.
- `docs/ARCHITECTURE.md`: current PoC architecture and limitations.
- `docs/DECISIONS.md`: concise decision record.
- `Samples/`: local-only sample score files; ignored by Git unless the user explicitly decides they should be committed.

## Development Commands
- Install dependencies: `npm install`
- Start local app: `npm run dev`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm run test`
- Production build: `npm run build`

## Development And Validation
- Desktop Chromium is the target browser for Web MIDI.
- Web MIDI requires a secure context; `localhost` and `127.0.0.1` are acceptable for local development.
- Validate deterministic logic with unit tests. Real MIDI hardware validation must be reported separately and only after testing with a connected instrument.
- Do not add generated output, dependency folders, local caches, credentials, `.env` files, or editor-specific noise to commits.

## Git Workflow
- Local routine Git operations are allowed: initialize the repository, create/switch local branches, stage related changes, and make clear atomic commits.
- The user handles remote pushes unless explicitly requested.
- Do not push, force-push, rewrite history, rebase, reset, amend commits, delete branches, or discard uncommitted work without explicit approval.
- Before each commit, review `git status` and the relevant diff, run applicable validation, and confirm the commit is one coherent unit of work.
- Preserve unrelated user changes and keep them out of commits unless required for the task.

## Session Startup
- Read `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md` when relevant.
- Inspect `git status --short --branch` and recent history.
- Examine relevant implementation files before making assumptions.
- Briefly summarize current state, proposed next action, and any mismatch between docs and the repository.
