# Engineering notes — fixture-node-fullstack

This file documents existing engineering conventions in the fixture. It
exists so the kit's M2 discovery can demonstrate that it preserves
existing documentation rather than overwriting it.

## Endpoints

| Method | Path     | Response                          |
| ------ | -------- | --------------------------------- |
| GET    | `/`      | `{ message: "hello from ..." }`   |
| GET    | `/health`| `{ status: "ok" }`                |
| *      | *        | 404 `{ error: "not found" }`      |

## Decisions

- No framework. Plain `node:http`. Keeps the fixture dependency-free.
- `node:test` for tests. Built-in; no `npm install` required.
- Default port 3000, overridable via `PORT` env var.
