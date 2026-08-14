#!/usr/bin/env python3
"""Parse-level checks that a per-file syntax check structurally cannot do.

Both simulators are plain scripts with no build step, so nothing sits between a
typo and the deployed site. Two failure modes have already bitten this project,
and neither is visible to `node --check` run file by file:

1.  The iPhone's extension scripts are classic (non-module) scripts. They share
    ONE global lexical environment with the inline script in index.html, so two
    top-level `const`/`let`/`class` declarations of the same name are a fatal
    SyntaxError — but only once the browser has merged them. The offending
    script fails to evaluate in its entirety while everything after it keeps
    loading, so the home screen still looks right and the apps throw
    ReferenceErrors when opened. Concatenating the inline body with the
    extension scripts in load order reproduces it exactly.

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
    files = script_files(MAC / "scripts") + script_files(IPHONE / "scripts")
    for path in files:
        error = node_check(path.read_text(encoding="utf-8"), str(path.relative_to(ROOT)))
        if error:
            failures.append(f"{path.relative_to(ROOT)} does not parse:\n{error}")
        else:
            say(f"  ok  {path.relative_to(ROOT)}")
    print(f"per-file parse: {len(files)} files")


# ------------------------------------------------------- iPhone global scope ---

def inline_script_body(html: str) -> str:
    """The last and largest <script> block in iphone/index.html — the framework.

    Located by scanning rather than by line number: the boundaries move every
    time the file is edited, and a hardcoded offset would rot silently into a
    check that passes because it is reading the wrong bytes.
    """
    blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
    if not blocks:
        raise SystemExit("check-syntax: found no inline <script> in iphone/index.html")
    return max(blocks, key=len)


def loaded_scripts(html: str) -> list[Path]:
    """The extension scripts, in the exact order the <script src> tags appear."""
    return [IPHONE / src for src in re.findall(r'<script\s+src="([^"]+)"', html)]


def check_iphone_global_scope() -> str:
    html = (IPHONE / "index.html").read_text(encoding="utf-8")
    inline = inline_script_body(html)
    ordered = loaded_scripts(html)

    missing = [p for p in ordered if not p.exists()]
    if missing:
        failures.append(
            "iphone/index.html references scripts that do not exist: "
            + ", ".join(str(p.relative_to(ROOT)) for p in missing)
        )

    parts = [f"/* --- inline <script> from iphone/index.html --- */\n{inline}"]
    for path in ordered:
        if path.exists():
            parts.append(
                f"/* --- {path.relative_to(ROOT)} --- */\n" + path.read_text(encoding="utf-8")
            )
    combined = "\n".join(parts)

    error = node_check(combined, "iphone (inline + extension scripts, concatenated)")
    if error:
        failures.append(
            "the iPhone's scripts do not parse when merged into one global scope.\n"
            "This is what the browser actually does, and a collision here kills a whole\n"
            "script silently — the home screen still renders and the apps throw when opened.\n"
            + error
        )
    print(
        f"iPhone global scope: inline + {len(ordered)} scripts = "
        f"{combined.count(chr(10)) + 1} lines"
    )
    return combined


# ------------------------------------------------------ duplicate functions ---

DECLARATION = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", re.M)


def check_duplicate_functions(iphone_source: str) -> None:
    """`node --check` accepts duplicate function declarations; we should not."""
    seen: dict[str, int] = {}
    for name in DECLARATION.findall(iphone_source):
        seen[name] = seen.get(name, 0) + 1
    duplicates = sorted(name for name, count in seen.items() if count > 1)
    if duplicates:
        failures.append(
            "duplicate top-level function names in the iPhone's shared global scope "
            "(the later declaration silently wins): " + ", ".join(duplicates)
        )
    print(f"iPhone function names: {len(seen)} top-level, {len(duplicates)} duplicated")

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


def main() -> int:
    print("Checking simulator sources…")
    check_each_file()
    combined = check_iphone_global_scope()
    check_duplicate_functions(combined)

    if failures:
        print(f"\nFAILED — {len(failures)} problem(s):\n", file=sys.stderr)
        for failure in failures:
            print(f"  * {failure}\n", file=sys.stderr)
        return 1
    print("\nAll syntax checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
