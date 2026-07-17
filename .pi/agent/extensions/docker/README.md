# Docker Extension

Interact with Docker through the `docker` CLI — no HTTP API, no socket code, just
`docker` on `$PATH`. Works with every transport (unix socket, TCP, TLS, SSH,
named pipes, Docker contexts) out of the box.

## Requirements

- `docker` CLI on `$PATH`
- Optional env vars for remote daemons:
  - `DOCKER_HOST` — daemon socket URL (e.g. `tcp://192.168.1.10:2375`)
  - `DOCKER_CONTEXT` — Docker context name
  - `DOCKER_TLS_VERIFY` — enable TLS verification (`1` or `true`)
  - `DOCKER_CERT_PATH` — path to TLS certificates
- Every tool also accepts an optional `context` parameter to override the
  current Docker context per call.

## Tool List (all 12, across 5 modules)

| Tool            | Module        | Description |
|-----------------|---------------|-------------|
| `docker_run`    | containers    | Create+start a container (one-off), name-idempotent |
| `docker_wait`   | containers    | Block until a container stops, return exit code + logs |
| `docker_stop`   | containers    | Stop and optionally remove containers |
| `docker_ps`     | observe       | List containers (compact table via `--format '{{json .}}'`) |
| `docker_logs`   | observe       | Fetch stdout+stderr from a container |
| `docker_exec`   | observe       | Execute a command in a running container |
| `docker_info`   | daemon        | Show Docker daemon info (server version, drivers, swarm status) |
| `docker_inspect`| daemon        | Inspect any Docker object (container, image, network, volume) |
| `docker_images` | images        | List images |
| `docker_pull`   | images        | Pull an image from a registry |
| `docker_build`  | images        | Build an image from a Dockerfile |
| `docker_compose`| compose       | Run `docker compose` commands (up, down, ps, logs) |

## Workflows

### Discovery (read-only)

```
docker_info → docker_ps → docker_inspect <name> → docker_images
```

1. `docker_info` — learn daemon state, driver, OS/arch, container counts
2. `docker_ps` — list running/exited containers
3. `docker_inspect container=<name>` — full detail on one container
4. `docker_images` — list available images

### Run (mutating)

```
docker_pull / docker_build → docker_run → docker_wait → docker_logs → docker_stop
```

1. `docker_pull image=...` or `docker_build ...` — get the image
2. `docker_run image=... name=...` — start container (idempotent by name)
3. `docker_wait container=<name> logs=true` — block until exit, grab output
4. `docker_logs container=<name>` — deeper log inspection if needed
5. `docker_stop containers=<name> remove=true` — clean up

### Compose

```
docker_compose action=up --wait → docker_compose action=ps → docker_compose action=logs → docker_compose action=down
```

## Exported Helpers

Other extensions (e.g. agent-manager) can import the container-lifecycle helpers
directly without going through Pi's tool layer:

- `dockerRun(opts, env, signal?)` — create+start a container
- `dockerWait(container, env, signal?)` — block until container exits
- `dockerStop(containers, remove, time, env, signal?)` — stop containers

## Transport

All tools shell out to the `docker` CLI through `dockerCli()` in `transport.ts`.
Abort signals (Escape) send SIGTERM then SIGKILL after 5s, returning partial
results with `aborted: true` in details. Output is truncated to 50KB via
`truncateOutput()` to keep context manageable.

## Architecture

```
index.ts          — entry point, registers all wave modules
containers.ts     — docker_run, docker_wait, docker_stop (Wave 1)
observe.ts        — docker_ps, docker_logs, docker_exec (Wave 2)
daemon.ts         — docker_info, docker_inspect (Wave 2)
images.ts         — docker_images, docker_pull, docker_build (Wave 2)
compose.ts        — docker_compose (Wave 2)
transport.ts      — shared dockerCli(), resolveDockerEnv(), helpers
types.ts          — Docker CLI JSON shapes (ContainerPsRow, etc.)
```
