#!/usr/bin/env bash
# Reproducible Linux dev/build environment for ssh-tool (Ubuntu 24.04, GTK3, WebKitGTK 4.1).
#
# Canonical entry point for the full Linux development chain: dependency install,
# frontend build, dev servers, wails dev/build and GUI runs all happen inside the
# container. Do not run pnpm/go/wails on the host; the host only edits sources.
# See docs/linux-dev-environment.md.
#
# Usage (from ssh-tool/):
#   build/linux/dev-env.sh up             # start persistent dev container
#   build/linux/dev-env.sh exec -- <cmd>  # run a command in the persistent container
#   build/linux/dev-env.sh down           # stop and remove the persistent container
#   build/linux/dev-env.sh image          # build/refresh the Docker image
#   build/linux/dev-env.sh doctor         # wails doctor inside the container
#   build/linux/dev-env.sh build [args]   # wails build (adds -tags webkit2_41)
#   build/linux/dev-env.sh dev [args]     # wails dev, with X11/Wayland passthrough
#   build/linux/dev-env.sh shell          # interactive shell (one-shot container)
#   build/linux/dev-env.sh run -- <cmd>   # arbitrary command in /workspace
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${SSH_TOOL_DEV_IMAGE:-ssh-tool-dev:noble}"
CONTAINER="${SSH_TOOL_DEV_CONTAINER:-ssh-tool-dev}"
DOCKERFILE="$ROOT/build/linux/Dockerfile.dev"
TAGS="${SSH_TOOL_WAILS_TAGS:-webkit2_41}"
CACHE_DIR="${SSH_TOOL_DEV_CACHE:-$HOME/.cache/ssh-tool-dev}"

build_image() {
    docker build \
        --network host \
        --progress=plain \
        --build-arg "USER_UID=$(id -u)" \
        --build-arg "USER_GID=$(id -g)" \
        -t "$IMAGE" \
        -f "$DOCKERFILE" \
        "$ROOT"
}

# Common `docker run` arguments shared by one-shot runs and the persistent
# dev container. Printed one argument per line for `mapfile`.
build_container_args() {
    local -a args=(
        --network host
        -v "$ROOT:/workspace"
        -v "$CACHE_DIR/go:/home/dev/go"
        -w /workspace
        -e CGO_ENABLED=1
        # Container store differs from the host store; allow pnpm to recreate
        # node_modules non-interactively.
        -e CI=true
        -e GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
        -e DISPLAY="${DISPLAY:-}"
        -e WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}"
    )

    # X11 socket for GTK (XWayland on Wayland sessions). The auth cookie is
    # required by XWayland; GNOME exposes it through XAUTHORITY.
    if [ -d /tmp/.X11-unix ]; then
        args+=(-v /tmp/.X11-unix:/tmp/.X11-unix:ro)
    fi
    if [ -n "${XAUTHORITY:-}" ] && [ -r "$XAUTHORITY" ]; then
        args+=(
            -e XAUTHORITY=/home/dev/.Xauthority
            -v "$XAUTHORITY:/home/dev/.Xauthority:ro"
        )
    fi

    # Wayland socket, when present, so webkit2gtk can run natively.
    if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -n "${WAYLAND_DISPLAY:-}" ] && \
       [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ]; then
        args+=(
            -e "XDG_RUNTIME_DIR=/home/dev/.xdg-runtime"
            -v "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY:/home/dev/.xdg-runtime/$WAYLAND_DISPLAY"
        )
    fi

    # GPU access for WebGL rendering; falls back to software if absent.
    if [ -d /dev/dri ]; then
        args+=(--device /dev/dri)
    fi

    printf '%s\n' "${args[@]}"
}

docker_run() {
    mkdir -p "$CACHE_DIR/go"

    local -a args=()
    mapfile -t args < <(build_container_args)

    if [ -t 0 ] && [ -t 1 ]; then
        args+=(-it)
    fi

    docker run --rm "${args[@]}" "$IMAGE" "$@"
}

docker_up() {
    mkdir -p "$CACHE_DIR/go"

    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
        echo "Image $IMAGE not found. Run: build/linux/dev-env.sh image" >&2
        return 1
    fi

    local image_id current_image_id workspace_source
    image_id="$(docker image inspect -f '{{.Id}}' "$IMAGE")"

    if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
        current_image_id="$(docker container inspect -f '{{.Image}}' "$CONTAINER")"
        workspace_source="$(docker container inspect \
            -f '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}' \
            "$CONTAINER")"

        if [ "$current_image_id" != "$image_id" ] || [ "$workspace_source" != "$ROOT" ]; then
            echo "Recreating $CONTAINER (image or workspace mount changed)."
            docker rm -f "$CONTAINER" >/dev/null
        elif [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ]; then
            echo "Container $CONTAINER is already running."
            docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
            return 0
        else
            docker start "$CONTAINER" >/dev/null
            echo "Started existing container $CONTAINER."
            docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
            return 0
        fi
    fi

    local -a args=()
    mapfile -t args < <(build_container_args)
    docker run -d --name "$CONTAINER" "${args[@]}" "$IMAGE" sleep infinity >/dev/null
    echo "Created and started container $CONTAINER."
    docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
}

docker_down() {
    if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
        docker rm -f "$CONTAINER" >/dev/null
        echo "Stopped and removed container $CONTAINER."
    else
        echo "Container $CONTAINER does not exist."
    fi
}

docker_exec() {
    local -a args=(exec)
    if [ -t 0 ] && [ -t 1 ]; then
        args+=(-it)
    fi
    docker "${args[@]}" "$CONTAINER" "$@"
}


case "${1:-}" in
    up)
        docker_up
        ;;
    down)
        docker_down
        ;;
    exec)
        shift
        [ "${1:-}" = "--" ] && shift
        docker_exec "$@"
        ;;
    image)
        build_image
        ;;
    doctor)
        shift
        docker_run wails doctor "$@"
        ;;
    build)
        shift
        docker_run wails build -tags "$TAGS" "$@"
        ;;
    dev)
        shift
        docker_run wails dev -tags "$TAGS" "$@"
        ;;
    shell)
        shift
        docker_run bash "$@"
        ;;
    run)
        shift
        [ "${1:-}" = "--" ] && shift
        docker_run "$@"
        ;;
    *)
        sed -n '9,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
