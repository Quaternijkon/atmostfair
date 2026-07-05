# Atmostfair PM Acceptance And Expansion Plan

## Objective

Validate Atmostfair as a product, not only as a codebase: every visible workflow should either complete successfully, fail with an understandable app-level state, or block invalid input before data is written. The product should also gain functional depth without broad redesign or fragile dependencies.

## Current Product Surface

- Identity: email registration/login, guest login, profile sync, logout, session restore.
- Dashboard: create/search projects across Collect, Connect, Select, Project categories.
- Project shell: password gate, pause/resume, delete, QR share, chat, project-specific workspace.
- Collect workspaces: voting, form gathering, schedule selection, booking.
- Connect workspaces: teams, claim/tasks, friends.
- Select workspaces: roulette, queue.
- Project workspaces: mini-game lobby, rock-paper-scissors, minesweeper.
- Admin/utility: announcements, notifications, orphan cleanup, CSV export.

## Acceptance Matrix

### P0: Data Integrity And Access Control

- Users cannot create duplicate participation records in queue, roulette, booking, team, claim, schedule, or gather flows unless the product explicitly supports repeat submissions.
- Capacity limits are enforced at action level, not only disabled in UI.
- Deleting a project must not leave visible orphan data that reappears in unrelated views.
- Project actions must be scoped by `projectId`; cross-project data must not leak into another workspace.
- Invalid or stale IDs must return safe empty/loading/error states rather than crashing.

### P1: Workflow Completion

- Every project type supports create, participant action, owner/admin action, pause/resume, finish/delete path, and empty state.
- Each form handles blank, whitespace-only, overlong, duplicate, and stale data.
- Concurrent or repeated clicks should not create duplicate records or unexpected state.
- Notifications and chat should remain readable and not block the primary workflow.

### P2: UX/Accessibility

- Touch targets stay at least 44px.
- Primary actions have disabled/loading states.
- Empty/error states use app surfaces, not browser dialogs.
- Mobile and desktop layouts avoid overlap, horizontal clipping, and hidden bottom actions.
- Visible copy remains localized.

## Functional Expansion Roadmap

### Batch 1: Reliability Features

- Add shared domain helpers for idempotent participation and cascading project deletion.
- Harden action handlers against duplicates, capacity overflows, and stale records.
- Add tests for action-level invariants independent of UI disabled states.

### Batch 2: Product Control Features

- Add project duplication from the project shell.
- Add archive/restore state so users can clean dashboards without deleting data.
- Add dashboard status filters and sorting by recent, title, and status.

### Batch 3: Collaboration Features

- Add notification actions: mark all read and clear read items.
- Add lightweight activity history per project for joins, submissions, kicks, and draws.
- Add owner-visible participant export for queue, booking, schedule, gather, and claim.

### Batch 4: Workspace Depth

- Voting: configurable single/multiple vote mode.
- Gather: field types for text, number, date, and option.
- Booking: waitlist for full slots.
- Schedule: owner recommendation summary.
- Queue/Roulette: replayable audit trail of deterministic selection.
- Game hub: room invite/share state and per-user result history.

## First Execution Batch

The first execution batch targets high-risk P0 items that can create unexpected product states:

- Create a domain module for project actions and participation guards.
- Move duplicate/capacity checks into reusable helpers.
- Use the helpers from `App.jsx` action handlers.
- Add backend/unit tests that prove:
  - Team join is idempotent and respects capacity.
  - Queue join is idempotent by project/user.
  - Booking a slot refuses already-booked slots.
  - Project deletion can produce a cascade operation list for every project-owned collection.

## Verification Gates

- `npm run lint`
- `npm test`
- `npm run build`
- Browser smoke on login, dashboard, one Collect workspace, one Connect workspace, one Select workspace, and one Project workspace.
- Static scans for direct remote fonts, direct component `Date.now()`, native dialogs, clickable div regions, undersized controls, and visible hardcoded English fallbacks.
