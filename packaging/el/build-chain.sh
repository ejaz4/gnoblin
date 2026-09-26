#!/usr/bin/env bash
# Build the complete private Gnoblin RPM chain on Enterprise Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/retry-command.sh"
TOPDIR="${1:?usage: $0 <rpmbuild-topdir>}"
TOPDIR="$(realpath -m "$TOPDIR")"
SOURCES="$TOPDIR/SOURCES"
mkdir -p "$SOURCES" "$TOPDIR/BUILDROOT"

build() {
    local spec="$1"
    shift
    rpmbuild -ba --define "_topdir $TOPDIR" --define "_sourcedir $SOURCES" "$@" "$ROOT/packaging/el/$spec"
}

install_output() {
    dnf -y --setopt=install_weak_deps=False --nogpgcheck install "$@"
}

# EPEL provides development interfaces which are not part of the Enterprise
# Linux base repositories.  CRB is named PowerTools on EL 8; accepting either
# name keeps this adapter on each currently supported EL major.
dnf -y install dnf-plugins-core epel-release
dnf config-manager --set-enabled crb || dnf config-manager --set-enabled powertools || true
"$ROOT/packaging/rpm/provision-compat-container.sh"
# The GNOME 51 gdk-pixbuf build consumes this interface while composing the
# private runtime.  It is a host build tool and remains outside the RPM.
dnf -y install \
    fontconfig-devel freetype-devel libjpeg-turbo-devel libpng-devel libX11-devel pixman-devel shared-mime-info
dnf -y install rpm-build redhat-rpm-config
install -d -o gnoblin-build -g gnoblin-build /usr/lib/gnoblin
mkdir -p "$ROOT/build"
chown -R gnoblin-build:gnoblin-build "$ROOT/build"
runuser -u gnoblin-build -- env GNOBLIN_BUILD_JOBS="${GNOBLIN_BUILD_JOBS:-2}" \
    "$ROOT/packaging/rpm/build-compat-runtime.sh"
tar -C /usr/lib/gnoblin -cJf "$SOURCES/gnoblin-compat-runtime-51.0.tar.xz" deps
build compat-runtime.spec
mapfile -t compat_rpms < <(find "$TOPDIR/RPMS" -type f -name 'gnoblin-compat-runtime-[0-9]*.rpm' | LC_ALL=C sort)
((${#compat_rpms[@]} == 1))
install_output "${compat_rpms[@]}"

export PATH="/opt/gnoblin-rpm-compat-tools/bin:/usr/lib/gnoblin/deps/bin:$PATH"
"$ROOT/packaging/el/check-buildrequires.sh" --install
gnoblin_retry_command git -C "$ROOT" submodule foreach --recursive 'git fetch --force --tags origin'
for project in gsettings-desktop-schemas mutter gnome-shell; do
    "$ROOT/scripts/make-tarball.sh" "$project" "$SOURCES"
done

build gsettings-desktop-schemas.spec --with gnoblin_compat_runtime
mapfile -t schema_rpms < <(find "$TOPDIR/RPMS" -type f -name 'gnoblin-gsettings-desktop-schemas-[0-9]*.rpm' | LC_ALL=C sort)
((${#schema_rpms[@]} == 1))
install_output "${schema_rpms[@]}"

build mutter.spec --with gnoblin_stack --with gnoblin_compat_runtime
mapfile -t mutter_rpms < <(find "$TOPDIR/RPMS" -type f \( -name 'gnoblin-mutter-[0-9]*.rpm' -o -name 'gnoblin-mutter-devel-[0-9]*.rpm' \) | LC_ALL=C sort)
((${#mutter_rpms[@]} == 2))
install_output "${mutter_rpms[@]}"

build gnome-shell.spec --with gnoblin_stack --with gnoblin_compat_runtime
build gnoblin.spec
find "$TOPDIR/RPMS" -type f -name '*.rpm' -print | LC_ALL=C sort
