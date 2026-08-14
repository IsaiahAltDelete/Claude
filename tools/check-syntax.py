#!/usr/bin/env python3
"""Parse-level checks that a per-file syntax check structurally cannot do.

The simulators are plain scripts with no build step, so nothing sits between a
typo and the deployed site. Two failure modes have already bitten this project,
and neither is visible to `node --check` run file by file:

1.  The iPhone's and the Roku's scripts are classic (non-module) scripts. Each
    simulator's set shares ONE global lexical environment, so two top-level
    `const`/`let`/`class` declarations of the same name are a fatal
    SyntaxError — but only once the browser has merged them. The offending
    script fails to evaluate in its entirety while everything after it keeps
    loading, so the page still looks right and the apps throw ReferenceErrors
    when opened. Concatenating the files in load order reproduces it exactly.

2.  Duplicate top-level `function` declarations are legal JavaScript: the later
    one silently wins. With hundreds of functions in one flat namespace, giving
    a new app module a generic helper name quietly replaces someone else's.

The Mac needs neither check across files — every mac/scripts/*.js wraps its body
in `(function (Mac) { … }(window.Mac))`, so its declarations are function-scoped
— but it gets the per-file parse and a within-file duplicate scan.

Usage:  python3 tools/check-syntax.py [--verbose]
Exits non-zero on the first category that fails. No dependencies beyond node.
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IPHONE = ROOT / "iphone"
MAC = ROOT / "mac"
ROKU = ROOT / "roku"

VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv
failures: list[str] = []


def say(message: str) -> None:
    if VERBOSE:
        print(message)


def node_check(source: str, label: str) -> str | None:
    """Run `node --check` over a string. Returns the error text, or None."""
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
        handle.write(source)
        path = handle.name
    try:
        result = subprocess.run(
            ["node", "--check", path], capture_output=True, text=True, check=False
        )
    finally:
        Path(path).unlink(missing_ok=True)
    if result.returncode == 0:
        return None
    # node reports the temp path; swap in something the reader can act on.
    return result.stderr.replace(path, label).strip()


def script_files(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.js"))


# ---------------------------------------------------------------- per file ---

def check_each_file() -> None:
    files = (script_files(MAC / "scripts") + script_files(IPHONE / "scripts")
             + script_files(ROKU / "scripts"))
    for path in files:
        error = node_check(path.read_text(encoding="utf-8"), str(path.relative_to(ROOT)))
        if error:
            failures.append(f"{path.relative_to(ROOT)} does not parse:\n{error}")
        else:
            say(f"  ok  {path.relative_to(ROOT)}")
    print(f"per-file parse: {len(files)} files")


# -------------------------------------------------------- shared global scope ---

def inline_script_body(html: str) -> str:
    """The largest inline <script> block in a page, or "" if there is none.

    Located by scanning rather than by line number: the boundaries move every
    time the file is edited, and a hardcoded offset would rot silently into a
    check that passes because it is reading the wrong bytes.
    """
    blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
    if not blocks:
        return ""
    return max(blocks, key=len)


def loaded_scripts(html: str, base: Path = None) -> list[Path]:
    """The scripts a page loads, in the exact order the <script src> tags appear."""
    root = base or IPHONE
    return [root / src for src in re.findall(r'<script\s+src="([^"]+)"', html)]


def check_global_scope(name: str, directory: Path) -> str:
    """Concatenate a simulator's scripts the way the browser merges them.

    Applies to any simulator whose scripts are plain classic scripts rather
    than IIFE-wrapped — currently the iPhone and the Roku. Both put every
    top-level declaration into one shared lexical environment, so two `const`
    declarations of the same name anywhere across the set are a fatal
    SyntaxError that only exists once they are merged. The Mac is exempt
    because each of its files wraps its body in `(function (Mac) { … })`.
    """
    html = (directory / "index.html").read_text(encoding="utf-8")
    inline = inline_script_body(html)
    ordered = loaded_scripts(html, directory)

    missing = [p for p in ordered if not p.exists()]
    if missing:
        failures.append(
            f"{name}/index.html references scripts that do not exist: "
            + ", ".join(str(p.relative_to(ROOT)) for p in missing)
        )

    parts = []
    if inline.strip():
        parts.append(f"/* --- inline <script> from {name}/index.html --- */\n{inline}")
    for path in ordered:
        if path.exists():
            parts.append(
                f"/* --- {path.relative_to(ROOT)} --- */\n" + path.read_text(encoding="utf-8")
            )
    combined = "\n".join(parts)

    error = node_check(combined, f"{name} (inline + scripts, concatenated)")
    if error:
        failures.append(
            f"the {name}'s scripts do not parse when merged into one global scope.\n"
            "This is what the browser actually does, and a collision here kills a whole\n"
            "script silently — the page still renders and the app throws when opened.\n"
            + error
        )
    print(
        f"{name} global scope: {'inline + ' if inline.strip() else ''}{len(ordered)} scripts = "
        f"{combined.count(chr(10)) + 1} lines"
    )
    return combined


# ------------------------------------------------------ duplicate functions ---

DECLARATION = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", re.M)


def check_duplicate_functions(label: str, source: str) -> None:
    """`node --check` accepts duplicate function declarations; we should not."""
    seen: dict[str, int] = {}
    for name in DECLARATION.findall(source):
        seen[name] = seen.get(name, 0) + 1
    duplicates = sorted(name for name, count in seen.items() if count > 1)
    if duplicates:
        failures.append(
            f"duplicate top-level function names in the {label}'s shared global scope "
            "(the later declaration silently wins): " + ", ".join(duplicates)
        )
    print(f"{label} function names: {len(seen)} top-level, {len(duplicates)} duplicated")


def check_mac_duplicates() -> None:
    # Mac files are IIFE-wrapped, so a collision is file-local — still a bug.
    mac_duplicates: list[str] = []
    for path in script_files(MAC / "scripts"):
        counts: dict[str, int] = {}
        for name in DECLARATION.findall(path.read_text(encoding="utf-8")):
            counts[name] = counts.get(name, 0) + 1
        mac_duplicates += [
            f"{path.relative_to(ROOT)}:{name}" for name, count in counts.items() if count > 1
        ]
    if mac_duplicates:
        failures.append("duplicate function names within a Mac script: " + ", ".join(mac_duplicates))


APP_ID = re.compile(r"defineApp\(\{\s*(?:/\*(?:(?!\*/).)*?\*/\s*)?id\s*:\s*'([a-z0-9-]+)'", re.S)
TOP_LEVEL = re.compile(r"^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=)", re.M)


def check_shadowed_apps() -> None:
    """An inline app that a later extension script redefines is unreachable.

    `defineApp` is overwrite-by-id, and index.html is parsed before every
    script in scripts/. So an app defined in both places keeps the inline
    definition — and every helper only it calls — resident in the shared
    global scope with no way to reach it. Six of these had accumulated,
    accounting for roughly 230 lines, and the only symptom was that editing
    the inline version changed nothing.
    """
    html = (IPHONE / "index.html").read_text()
    inline_ids = APP_ID.findall(inline_script_body(html))
    script_ids = {app for path in loaded_scripts(html) for app in APP_ID.findall(path.read_text())}
    print(f"iPhone apps: {len(inline_ids)} inline, {len(script_ids)} from scripts, "
          f"{len(set(inline_ids) & script_ids)} shadowed")
    for path in loaded_scripts(html):
        for app in APP_ID.findall(path.read_text()):
            if app in inline_ids:
                failures.append(
                    f"iphone/index.html defines the '{app}' app, which "
                    f"{path.relative_to(ROOT)} then overwrites — the inline one is dead code"
                )


def check_unreferenced(iphone_source: str) -> None:
    """Top-level names in index.html that nothing anywhere refers to.

    Only the inline block is scanned for declarations: the extension scripts
    are the live code and are expected to export into the shared scope for
    each other. This catches the helpers left stranded when an app is
    superseded, which is the shape the dead code actually takes.
    """
    inline = inline_script_body((IPHONE / "index.html").read_text())
    orphans = []
    for match in TOP_LEVEL.finditer(inline):
        name = match.group(1) or match.group(2)
        # `$` and `$$` are not word characters, so a boundary match is unreliable.
        if name in {"$", "$$"}:
            continue
        uses = re.findall(rf"(?<![\w$]){re.escape(name)}(?![\w$])", iphone_source)
        if len(uses) <= 1:
            line = inline.count("\n", 0, match.start()) + 1
            orphans.append(f"{name} (inline line ~{line})")
    print(f"iPhone inline scope: {len(TOP_LEVEL.findall(inline))} top-level names, "
          f"{len(orphans)} unreferenced")
    if orphans:
        failures.append(
            "unreferenced top-level declarations in iphone/index.html: " + ", ".join(orphans)
        )


def main() -> int:
    print("Checking simulator sources…")
    check_each_file()
    iphone = check_global_scope("iPhone", IPHONE)
    check_duplicate_functions("iPhone", iphone)
    if (ROKU / "index.html").exists():
        roku = check_global_scope("Roku", ROKU)
        check_duplicate_functions("Roku", roku)
    check_mac_duplicates()
    check_shadowed_apps()
    check_unreferenced(iphone)

    if failures:
        print(f"\nFAILED — {len(failures)} problem(s):\n", file=sys.stderr)
        for failure in failures:
            print(f"  * {failure}\n", file=sys.stderr)
        return 1
    print("\nAll syntax checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
