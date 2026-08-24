# code-server + Docker CLI, so the web terminal can drive the host daemon
# through the bind-mounted /var/run/docker.sock (see docker-compose.yaml).
FROM codercom/code-server:4.133.0

# Keep these in step with the host daemon: `docker version`.
ARG DOCKER_CLI_VERSION=29.1.3
ARG DOCKER_COMPOSE_VERSION=2.40.3

USER root

# CLI only -- no daemon, no containerd. The tarball ships the full engine, so
# extract just the client binary and drop the rest.
RUN set -eux; \
    curl -fsSL -o /tmp/docker.tgz \
      "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz"; \
    tar -xzf /tmp/docker.tgz -C /usr/local/bin --strip-components=1 docker/docker; \
    rm /tmp/docker.tgz; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64"; \
    chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose; \
    docker --version; \
    docker compose version

# ---------------------------------------------------------------------------
# Shell environment: zsh + oh-my-zsh + powerlevel10k + plugins, and Miniconda.
# Baked into the image so it survives `docker compose up --build` / recreate
# (only ./config and ./local are bind-mounted; /home/coder and /opt are not).
# ---------------------------------------------------------------------------
ARG MINICONDA_URL=https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

# zsh (+ git for cloning oh-my-zsh plugins) and Miniconda into /opt, owned by
# the container user (uid 1000 = coder, renamed to $DOCKER_USER at runtime).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends zsh git ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    usermod -s /usr/bin/zsh coder; \
    curl -fsSL -o /tmp/miniconda.sh "${MINICONDA_URL}"; \
    bash /tmp/miniconda.sh -b -p /opt/miniconda3; \
    rm -f /tmp/miniconda.sh; \
    chown -R 1000:1000 /opt/miniconda3; \
    /opt/miniconda3/bin/conda --version

USER coder

# oh-my-zsh + powerlevel10k theme + suggestion/highlighting plugins, then wire
# up ~/.zshrc (theme, plugin list) and conda init for bash & zsh.
RUN set -eux; \
    export HOME=/home/coder; \
    ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"; \
    RUNZSH=no CHSH=no KEEP_ZSHRC=no \
      sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"; \
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "$ZSH_CUSTOM/themes/powerlevel10k"; \
    git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"; \
    git clone --depth=1 https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"; \
    sed -i 's|^ZSH_THEME=.*|ZSH_THEME="powerlevel10k/powerlevel10k"|' "$HOME/.zshrc"; \
    sed -i 's|^plugins=(.*)|plugins=(git zsh-syntax-highlighting zsh-autosuggestions history aliases web-search)|' "$HOME/.zshrc"; \
    /opt/miniconda3/bin/conda init bash zsh
