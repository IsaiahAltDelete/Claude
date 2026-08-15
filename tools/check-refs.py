#!/usr/bin/env python3
"""Integrity checks on the string namespaces both simulators key off.

Neither simulator throws on a bad name. `Mac.glyph` substitutes the generic
'info' icon for anything it does not recognise; `Mac.run`'s default branch
reports an unknown command as "not implemented", which looks identical to a
deliberately unbuilt feature; the iPhone's App Library silently drops app ids it
cannot resolve. Every one of those namespaces therefore drifts without a symptom
anyone would report, which is exactly why this file exists.

Checks:
  1. Every settings-pane name resolves to a real glyph (via the slug rules
     Mac.paneIcon applies), rather than falling through to 'info'.
  2. Every `data-command` in the Mac's markup has a `case` in the router.
  3. Every app id the iPhone's App Library, home-screen pages and dock name is
     an app that actually gets defined.
  4. Every `Mac.appIcon(...)` name has a matching file in mac/assets/icons.

Usage:  python3 tools/check-refs.py [--verbose]
Exits non-zero if any invariant is broken. No dependencies.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAC = ROOT / "mac"
IPHONE = ROOT / "iphone"

VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv
failures: list[str] = []


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def mac_sources() -> str:
    return "\n".join(read(p) for p in sorted((MAC / "scripts").glob("*.js")))


def block(source: str, start: str) -> str:
    """The bracketed or braced literal that follows a marker."""
    index = source.index(start)
    opener = start.rstrip()[-1]
    closer = {"{": "}", "[": "]"}[opener]
    depth = 0
    for offset in range(index, len(source)):
        if source[offset] == opener:
            depth += 1
        elif source[offset] == closer:
            depth -= 1
            if depth == 0:
                return source[index : offset + 1]
    raise SystemExit(f"check-refs: could not find the end of {start!r}")


# --------------------------------------------------------------- glyph names ---

def slug(name: str) -> str:
    """The transform Mac.paneIcon applies before looking a glyph up."""
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def check_pane_glyphs(source: str) -> None:
    glyphs = set(re.findall(r"^\s{4}'?([a-zA-Z][\w-]*)'?:", block(source, "const G = {"), re.M))
    aliases = set(re.findall(r"'?([a-zA-Z][\w-]*)'?:", block(source, "const ALIAS = {")))
    known = glyphs | aliases

    # GROUPS in 20-settings.js is the single source of pane names: it drives the
    # sidebar, the search index and the icon lookup alike.
    settings = read(MAC / "scripts" / "20-settings.js")
    panes = set(re.findall(r"'([^']+)'", block(settings, "const GROUPS = [")))
    panes |= set(re.findall(r"Mac\.paneIcon\('([^']+)'", source))

    unresolved = sorted(p for p in panes if slug(p) not in known)
    if unresolved:
        failures.append(
            "settings panes whose icon silently falls back to the generic 'info' glyph "
            "(Mac.paneIcon slugifies the name, Mac.glyph substitutes on a miss):\n      "
            + "\n      ".join(f"{p!r} -> looked up {slug(p)!r}" for p in unresolved)
        )
    print(f"pane glyphs: {len(panes)} panes, {len(glyphs)} glyphs, {len(aliases)} aliases, {len(unresolved)} unresolved")


def check_app_icons(source: str) -> None:
    available = {p.stem for p in (MAC / "assets" / "icons").glob("*.svg")}
    # Only Mac.appIcon() and an app's registered `icon` name a file; `icon:` on a
    # settings row names a glyph, which is a different namespace entirely.
    wanted = set(re.findall(r"Mac\.appIcon\('([a-z0-9-]+)'", source))
    wanted |= set(re.findall(r"registerApp\(\{[^}]*?icon: '([a-z0-9-]+)'", source, re.S))
    missing = sorted(w for w in wanted if w not in available)
    if missing:
        failures.append("Mac icon names with no file in mac/assets/icons: " + ", ".join(missing))
    print(f"mac icons: {len(wanted)} referenced, {len(available)} on disk, {len(missing)} missing")


# ------------------------------------------------------------- mac commands ---

def check_mac_commands(source: str) -> None:
    events = read(MAC / "scripts" / "40-events.js")
    handled = set(re.findall(r"case '([a-z0-9-]+)':", events))
    # A few commands are intercepted ahead of the switch rather than cased.
    handled |= set(re.findall(r"command === '([a-z0-9-]+)'", events))

    markup = source + read(MAC / "index.html")
    used = set(re.findall(r"""data-command=["']([a-z0-9-]+)["']""", markup))
    used |= set(re.findall(r"""command: '([a-z0-9-]+)'""", markup))
    used |= set(re.findall(r"""Mac\.run\('([a-z0-9-]+)'""", markup))

    unhandled = sorted(c for c in used if c not in handled)
    if unhandled:
        failures.append(
            "commands dispatched but never handled — Mac.run's default branch reports these as "
            '"not implemented", which is indistinguishable from a deliberate stub:\n      '
            + ", ".join(unhandled)
        )
    print(f"mac commands: {len(used)} dispatched, {len(handled)} handled, {len(unhandled)} unhandled")


# -------------------------------------------------------------- iphone apps ---

def check_iphone_app_ids() -> None:
    html = read(IPHONE / "index.html")
    scripts = "\n".join(read(p) for p in sorted((IPHONE / "scripts").glob("*.js")))
    everything = html + scripts

    defined = set(re.findall(r"defineApp\(\{\s*(?:\n\s*)?id\s*:\s*'([a-z0-9]+)'", everything))
    defined |= set(re.findall(r"defineApp\(\{id:'([a-z0-9]+)'", everything))
    # The App Store registers its catalogue in bulk from STORE entries.
    defined |= set(re.findall(r"\{id:'([a-z0-9]+)',name:", everything))

    referenced: dict[str, set[str]] = {}
    for label, pattern in (
        ("DOCK", r"const DOCK\s*=\s*\[([^\]]*)\]"),
        ("PAGE1", r"const PAGE1\s*=\s*\[([^\]]*)\]"),
        ("EXTRA_APPS", r"const EXTRA_APPS = \[(.*?)\]"),
        ("LIBRARY_CATEGORIES", r"const LIBRARY_CATEGORIES = \[(.*?)\n\];"),
    ):
        match = re.search(pattern, everything, re.S)
        if match:
            referenced[label] = set(re.findall(r"'([a-z0-9]+)'", match.group(1)))

    # The App Library deliberately lists ids that may not exist in every build.
    optional = {"news", "games"}
    for label, ids in referenced.items():
        unknown = sorted(i for i in ids if i not in defined and i not in optional)
        if unknown:
            failures.append(f"iPhone {label} names apps that are never defined: " + ", ".join(unknown))
        if VERBOSE:
            print(f"  {label}: {len(ids)} ids, {len(unknown)} unknown")
    print(f"iphone app ids: {len(defined)} defined across {len(referenced)} id lists")


def main() -> int:
    print("Checking cross-references…")
    source = mac_sources()
    check_pane_glyphs(source)
    check_app_icons(source)
    check_mac_commands(source)
    check_iphone_app_ids()

    if failures:
        print(f"\nFAILED — {len(failures)} problem(s):\n", file=sys.stderr)
        for failure in failures:
            print(f"  * {failure}\n", file=sys.stderr)
        return 1
    print("\nAll reference checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
