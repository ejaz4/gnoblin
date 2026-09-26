# Generated from this template by scripts/sync-package-manifest.py.
Name:           gnoblin
Version:        0.1.10
Release:        1%{?dist}
Summary:        Gnoblin desktop session
License:        GPL-2.0-or-later
URL:            https://github.com/kierandrewett/gnoblin
BuildArch:      noarch
Requires:       gnoblin-gsettings-desktop-schemas >= 51
Requires:       gnoblin-mutter >= 51
Requires:       gnoblin-session >= 51
Requires:       gnoblin-shell >= 51
Requires:       brightnessctl
Requires:       gnome-session
Requires:       playerctl
Requires:       wireplumber
Requires:       gnoblin-compat-runtime >= 51

%description
Installs the complete Gnoblin session while reusing compatible GNOME userspace.

%files

%changelog
* Fri Sep 25 2026 Gnoblin contributors
- Initial openSUSE Tumbleweed adapter.
