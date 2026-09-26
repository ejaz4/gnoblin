# openSUSE Tumbleweed package recipe.  This package deliberately keeps GNOME
# 51 schemas under Gnoblin's prefix, so it cannot replace the host schemas.
%global _prefix /usr/lib/gnoblin
%global _datadir %{_prefix}/share
%global _includedir %{_prefix}/include
%global debug_package %{nil}
%bcond_with gnoblin_compat_runtime

Name:           gnoblin-gsettings-desktop-schemas
Version:        51.0
Release:        1%{?dist}
Summary:        Private GNOME desktop schemas for Gnoblin
License:        LGPL-2.1-or-later
URL:            https://github.com/kierandrewett/gnoblin
Source0:        gsettings-desktop-schemas-%{version}.tar.xz
BuildRequires:  gcc
BuildRequires:  gettext-tools
BuildRequires:  meson
%if %{with gnoblin_compat_runtime}
BuildRequires:  gnoblin-compat-runtime >= %{version}
Requires:       gnoblin-compat-runtime >= %{version}
%else
BuildRequires:  pkgconfig(gio-2.0)
BuildRequires:  pkgconfig(gobject-introspection-1.0)
Requires:       glib2
%endif

%description
GNOME desktop GSettings schemas installed in Gnoblin's private prefix.  They
provide the matching GNOME major without replacing the host desktop schemas.

%prep
%autosetup -n gsettings-desktop-schemas-%{version}

%build
%if %{with gnoblin_compat_runtime}
export PATH=%{_prefix}/deps/bin:$PATH
export PKG_CONFIG_PATH=%{_prefix}/deps/lib64/pkgconfig:%{_prefix}/deps/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}
export GI_GIR_PATH=%{_prefix}/deps/share/gir-1.0${GI_GIR_PATH:+:$GI_GIR_PATH}
export GI_TYPELIB_PATH=%{_prefix}/deps/lib64/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}
export LD_LIBRARY_PATH=%{_prefix}/deps/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
%endif
# The openSUSE RPM macro derives the Meson executable from _bindir.  Gnoblin
# makes _bindir private, but Meson itself is host build tooling.
/usr/bin/meson setup build . --buildtype=plain \
  --prefix=%{_prefix} --libdir=%{_libdir} --libexecdir=%{_libexecdir} \
  --bindir=%{_bindir} --sbindir=%{_sbindir} --includedir=%{_includedir} \
  --datadir=%{_datadir} --mandir=%{_mandir} --infodir=%{_infodir} \
  --localedir=%{_datadir}/locale --sysconfdir=%{_sysconfdir} \
  --localstatedir=%{_localstatedir} --sharedstatedir=%{_sharedstatedir} \
  --wrap-mode=nodownload --auto-features=enabled
/usr/bin/meson compile -C build %{?_smp_mflags}

%install
DESTDIR=%{buildroot} /usr/bin/meson install -C build --no-rebuild
rm -f %{buildroot}%{_datadir}/glib-2.0/schemas/gschemas.compiled

%posttrans
/usr/bin/glib-compile-schemas %{_datadir}/glib-2.0/schemas

%postun
if [ -d %{_datadir}/glib-2.0/schemas ]; then
  /usr/bin/glib-compile-schemas %{_datadir}/glib-2.0/schemas
fi

%files
%license COPYING
%{_prefix}/
%ghost %{_datadir}/glib-2.0/schemas/gschemas.compiled

%changelog
* Fri Sep 25 2026 Gnoblin contributors
- Initial openSUSE Tumbleweed adapter.
