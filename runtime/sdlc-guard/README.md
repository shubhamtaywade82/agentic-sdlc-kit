# sdlc-guard

Destructive-operation governance for the Agentic SDLC Kit (Claude Code mod).

**What it gates**

| Hook | Scope |
| --- | --- |
| `tool.call` `{tool:'Bash'}` | Shell command policy: deny / ask (modal) / allow |
| `tool.call` `{tool:['Edit','Write','NotebookEdit']}` | Protected-path policy for file edits |

Both registrations chain `.catch(...)` — an internal error or timeout **refuses**
the action (fail closed) instead of letting it through.

## Shell rules (first match wins, per statement; compounds split on `;`, `&&`, `||`, newline)

**Deny (hard block, actionable alternative in the message):**

| Rule | Matches |
| --- | --- |
| `git-force-push` | `git push --force` / `-f` / short-flag clusters containing `f` / `+refspec`. `--force-with-lease` is NOT denied (it falls through to the ask rule). |
| `git-filter-branch` | any `git filter-branch` |
| `git-reflog-expire` | `git reflog expire --expire=now` (or `--expire-unreachable=now`) |
| `rm-destructive-target` | recursive `rm` targeting `/`, `~`, `.` , `*`, or any absolute path. Relative paths (`rm -rf ./node_modules`) are allowed — the policy is a pure function and cannot know the repo root, so absolute targets fail closed. |
| `pipe-to-shell` | `curl`/`wget` piped into `sh`/`bash`/`zsh`/`dash` (incl. `sudo sh`, intermediate pipes) |
| `sql-drop-truncate` | `DROP TABLE\|DATABASE` / `TRUNCATE TABLE` inside a db console command (`psql`, `mysql`, `mariadb`, `sqlite3`, `rails dbconsole`, `docker exec … psql`, `… \| psql`). The words alone (e.g. in `grep`) are NOT denied. |
| `chmod-recursive-777` | `chmod -R 777` / `0777` |

**Ask (modal, default answer Refuse; dismissal/rejection = refuse):**

| Rule | Matches |
| --- | --- |
| `git-push` | any `git push` |
| `git-push-delete` | `git push --delete` / `-d` |
| `git-reset-hard` | `git reset --hard` |
| `git-branch-delete` | `git branch -D` (lowercase `-d` safe delete is allowed) |
| `migration` | `rake\|rails db:*`, `manage.py migrate\|flush`, `prisma migrate`, `knex migrate`, `flyway <sub>`, `liquibase <sub>` — unless `approvals.migrations: not-required` (then allowed + logged) |
| `deployment` | `cap deploy`, `kamal deploy`, `vercel deploy/--prod`, `netlify deploy`, `flyctl deploy`, `kubectl apply\|create\|replace\|delete\|rollout\|scale\|set`, `helm upgrade\|install\|…`, `docker push`, `npm publish`, `gem push` — unless `approvals.deployment: not-required` |
| `sudo` | any statement run under `sudo` |

Everything else is allowed.

## Protected paths

Writes into protected globs are denied. The glob matcher supports `**`, `*`
and exact segments, and matches the full path **or any segment-aligned suffix**
(protective: `*.pem` matches `certs/server.pem`, and absolute session paths are
matched by their tail). Layering:

```
effective = (guard.protectedPaths ?? defaults) ∪ policies.protectedPaths ∪ ['.git/**']
defaults  = .github/workflows/**  .git/**  .env  .env.*  *.pem  *.key
```

`.git/**` internals can never be unprotected. `.ai/project.yml` and
`.ai/manifest` are deliberately NOT protected (users and kit workflows edit
them). Note the fail-closed default: `.env.*` also covers `.env.example` —
write example files manually or set an explicit `guard.protectedPaths` list.

## Config keys read (`.ai/project.yml`)

```yaml
version: 1
policies:
  tdd: required                      # ignored by this mod (CLI validates)
  approvals:
    migrations: required             # required | not-required
    deployment: required             # required | not-required
    forcePush: prohibited            # only "prohibited" is accepted
  protectedPaths:                    # unioned on top of guard.protectedPaths
    - secrets/**
guard:
  protectedPaths:                    # explicit list replaces the defaults
    - .github/workflows/**
    - .git/**
    - .env
    - *.pem
    - *.key
```

No profile → documented defaults (approvals required, default paths). Any parse
doubt (tabs, odd indentation, flow syntax, invalid values) → defaults, and
defaults fail CLOSED. The profile is read once per plugin load; reload the
session to pick up changes. Unknown keys are ignored — the CLI is the strict
validator, mods are the tolerant reader.

## Known limitations (static analysis, by design)

- Dangerous commands wrapped in `bash -c "…"`/subshells are not decoded — the
  rule engine sees the wrapper command. Deny-class misses here are one reason
  static Git protections should ALSO use native git configuration
  (`receive.denyNonFastForwards`, protected branches, server hooks).
- Mods run with the user's full machine privileges and are not a sandbox.

## Tests

- `claude plugin test` in this directory (thin tool-call integration tests).
- Policy tests: `npm test` in `runtime/` (shell, glob, profile specs).
