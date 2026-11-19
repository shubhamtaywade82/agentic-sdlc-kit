# AGENTS.md — TypeScript / Next.js

> Source of truth for all AI assistants in this repo. Keep it short, accurate, current.
> Lines marked `# ADJUST` are defaults — change them to match your app.

## 1. Project Context
- **Product:** <one-line description>   # ADJUST
- **Stack:** TypeScript 5 (strict), Next.js 15+/16 App Router, React 19, Node 22 LTS, pnpm,
  Tailwind CSS + shadcn/ui, Zod, Prisma + PostgreSQL, Auth.js (or Clerk), TanStack Query
  (client-side server state only)   # ADJUST (Drizzle instead of Prisma, npm/bun instead of pnpm, etc.)
- **Testing:** Vitest + React Testing Library + MSW (unit/integration), Playwright (e2e)   # ADJUST
- **Key dirs:** `src/app` (routes, layouts, route handlers), `src/components` (`ui/` = shadcn),
  `src/lib` (utils, clients), `src/server` (data access, services, server actions),
  `src/hooks`, `prisma/`, `tests/e2e/`

### Commands
| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Unit/integration tests | `pnpm test` (watch: `pnpm test --watch`) |
| One test file | `pnpm vitest run src/lib/foo.test.ts` |
| E2E | `pnpm exec playwright test` (one: `pnpm exec playwright test tests/e2e/login.spec.ts`) |
| Lint | `pnpm lint` (eslint) |
| Format | `pnpm format` (prettier --write) |
| Type-check | `pnpm typecheck` (`tsc --noEmit`) |
| DB migrate (dev) | `pnpm prisma migrate dev --name <name>` |
| DB client | `pnpm prisma generate` |

### Do not touch
`.next/`, `node_modules/`, `.env*`, generated Prisma client, `src/components/ui/*`
(regenerate with shadcn CLI instead), lockfile edits by hand, `public/` assets unless asked.

## 2. Operating Principles
1. Read related routes, components, server code, and tests before editing. Search, don't guess.
2. Ask up to 3 focused questions when requirements are ambiguous, then proceed with stated assumptions.
3. Plan first for anything > 1 file or > 50 lines; save it to `docs/plans/<slug>.md`.
4. One logical change per commit; keep diffs reviewable.
5. Test-first for logic. Bug fix = failing regression test first.
6. Run typecheck + lint + tests and show output before claiming done.
7. Follow existing patterns. Check library docs for the installed version (APIs change between majors).
8. No silent scope creep — log unrelated issues in `docs/TODO.md`.

## 3. TypeScript Rules
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any` — use `unknown` + narrowing.
  No `@ts-ignore`; `@ts-expect-error` only with a reason comment.
- Validate every external boundary with Zod (form data, route params, search params, request
  bodies, env vars, third-party API responses). Infer types: `type X = z.infer<typeof XSchema>`.
- Prefer `type` aliases and discriminated unions; avoid enums (use `as const` objects / unions).
- Return typed results for expected failures (`{ ok: true, data } | { ok: false, error }`);
  throw only for truly exceptional cases.
- Named exports (except where Next.js requires default: `page`, `layout`, `loading`, `error`, etc.).
- Absolute imports via `@/` alias. No barrel files that break tree-shaking.

## 4. Next.js / React Conventions
**Server vs Client**
- Server Components by default. Add `"use client"` only for state, effects, event handlers,
  or browser APIs — and push it to the smallest leaf component.
- Never import server-only code (DB, secrets) into client components; mark such modules with
  `import "server-only"`. Only `NEXT_PUBLIC_*` env vars reach the browser.
- Pass serializable props only from Server to Client Components.

**Data fetching & mutations**
- Fetch data in Server Components via functions in `src/server/` (data access layer), not
  inline Prisma calls scattered in pages.
- Mutations via Server Actions (`"use server"`) or Route Handlers (`app/api/**/route.ts`) for
  external/webhook consumers. Each action: validate input (Zod) → authenticate → authorize →
  execute → `revalidatePath`/`revalidateTag` → return typed result.
- Server Actions are public endpoints: always re-check auth and ownership inside them.
- Be explicit about caching (`fetch` cache options, `revalidate`, cache tags); don't rely on defaults
  that differ between Next versions. `params`/`searchParams`/`cookies()`/`headers()` are async — `await` them.
- Use `loading.tsx`, `error.tsx`, `not-found.tsx` and `<Suspense>` for streaming states.

**Components**
- Small, single-purpose, typed props (`type Props = {...}`). Composition over prop drilling;
  context only for truly global UI state.
- Forms: React Hook Form + Zod resolver, or `useActionState` with Server Actions. Show field
  errors and pending state (`useFormStatus`).
- Styling: Tailwind utilities; `cn()` helper for conditional classes; no inline style objects.
- Accessibility: semantic HTML, labels for inputs, keyboard support, alt text, focus states.
- Images via `next/image`, fonts via `next/font`, links via `next/link`.

**Performance**
- Keep client bundles small: avoid heavy libs in client components; `next/dynamic` for big widgets.
- Avoid request waterfalls: parallelize with `Promise.all`; select only needed DB columns.
- Use `useMemo`/`useCallback` only for measured problems (or rely on React Compiler if enabled).   # ADJUST

**Database (Prisma)**
- Schema changes via migrations only; review generated SQL. Add indexes for query patterns.
- Single Prisma client instance (`src/lib/db.ts`). Use `select`/`include` deliberately; transactions
  (`$transaction`) for multi-write operations.

**Security**
- Auth check in every protected page, route handler, and server action (deny by default).
- Middleware/proxy is for redirects and coarse checks only — not the sole authorization layer.
- Sanitize any HTML before `dangerouslySetInnerHTML` (avoid it if possible).
- Rate-limit auth and public mutation endpoints. Verify webhook signatures.
- Set security headers (CSP, etc.) in `next.config` or proxy/middleware.

## 5. Testing
- Unit: pure functions, Zod schemas, utils, hooks (Vitest).
- Integration: components with RTL — query by role/label, assert what users see; mock network with MSW.
- Server actions / data layer: test against a test DB or mocked client; cover auth failures.
- E2E (Playwright): critical journeys only (signup, login, checkout); use `getByRole`, no fixed waits.
- Async Server Components are best covered by e2e tests.

## 6. Git & PRs
- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Conventional commits: `feat(auth): add magic link login`.
- Migrations committed with schema changes. Lockfile committed with dependency changes.
- PR uses `.ai/templates/PR.md` with typecheck/lint/test output and screenshots for UI.

## 7. Safety Boundaries (need explicit human approval)
- Pushing any branch, merging a PR, pushing to `main`, force-push, history rewrite.
- Creating/pushing git tags, publishing releases (incl. `npm publish`), and deploying (incl. `vercel deploy`) — each one individually.
- `prisma migrate reset`, `prisma db push` on shared DBs, any command against non-local DBs.
- Reading/printing `.env*` or secrets; adding secrets to `NEXT_PUBLIC_*`.
- Adding dependencies (state why: size via bundlephobia, maintenance, license) or major upgrades.
- Editing CI workflows, `vercel.json`/deploy config, or `next.config` security headers.

## 8. Definition of Done
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green; e2e green for touched journeys
- [ ] `pnpm build` succeeds
- [ ] Inputs validated with Zod; auth checked in every action/handler
- [ ] Loading, error, and empty states handled; accessible markup
- [ ] No `any`, `console.log`, or unused exports in the diff
- [ ] Docs/CHANGELOG updated; plan checkboxes ticked

## 9. Report Format
1. What changed (files + one line each)  2. Verification (commands + results)
3. Assumptions  4. Follow-ups / risks

## Kit integration
- Pattern implementations for this stack: `.ai/stack/patterns/` (see its README).
  Selection policy first: the `design-pattern-selection` skill's five questions.
- Quality gates for this stack live in `.ai/project.yml` (`quality.commands`) —
  keep them aligned with the Commands section above so `kit verify` matches
  the documented workflow. Run `node .ai/kit/bin/kit.js init` to (re)generate.
