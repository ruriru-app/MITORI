# Pair Dialogue Implementation Plan

> Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable pair-dialogue speaking test with independent student and role selection.
**Architecture:** Extend existing performance definitions with a pair kind and item role IDs. Keep individual results and reuse export/backup infrastructure. Separate pure pair helpers and pair UI from the existing inline host.
**Tech Stack:** Browser JavaScript, CSS, node:test.
**Spec:** ../specs/2026-11-21-pair-dialogue-design.md

## Global Constraints
- Do not modify sources/.
- Keep legacy test and result data compatible.
- No fixed expressions, grade or Unit.
- Separate left/right pupils and preserve both role scores.

## Review Focus
- Switching role or pupil must not overwrite another pupil's scores.
- Partial assessment must not look complete.
- Saved snapshots and backup restore must retain role identity.
- Save failure must be visible, with pending input retained.
- Offline shell must contain the new assets.

## Tasks
- [x] Add pair-model.js helpers (kind, role labels, filtered items, progress), with failing tests then passing tests for legacy definitions, independent roles, and snapshots.
- [x] Extend index.html selection, editor, run routing and export labels; add pair-dialogue.js and pair-dialogue.css for two independent panels with autosave and save-error feedback. Exercise role/pupil switching and saving with integration tests.
- [x] Add all assets to sw.js, run the complete suite, inspect layout and review the final diff.

## Execution notes
Baseline: 137 tests passed. origin/main is 2157973, same as local main. Existing source calls this パフォーマンステスト; add スピーキングテスト heading with the two requested child choices. Work on feat/pair-dialogue; user has approved implementation, so continue in this chat without another approval round.

Verification: 145 node tests passed; isolated Edge browser passed editor creation, independent scoring, role switching, custom bracket labels in returned sheets, reload persistence, legacy category, landscape layout and scroll preservation. git diff --check passed. Independent review identified scroll/focus reset; fixed by preserving per-panel position and focused control. Pair CSV matching now uses item and role identity to avoid borrowing scores after definition edits. Changes remain local on feat/pair-dialogue; no deployment performed.
