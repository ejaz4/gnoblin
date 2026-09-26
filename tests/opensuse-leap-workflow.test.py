#!/usr/bin/env python3
"""Keep the Leap release gate distinct from the rolling Tumbleweed gate."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OpenSUSELeapWorkflowTests(unittest.TestCase):
    def test_build_checkouts_retry_pinned_submodules(self):
        for filename in ("opensuse-rpm.yml", "opensuse-leap.yml"):
            workflow = (ROOT / ".github/workflows" / filename).read_text()

            self.assertIn("submodules: false", workflow)
            self.assertIn("git submodule sync --recursive", workflow)
            self.assertIn("./scripts/checkout-submodules-with-retry.sh", workflow)

    def test_each_supported_leap_base_builds_the_private_rpm_chain(self):
        workflow = (ROOT / ".github/workflows/opensuse-leap.yml").read_text()

        self.assertIn("workflow_call:", workflow)
        self.assertIn("registry.opensuse.org/opensuse/leap:${{ matrix.version }}", workflow)
        self.assertIn('version: "15.5"', workflow)
        self.assertIn('version: "15.6"', workflow)
        self.assertIn('version: "16.0"', workflow)
        self.assertIn("bash packaging/opensuse/build-chain.sh", workflow)
        self.assertIn('GNOBLIN_COMPAT_RUNTIME: "1"', workflow)
        self.assertIn("scripts/check-rpm-isolation.py", workflow)
        self.assertIn("gnoblin-compat-runtime-[0-9]*.rpm", workflow)
        self.assertIn("opensuse-leap-15.5-rpms", workflow)
        self.assertIn("opensuse-leap-15.6-rpms", workflow)
        self.assertIn("opensuse-leap-16.0-rpms", workflow)

    def test_each_leap_build_is_installed_beside_and_removed_from_stock_gnome(self):
        workflow = (ROOT / ".github/workflows/opensuse-leap.yml").read_text()
        coinstall = workflow.split("\n  coinstall:\n", 1)[1]

        self.assertIn("needs: build", coinstall)
        self.assertIn("gdm gnome-session gnome-shell mutter xdg-desktop-portal-gnome", coinstall)
        self.assertIn("rpm -V gnome-session gnome-shell mutter", coinstall)
        self.assertGreaterEqual(coinstall.count("rpm -V gnome-session gnome-shell mutter"), 2)
        self.assertIn("zypper --non-interactive remove", coinstall)
        self.assertIn("! test -e /usr/share/wayland-sessions/gnoblin.desktop", coinstall)
        self.assertIn("! test -e /usr/lib/systemd/user/org.gnoblin.Shell.target", coinstall)

    def test_legacy_leap_bases_use_the_private_python_toolchain(self):
        provision = (ROOT / "packaging/rpm/provision-compat-container.sh").read_text()
        runtime = (ROOT / "packaging/rpm/build-compat-runtime.sh").read_text()
        bootstrap = (ROOT / "packaging/rpm/build-compat-bootstrap.sh").read_text()
        for script in (provision, runtime, bootstrap):
            self.assertIn("opensuse-leap:15.5 | opensuse-leap:15.6", script)
        self.assertIn("libexpat-devel libxml2-devel", provision)
        self.assertIn("install --allow-downgrade --no-recommends", provision)

    def test_bootstrap_installs_checkout_tools_before_actions_checkout(self):
        workflow = (ROOT / ".github/workflows/rpm-compat-bootstrap.yml").read_text()
        self.assertLess(workflow.index("- name: Install checkout tools"), workflow.index("- uses: actions/checkout@v4"))
        self.assertIn("zypper --non-interactive install --no-recommends git tar", workflow)
        self.assertIn("dnf -qy install git tar", workflow)


if __name__ == "__main__":
    unittest.main()
