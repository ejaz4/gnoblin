# Arch Linux and CachyOS

Gnoblin releases can include an x86_64 Arch package. When the
[latest Gnoblin release](https://github.com/kierandrewett/gnoblin/releases/latest)
has an asset named `gnoblin-arch-x86_64.pkg.tar.zst`, download it and install
it with:

```sh
curl -fLO https://github.com/kierandrewett/gnoblin/releases/latest/download/gnoblin-arch-x86_64.pkg.tar.zst
sudo pacman -U ./gnoblin-arch-x86_64.pkg.tar.zst
```

`pacman` obtains the runtime dependencies from your configured Arch
repositories. This package does not replace Arch's `gnome-shell` or `mutter`.
It does not install compiler tools or Inkscape.

The Arch package candidate has passed clean installation, coexistence with
stock GNOME and removal checks in an Arch container. A graphical Gnoblin login
still needs verification, so keep GNOME or another working session available.
See [platform support](platform-support.md) for the current status.

## Choose a shell and test the session

[Install a desktop shell](bring-your-own-shell.md) for a bar and launcher.
Then log out, select **Gnoblin** in your display manager's session menu, and
log in. Return to GNOME if the session does not start.

Continue with [configuration](/config).

## Update

Run the same commands after a newer release is published. `pacman` replaces
the previous Gnoblin package and keeps Arch's GNOME packages installed
separately.

## Remove

Log in to GNOME or another session first, then run:

```sh
sudo pacman -Rns gnoblin
```

Your configuration in `~/.config/gnoblin` is kept.

## Build the source recipe

The [PKGBUILD](https://github.com/kierandrewett/gnoblin/tree/main/packaging/arch)
is available for package maintainers and developers. It compiles the private
GNOME runtime and needs Arch build dependencies. It is not the normal
installation path.
