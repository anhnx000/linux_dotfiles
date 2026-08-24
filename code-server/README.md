# Self-hosted code-server (VS Code in the browser)

A [code-server](https://github.com/coder/code-server) setup that runs VS Code in
the browser, with the Docker CLI, **zsh + oh-my-zsh + powerlevel10k**, and
**Miniconda** baked into the image so the shell environment survives every
rebuild/recreate.

## What's inside the image

Built on top of `codercom/code-server:4.133.0` (see `Dockerfile`):

- **Docker CLI + compose plugin** — the web terminal drives the *host* Docker
  daemon through the bind-mounted `/var/run/docker.sock`. No daemon runs inside
  the container.
- **zsh** set as the default login shell for the container user.
- **oh-my-zsh** + **powerlevel10k** theme.
- Plugins: `zsh-autosuggestions`, `zsh-syntax-highlighting`, plus the built-in
  `git`, `history`, `aliases`, `web-search`.
- **Miniconda** in `/opt/miniconda3`, initialised for both bash and zsh
  (`conda init`).

Everything above lives inside the image, so `docker compose up --build`, a
recreate, or deleting and recreating the container keeps the full setup. Only
`./config` and `./local` are bind-mounted for persistent editor state.

## Usage

```bash
# from this directory
docker compose up -d --build

# open the editor
# http://127.0.0.1:8080   (password is in ./config/code-server/config.yaml)
```

## Host-specific settings to adjust

`docker-compose.yaml` contains a few values tied to the machine it was written
for — change them for your host:

- `group_add: ["125"]` — the GID of the host's `docker` group (the group that
  owns `/var/run/docker.sock`). Find yours with `getent group docker`.
- `DOCKER_USER: anhnx000` — the code-server entrypoint renames the in-image
  `coder` user (uid 1000) to this name at runtime.
- `../:/code-repo` — bind-mounts the parent directory as the workspace. Point it
  at whatever you want to edit.
- `image: code-server-docker:4.133.0` — keep the tag in step with the
  `FROM` line in the `Dockerfile`.

Also keep `DOCKER_CLI_VERSION` / `DOCKER_COMPOSE_VERSION` (build args in the
`Dockerfile`) close to the host daemon version (`docker version`).

## First-run notes

- On the first zsh session, powerlevel10k launches its configuration wizard.
  Re-run it any time with `p10k configure`. For proper icons, install a
  **MesloLGS NF** (Nerd Font) in your terminal / browser terminal.
- `MINICONDA_URL` defaults to the `latest` installer. Pin it to a specific
  version URL if you need reproducible conda builds.
