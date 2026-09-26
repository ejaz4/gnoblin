#!/usr/bin/env bash
# Resolve the repository build prerequisites for the Enterprise Linux adapter.
# Private Gnoblin RPMs are built and installed by build-chain.sh in dependency
# order, so they are deliberately not sent to the public DNF repositories.
set -euo pipefail

install=0
while (($#)); do
    case "$1" in
        --install) install=1 ;;
        *)
            echo "Usage: $0 [--install]" >&2
            exit 2
            ;;
    esac
    shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPECS=(
    "$ROOT/packaging/el/gsettings-desktop-schemas.spec"
    "$ROOT/packaging/el/mutter.spec"
    "$ROOT/packaging/el/gnome-shell.spec"
    "$ROOT/packaging/el/gnoblin.spec"
)

command -v rpmspec >/dev/null
command -v dnf >/dev/null

requirements="$(mktemp)"
cleanup() { rm -f -- "$requirements"; }
trap cleanup EXIT

for spec in "${SPECS[@]}"; do
    rpmspec -P --with gnoblin_stack --with gnoblin_compat_runtime "$spec" >/dev/null
    rpmspec -q --buildrequires --with gnoblin_stack --with gnoblin_compat_runtime "$spec"
done |
    sed '/^gnoblin-/d' |
    LC_ALL=C sort -u >"$requirements"

if ((install)) && [[ -s "$requirements" ]]; then
    mapfile -t packages <"$requirements"
    for attempt in 1 2 3; do
        if dnf -y --setopt=install_weak_deps=False install "${packages[@]}"; then
            printf 'PASS: Enterprise Linux repository BuildRequires installed with private runtime\n'
            exit 0
        fi
        if ((attempt < 3)); then
            dnf -y makecache
            sleep "$((attempt * 10))"
        fi
    done
    exit 1
fi

if [[ -s "$requirements" ]]; then
    xargs -r -d '\n' printf '%s\n' <"$requirements"
fi
printf 'PASS: Enterprise Linux repository BuildRequires resolved with private runtime\n'
