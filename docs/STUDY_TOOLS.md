# Study libraries, workspaces, focus, and local music

Source entry points: [packages/core/src/study/library.ts](../packages/core/src/study/library.ts), [packages/core/src/house/workspaces.ts](../packages/core/src/house/workspaces.ts), [app/src/ui/focus-clock-model.ts](../app/src/ui/focus-clock-model.ts), [app/src/ui/jukebox.ts](../app/src/ui/jukebox.ts).

## Feature map

The study library model is `packages/core/src/study/library.ts`; secure note models live in `notes/secure-notes.ts`; group projects in `projects/group-projects.ts`; workspace structure in `house/workspaces.ts`. Runtime adapters persist and synchronize these models. UI composition is in `app/src/ui/study-ui.ts`, `notes-ui.ts`, `projects-ui.ts`, `workspace-ui.ts`, `focus-clock.ts` and `jukebox.ts`.

Distinguish personal libraries from room-scoped activities. Opening the same kind of furniture in a different room must not silently reuse a previous room's private state. Workspace storage keys include their house/space identity, and shared activities use the current activity scope.

## Flashcards and quizzes

Flashcards contain prompts and answers, with optional supporting study fields. The UI supports finishing an edit before review, shuffle/reverse, pending items and hints. Quiz definitions are a separate model: manually entering alternate answers creates a quiz rather than changing the meaning of a flashcard deck. Timing, shuffling, scoring, streak and leaderboard controls belong to the quiz activity.

`StudyQuiz` in `packages/core/src/minigames/study-quiz.ts` owns game rules. The library stores reusable material; the activity engine owns the current round. Changing a saved deck must not be treated as permission to rewrite an active peer's round without the appropriate activity command.

Study notes and generated decks can retain links to their source. Preserve stable references when editing titles or moving UI entry points. A backlink is navigation, not a reason to expose a private page to everyone in a room. Review/save generated material through the same library models used for manually authored content.

## Rooms, floors and projects

House workspaces describe the selected room/floor and its tools. Domain validation should run before persistence, not only when rendering. Persistent servers store workspaces by owner, floor and room. Deleting a room also affects associated board namespaces, so cleanup must follow the model's removal operation instead of removing only a visual furniture item.

Group projects use a core activity model and runtime coordination. Keep organizer permissions and per-person views in the engine. UI actions should use the shared room wrapper so stopping, subscriptions and authority changes remain consistent with other activities.

## Focus clock

The focus UI accepts hours, minutes and seconds, automatically repeats focus/rest intervals (25/5 minutes by default) and can expose a movable optional HUD. `focus-clock-model.ts` is separated from presentation so timing behavior can be tested. Deadlines recover the correct phase after delayed callbacks. Pause freezes the current phase, resume continues it, and Reset stops the session at a full focus interval. Both durations can be edited together; edits affect subsequent phases. Hiding the panel or HUD does not stop timing.

HUD position, visibility and safe layout are managed separately from the clock's duration. On small screens the clock should remain reachable without obscuring essential controls. Use focus-clock and HUD layout tests when changing timer state, positioning or persistence.

## Jukebox

Music comes from local file selection or drag/drop. It is not uploaded or broadcast to other villagers. Playback can continue when the panel closes; Stop music explicitly ends it. Panel lifecycle and playback lifecycle are therefore different. Reopening the UI should reflect current playback rather than creating a second player.

Test the file picker/drop path, playback controls, closing and reopening, explicit stop and unsupported media behavior. Browser codec support and physical audio output require environment-specific validation. A successful UI click alone does not prove audio was audible.

## Mailbox and guides

Private mailboxes use the core mailbox schemas and runtime storage/session adapters. A resident's inbox is not public house metadata. Guide dialogue is configured through NPC models and appears near its speaker; dialogue settings include opacity, text size, Small/Standard/Large bubble size, reset and progressive presentation. Guides can be moved or removed rather than forced into existing homes.

## Verification

Start with `study-library.test.ts`, `study-note-links.test.ts`, `quiz-options.test.ts`, `focus-clock.test.ts`, `workspaces.test.ts` and `mailbox.test.ts`. Browser journeys cover study desk, workspace, source links, NPC speech and mailbox UI. Include saved/reloaded state and room changes: a screenshot of a fresh panel is insufficient evidence of persistence or isolation.
