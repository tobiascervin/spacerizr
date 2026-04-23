# Spacerizr — Agent Instructions

Rules for all AI agents working on this project (Claude, Cursor, Copilot, etc.).

---

## Identity & Authorship

- **Owner:** Tobias Cervin `<cervinproduction@gmail.com>`
- All git commits must be authored by Tobias Cervin only
- Never add `Co-Authored-By`, `Co-authored-by`, or any other co-author attribution in commits
- Never add author/agent signatures to source code or comments

---

## Commit Rules

- **Never commit automatically** — always show the diff and wait for explicit user approval
- **Always verify visually** before proposing a commit: run `npm run build`, open a preview, take a screenshot, and show it to the user
- Commit message format: lowercase imperative sentence, no period at end
  - Good: `Fix mobile navigation: add Back button for breadcrumbs`
  - Bad: `Fixed the navigation issue.` / `feat: add back button`
- Only stage files relevant to the change — never `git add .` blindly
- Never use `--no-verify` or bypass git hooks
- Never amend commits unless explicitly asked

---

## Verification Workflow

Before every commit:
1. `npm run build` — must succeed with no errors
2. Start preview server
3. Visually verify the change in browser (screenshot)
4. Show result to user
5. Wait for explicit approval ("commit", "kör commit", "ja" etc.)

For mobile changes, also verify at 375×812 viewport.

---

## Code Style

- **TypeScript** — strict mode, no `any` unless unavoidable
- No unused imports or variables
- Prefer named exports over default exports
- CSS in `index.html` — no separate CSS files
- No inline styles in TypeScript unless dynamically computed
- Comment non-obvious logic; don't comment obvious code

---

## What NOT to Do

- Do not refactor or rename things that aren't related to the current task
- Do not add new dependencies without asking
- Do not add logging/console.log to production code
- Do not create README or documentation files unless explicitly asked
- Do not create new files for small additions — extend existing files
- Do not modify `CLAUDE.md` or `AGENTS.md` without being asked

---

## Project-Specific Patterns

### Adding a new architectural shape
1. Add detection regex in `src/types.ts` → `getElementShape()`
2. Add 3D geometry switch case in `src/scene.ts`
3. Add 2D draw function + switch case in `src/scene2d.ts`
4. Add SVG render case in `src/svg-renderer.ts`
5. Add `TextConfig` case in `getTextConfig()` in `src/scene2d.ts`

### Modifying CSS for responsive layout
- Mobile breakpoint: `@media (max-width: 640px)`
- Tablet: `@media (min-width: 641px) and (max-width: 1024px)`
- Touch devices: `@media (pointer: coarse)`
- All CSS lives in `index.html`

### 3D render loop changes
- The render loop is in `startRenderLoop()` in `src/scene.ts`
- Ground decals must counter-act floating: `child.position.y = child.userData.groundY - floatOffset`
- Do not add pulsing/blinking animations — they are distracting

---

## Testing

- Playwright MCP connector is available for automated browser testing
- Use `preview_start` + `preview_screenshot` for visual verification
- Test mobile at 375×812 (iPhone), tablet at 768×1024 (iPad)
- The `window.__navigateTo(path: string[])` helper is exposed for test navigation
