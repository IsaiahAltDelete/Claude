#!/usr/bin/env python3
"""Generate the local asset pack for the macOS troubleshooting simulator.

Everything the simulator draws is produced here so the project stays fully
offline: app icons, document/volume glyphs and the desktop wallpapers. Run

    python3 tools/build-assets.py

from the repository root after editing any definition below.
"""

from __future__ import annotations

import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "mac"
ICONS = SITE / "assets" / "icons"
WALLS = SITE / "assets" / "wallpapers"

SIZE = 128
# macOS app icons sit on a superellipse ("squircle") rather than a rounded
# rectangle. n=5 with a 0.90 inset matches the Big Sur..Tahoe icon grid closely.
SQUIRCLE_N = 5.0
SQUIRCLE_INSET = 0.90


def squircle_path(size: int = SIZE, n: float = SQUIRCLE_N, inset: float = SQUIRCLE_INSET) -> str:
    """Return an SVG path for a superellipse |x|^n + |y|^n = r^n."""
    cx = cy = size / 2
    r = size / 2 * inset
    points = []
    steps = 180
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(ct) ** (2 / n), ct)
        y = cy + r * math.copysign(abs(st) ** (2 / n), st)
        points.append(f"{x:.2f} {y:.2f}")
    return "M" + "L".join(points) + "Z"


SQUIRCLE = squircle_path()


def gear_path(cx: float, cy: float, outer: float, inner: float, teeth: int = 8,
              tooth_ratio: float = 0.52) -> str:
    """Polygon path for a cog with flat-topped teeth."""
    points = []
    step = 2 * math.pi / teeth
    half = step * tooth_ratio / 2
    for i in range(teeth):
        a = i * step
        for t in (a - half, a + half):
            points.append((cx + outer * math.cos(t), cy + outer * math.sin(t)))
        for t in (a + half, a + step - half):
            points.append((cx + inner * math.cos(t), cy + inner * math.sin(t)))
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in points) + "Z"


def gradient(stops: list[tuple[float, str]], gid: str, angle: str = "vertical") -> str:
    coords = {
        "vertical": 'x1="64" y1="8" x2="64" y2="120"',
        "diagonal": 'x1="16" y1="10" x2="112" y2="118"',
        "horizontal": 'x1="8" y1="64" x2="120" y2="64"',
    }[angle]
    marks = "".join(
        f'<stop offset="{offset}" stop-color="{color}"/>' for offset, color in stops
    )
    return (
        f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" {coords}>{marks}</linearGradient>'
    )


def app_icon(name: str, stops, glyph: str, angle: str = "vertical", extra_defs: str = "") -> None:
    """Write a squircle app icon with the shared macOS lighting treatment."""
    gid = f"g-{name}"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{name}">
 <defs>
  {gradient(stops, gid, angle)}
  <linearGradient id="sheen-{name}" gradientUnits="userSpaceOnUse" x1="64" y1="8" x2="64" y2="70">
   <stop offset="0" stop-color="#ffffff" stop-opacity=".34"/>
   <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="clip-{name}"><path d="{SQUIRCLE}"/></clipPath>
  {extra_defs}
 </defs>
 <path d="{SQUIRCLE}" fill="url(#{gid})"/>
 <g clip-path="url(#clip-{name})">
  <path d="{SQUIRCLE}" fill="url(#sheen-{name})"/>
  {glyph}
 </g>
 <path d="{SQUIRCLE}" fill="none" stroke="#ffffff" stroke-opacity=".26" stroke-width="1.4"/>
</svg>
"""
    (ICONS / f"{name}.svg").write_text(svg)


def raw_icon(name: str, body: str) -> None:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" '
        f'aria-label="{name}">{body}</svg>\n'
    )
    (ICONS / f"{name}.svg").write_text(svg)


WHITE = "#ffffff"

# --------------------------------------------------------------------------
# App icons
# --------------------------------------------------------------------------

APP_ICONS: dict[str, dict] = {}


def define(name, stops, glyph, angle="vertical", extra_defs=""):
    APP_ICONS[name] = dict(stops=stops, glyph=glyph, angle=angle, extra_defs=extra_defs)


# Finder — the two-tone Mac face.
define(
    "finder",
    [(0, "#4aa8f0"), (1, "#1a63c9")],
    """
  <path d="M64 0h53v128H64z" fill="#2b7fdd"/>
  <path d="M11 0h53v128H11z" fill="url(#face-left)"/>
  <!-- Eyes and a smile that spans the split, each half in the contrasting tone. -->
  <g stroke-width="6.4" stroke-linecap="round" fill="none">
   <path d="M41 43v15" stroke="#16395e"/>
   <path d="M87 43v15" stroke="#ffffff"/>
   <path d="M38 78q13 14 26 14" stroke="#16395e"/>
   <path d="M64 92q13 0 26-14" stroke="#ffffff"/>
  </g>
""",
    extra_defs=(
        '<linearGradient id="face-left" gradientUnits="userSpaceOnUse" x1="11" y1="0" x2="11" y2="128">'
        '<stop offset="0" stop-color="#eaf5ff"/><stop offset="1" stop-color="#c3ddf3"/></linearGradient>'
    ),
)

define(
    "launchpad",
    [(0, "#f0f3f8"), (1, "#b9c3d2")],
    """
  <g fill="#5a6474">
   <rect x="30" y="30" width="20" height="20" rx="6"/>
   <rect x="54" y="30" width="20" height="20" rx="6"/>
   <rect x="78" y="30" width="20" height="20" rx="6"/>
   <rect x="30" y="54" width="20" height="20" rx="6"/>
   <rect x="54" y="54" width="20" height="20" rx="6" fill="#2f7ce0"/>
   <rect x="78" y="54" width="20" height="20" rx="6"/>
   <rect x="30" y="78" width="20" height="20" rx="6"/>
   <rect x="54" y="78" width="20" height="20" rx="6"/>
   <rect x="78" y="78" width="20" height="20" rx="6"/>
  </g>
""",
)

define(
    "safari",
    [(0, "#4ec3f7"), (1, "#0a6ed6")],
    """
  <circle cx="64" cy="64" r="46" fill="#ffffff"/>
  <circle cx="64" cy="64" r="46" fill="none" stroke="#d7e3ee" stroke-width="1.6"/>
  <g stroke="#8b98a8" stroke-width="2.2" stroke-linecap="round">
   <path d="M64 20v8M64 100v8M20 64h8M100 64h8"/>
  </g>
  <g stroke="#c3ccd8" stroke-width="1.6" stroke-linecap="round">
   <path d="M42 26l3 7M83 95l3 7M26 86l7-3M95 45l7-3M26 42l7 3M95 83l7 3M42 102l3-7M83 33l3-7"/>
  </g>
  <path d="M92 36 58 58 36 92 70 70Z" fill="#ff3b30"/>
  <path d="M58 58 36 92 70 70Z" fill="#f4f6f9"/>
  <circle cx="64" cy="64" r="3" fill="#ffffff"/>
""",
    angle="diagonal",
)

define(
    "mail",
    [(0, "#5ac8fa"), (1, "#1573e6")],
    """
  <rect x="22" y="38" width="84" height="54" rx="9" fill="#ffffff"/>
  <path d="M26 44l38 27 38-27" fill="none" stroke="#1573e6" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M22 88l30-24M106 88L76 64" fill="none" stroke="#dfe9f4" stroke-width="4"/>
""",
)

define(
    "outlook",
    [(0, "#2f7ce6"), (1, "#0f4bad")],
    """
  <path d="M60 34h46a4 4 0 0 1 4 4v52a4 4 0 0 1-4 4H60z" fill="#ffffff"/>
  <path d="M60 40h50v12L86 66 60 52z" fill="#7fb2ef"/>
  <path d="M60 52l26 14 24-14v40H60z" fill="#e9f1fb"/>
  <rect x="18" y="26" width="52" height="76" rx="9" fill="#0c3f95"/>
  <ellipse cx="44" cy="64" rx="18" ry="21" fill="none" stroke="#ffffff" stroke-width="8"/>
""",
)

define(
    "messages",
    [(0, "#6ce87d"), (1, "#0fae3b")],
    """
  <path d="M64 30c-22 0-40 14-40 32 0 10 6 19 15 25-1 5-4 9-8 12 8 0 16-3 22-8 4 1 8 1 11 1 22 0 40-14 40-30S86 30 64 30z" fill="#ffffff"/>
""",
)

define(
    "facetime",
    [(0, "#5ce87b"), (1, "#0aa63d")],
    """
  <rect x="24" y="42" width="54" height="44" rx="11" fill="#ffffff"/>
  <path d="M82 58l22-13v38L82 70z" fill="#ffffff"/>
""",
)

define(
    "calendar",
    [(0, "#ffffff"), (1, "#e8eaee")],
    """
  <rect x="11" y="11" width="106" height="30" fill="#ff3b30"/>
  <text x="64" y="34" font-family="Inter, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">JUL</text>
  <text x="64" y="103" font-family="Inter, Helvetica, sans-serif" font-size="58" font-weight="300" fill="#2c2c30" text-anchor="middle">14</text>
""",
)

define(
    "contacts",
    [(0, "#fbfbfd"), (1, "#d8dce4")],
    """
  <rect x="26" y="18" width="76" height="92" rx="10" fill="#ffffff"/>
  <rect x="26" y="18" width="12" height="92" fill="#c9812f"/>
  <circle cx="70" cy="55" r="15" fill="#a6adb9"/>
  <path d="M46 96c3-15 12-22 24-22s21 7 24 22z" fill="#a6adb9"/>
""",
)

define(
    "reminders",
    [(0, "#ffffff"), (1, "#e7e9ee")],
    """
  <circle cx="38" cy="42" r="7" fill="#ff9500"/>
  <circle cx="38" cy="64" r="7" fill="#ff3b30"/>
  <circle cx="38" cy="86" r="7" fill="#0a84ff"/>
  <g fill="#b6bcc7">
   <rect x="54" y="38" width="42" height="7" rx="3.5"/>
   <rect x="54" y="60" width="42" height="7" rx="3.5"/>
   <rect x="54" y="82" width="30" height="7" rx="3.5"/>
  </g>
""",
)

define(
    "notes",
    [(0, "#ffffff"), (1, "#f2f3f6")],
    """
  <rect x="11" y="11" width="106" height="26" fill="#ffd60a"/>
  <path d="M11 34h106v3H11z" fill="#e8be09"/>
  <g stroke="#c9cdd6" stroke-width="4" stroke-linecap="round">
   <path d="M30 56h68M30 74h68M30 92h44"/>
  </g>
""",
)

define(
    "freeform",
    [(0, "#ffffff"), (1, "#eef0f4")],
    """
  <rect x="24" y="26" width="80" height="62" rx="8" fill="none" stroke="#9aa3b1" stroke-width="4"/>
  <path d="M38 74c8-22 20-30 28-18s16 12 24-6" fill="none" stroke="#0a84ff" stroke-width="5" stroke-linecap="round"/>
  <path d="M60 96l8 12 8-12z" fill="#9aa3b1"/>
""",
)

define(
    "music",
    [(0, "#fb5c74"), (1, "#e0245e")],
    """
  <path d="M84 30 52 38v42a12 12 0 1 0 8 11V52l24-6z" fill="#ffffff"/>
  <circle cx="48" cy="92" r="12" fill="#ffffff"/>
""",
)

define(
    "podcasts",
    [(0, "#c museum")],
    "",
)
APP_ICONS.pop("podcasts")

define(
    "podcasts",
    [(0, "#c46bf0"), (1, "#7b2fd0")],
    """
  <circle cx="64" cy="52" r="12" fill="#ffffff"/>
  <path d="M52 74c0 12 24 12 24 0 4 16-2 30-12 30s-16-14-12-30z" fill="#ffffff"/>
  <path d="M38 58a26 26 0 0 1 52 0" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
""",
)

define(
    "appstore",
    [(0, "#3ec8ff"), (1, "#0a63e8")],
    """
  <g stroke="#ffffff" stroke-width="8.5" stroke-linecap="round" fill="none">
   <path d="M46 88 64 44l18 44"/>
   <path d="M39 72h50"/>
  </g>
""",
)

define(
    "settings",
    [(0, "#b9bec6"), (1, "#5c626c")],
    f"""
  <path d="{gear_path(64, 64, 42, 32, teeth=9)}" fill="#f4f6f9"/>
  <circle cx="64" cy="64" r="14" fill="#6d747d"/>
  <circle cx="64" cy="64" r="14" fill="none" stroke="#4e545c" stroke-width="2"/>
""",
)

define(
    "terminal",
    [(0, "#3d434c"), (1, "#191c22")],
    """
  <rect x="14" y="24" width="100" height="80" rx="8" fill="#0e1116"/>
  <rect x="14" y="24" width="100" height="16" rx="8" fill="#3b4149"/>
  <g fill="none" stroke="#5ee387" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
   <path d="M32 58l10 9-10 9"/>
   <path d="M52 78h22"/>
  </g>
""",
)

define(
    "activity-monitor",
    [(0, "#2c3138"), (1, "#12151a"), ],
    """
  <rect x="16" y="26" width="96" height="76" rx="9" fill="#0c0f14"/>
  <path d="M24 76h14l7-22 9 40 8-30 7 14h35" fill="none" stroke="#43e37a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
""",
)

define(
    "disk-utility",
    [(0, "#cfd4dc"), (1, "#7b828d")],
    """
  <circle cx="64" cy="64" r="34" fill="#f4f6f9"/>
  <circle cx="64" cy="64" r="34" fill="none" stroke="#9aa2ad" stroke-width="3"/>
  <circle cx="64" cy="64" r="9" fill="#8a919c"/>
  <path d="M64 30v10M64 88v10M30 64h10M88 64h10" stroke="#b3bac4" stroke-width="4" stroke-linecap="round"/>
  <path d="M78 46 96 30" stroke="#ff3b30" stroke-width="6" stroke-linecap="round"/>
  <path d="M92 40h12v-12" fill="none" stroke="#ff3b30" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
""",
)

define(
    "console",
    [(0, "#f7f8fa"), (1, "#d3d8e0")],
    """
  <rect x="20" y="26" width="88" height="76" rx="9" fill="#ffffff"/>
  <rect x="20" y="26" width="88" height="16" rx="9" fill="#e6eaf0"/>
  <g stroke="#ffb340" stroke-width="5" stroke-linecap="round">
   <path d="M34 58h20"/>
  </g>
  <g stroke="#a8b0bd" stroke-width="5" stroke-linecap="round">
   <path d="M62 58h32M34 72h60M34 86h42"/>
  </g>
""",
)

define(
    "textedit",
    [(0, "#ffffff"), (1, "#e6e9ef")],
    """
  <rect x="26" y="16" width="76" height="96" rx="7" fill="#ffffff" stroke="#d3d8e0" stroke-width="2"/>
  <g stroke="#b8bfca" stroke-width="4" stroke-linecap="round">
   <path d="M40 40h48M40 56h48M40 72h30"/>
  </g>
  <path d="M74 96 98 72l10 10-24 24-12 2z" fill="#4c9ae8" stroke="#2b7ad0" stroke-width="2"/>
""",
)

define(
    "preview",
    [(0, "#ffffff"), (1, "#e4e8ef")],
    """
  <rect x="24" y="14" width="72" height="94" rx="7" fill="#ffffff" stroke="#d2d7e0" stroke-width="2"/>
  <g stroke="#c3c9d3" stroke-width="4" stroke-linecap="round">
   <path d="M38 36h44M38 50h44M38 64h26"/>
  </g>
  <circle cx="76" cy="80" r="18" fill="none" stroke="#3d86d8" stroke-width="6"/>
  <path d="M89 93l14 14" stroke="#3d86d8" stroke-width="8" stroke-linecap="round"/>
""",
)

define(
    "calculator",
    [(0, "#3c4148"), (1, "#1b1e24")],
    """
  <rect x="20" y="18" width="88" height="26" rx="6" fill="#c8ccd3"/>
  <g fill="#6c7178">
   <rect x="20" y="52" width="20" height="18" rx="5"/>
   <rect x="44" y="52" width="20" height="18" rx="5"/>
   <rect x="68" y="52" width="20" height="18" rx="5"/>
   <rect x="20" y="76" width="20" height="18" rx="5"/>
   <rect x="44" y="76" width="20" height="18" rx="5"/>
   <rect x="68" y="76" width="20" height="18" rx="5"/>
  </g>
  <rect x="92" y="52" width="16" height="42" rx="5" fill="#ff9f0a"/>
""",
)

define(
    "screenshot",
    [(0, "#dfe3ea"), (1, "#9aa1ac")],
    """
  <rect x="26" y="40" width="76" height="52" rx="10" fill="#3c4249"/>
  <circle cx="64" cy="66" r="16" fill="#8f97a2"/>
  <circle cx="64" cy="66" r="9" fill="#e4e8ee"/>
  <rect x="50" y="30" width="28" height="12" rx="4" fill="#5b626b"/>
""",
)

define(
    "time-machine",
    [(0, "#5fd2c0"), (1, "#12857f")],
    """
  <circle cx="64" cy="64" r="36" fill="none" stroke="#ffffff" stroke-width="7"/>
  <path d="M64 40v24l18 11" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
  <path d="M96 40v18H78" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
""",
)

define(
    "keychain",
    [(0, "#7c848f"), (1, "#3b4149")],
    """
  <circle cx="52" cy="52" r="17" fill="none" stroke="#ffd60a" stroke-width="9"/>
  <path d="M62 62 96 96" stroke="#ffd60a" stroke-width="9" stroke-linecap="round"/>
  <path d="M80 88l10-10M90 98l10-10" stroke="#ffd60a" stroke-width="7" stroke-linecap="round"/>
""",
)

define(
    "system-info",
    [(0, "#c3c8d0"), (1, "#6b7280")],
    """
  <rect x="22" y="28" width="84" height="56" rx="6" fill="#eef1f5"/>
  <rect x="28" y="34" width="72" height="44" rx="3" fill="#3f4550"/>
  <path d="M54 84h20l4 14H50z" fill="#c9cfd8"/>
  <rect x="44" y="98" width="40" height="6" rx="3" fill="#dfe3ea"/>
""",
)

define(
    "maps",
    [(0, "#8fe0a4"), (1, "#3aa96a")],
    """
  <path d="M18 34l30-8v76l-30 8z" fill="#d9efdd"/>
  <path d="M48 26l32 10v76l-32-10z" fill="#f4f8f0"/>
  <path d="M80 36l30-10v76l-30 10z" fill="#cfe9d6"/>
  <path d="M34 96c14-14 6-34 22-42s14-24 30-30" fill="none" stroke="#f2b53c" stroke-width="6" stroke-linecap="round"/>
  <circle cx="86" cy="60" r="9" fill="#ff3b30" stroke="#ffffff" stroke-width="3"/>
""",
)

define(
    "photos",
    [(0, "#ffffff"), (1, "#f0f2f5")],
    """
  <g opacity=".92">
   <ellipse cx="64" cy="40" rx="10" ry="20" fill="#ffd60a"/>
   <ellipse cx="81" cy="50" rx="10" ry="20" fill="#ff9500" transform="rotate(60 81 50)"/>
   <ellipse cx="81" cy="78" rx="10" ry="20" fill="#ff3b30" transform="rotate(120 81 78)"/>
   <ellipse cx="64" cy="88" rx="10" ry="20" fill="#af52de"/>
   <ellipse cx="47" cy="78" rx="10" ry="20" fill="#0a84ff" transform="rotate(60 47 78)"/>
   <ellipse cx="47" cy="50" rx="10" ry="20" fill="#34c759" transform="rotate(120 47 50)"/>
  </g>
""",
)

define(
    "weather",
    [(0, "#4cb8f5"), (1, "#1163cf")],
    """
  <circle cx="52" cy="50" r="16" fill="#ffd60a"/>
  <path d="M46 90c-9 0-16-6-16-14s7-14 16-14c2-9 10-15 20-15 12 0 21 9 21 20 9 0 15 5 15 12s-7 11-16 11z" fill="#ffffff"/>
""",
)

define(
    "trash",
    [(0, "#e7ebf1"), (1, "#a9b3c0")],
    """
  <rect x="36" y="38" width="56" height="8" rx="4" fill="#8d97a5"/>
  <rect x="54" y="28" width="20" height="8" rx="4" fill="#8d97a5"/>
  <path d="M42 50h44l-4 54a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6z" fill="#f4f6fa" stroke="#9aa4b2" stroke-width="3"/>
  <g stroke="#b6bfca" stroke-width="4" stroke-linecap="round">
   <path d="M56 62v40M64 62v40M72 62v40"/>
  </g>
""",
)

define(
    "trash-full",
    [(0, "#e7ebf1"), (1, "#a9b3c0")],
    """
  <g>
   <rect x="48" y="24" width="18" height="14" rx="3" fill="#8fb8e6" transform="rotate(-14 57 31)"/>
   <rect x="66" y="22" width="16" height="16" rx="3" fill="#f2c14e" transform="rotate(12 74 30)"/>
  </g>
  <rect x="36" y="38" width="56" height="8" rx="4" fill="#8d97a5"/>
  <path d="M42 50h44l-4 54a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6z" fill="#f4f6fa" stroke="#9aa4b2" stroke-width="3"/>
  <g stroke="#b6bfca" stroke-width="4" stroke-linecap="round">
   <path d="M56 62v40M64 62v40M72 62v40"/>
  </g>
""",
)

define(
    "migration",
    [(0, "#a8b0bd"), (1, "#5a626e")],
    """
  <rect x="14" y="40" width="44" height="34" rx="5" fill="#eef1f5"/>
  <rect x="70" y="40" width="44" height="34" rx="5" fill="#eef1f5"/>
  <path d="M52 88h24" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <path d="M58 57h14m-6-7 7 7-7 7" fill="none" stroke="#0a84ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
""",
)

define(
    "mission-control",
    [(0, "#8e97a5"), (1, "#454c57")],
    """
  <rect x="20" y="26" width="42" height="32" rx="6" fill="#ffffff" opacity=".92"/>
  <rect x="68" y="26" width="40" height="32" rx="6" fill="#ffffff" opacity=".72"/>
  <rect x="20" y="66" width="40" height="34" rx="6" fill="#ffffff" opacity=".72"/>
  <rect x="66" y="66" width="42" height="34" rx="6" fill="#ffffff" opacity=".92"/>
""",
)

for name, spec in APP_ICONS.items():
    app_icon(name, spec["stops"], spec["glyph"], spec["angle"], spec["extra_defs"])

# --------------------------------------------------------------------------
# Document, folder and volume glyphs (not squircles)
# --------------------------------------------------------------------------

raw_icon(
    "folder",
    """<defs><linearGradient id="fb" x1="64" y1="24" x2="64" y2="112" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#6dc7f7"/><stop offset="1" stop-color="#2b93e4"/></linearGradient>
 <linearGradient id="ff" x1="64" y1="40" x2="64" y2="112" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#8ad6ff"/><stop offset="1" stop-color="#3aa3ea"/></linearGradient></defs>
 <path d="M10 34a8 8 0 0 1 8-8h30l10 12h62a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" fill="url(#fb)"/>
 <path d="M10 48h108v48a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" fill="url(#ff)"/>
 <path d="M10 48h108v6H10z" fill="#ffffff" opacity=".3"/>""",
)

raw_icon(
    "folder-shared",
    """<defs><linearGradient id="fsb" x1="64" y1="24" x2="64" y2="112" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#6dc7f7"/><stop offset="1" stop-color="#2b93e4"/></linearGradient></defs>
 <path d="M10 34a8 8 0 0 1 8-8h30l10 12h62a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" fill="url(#fsb)"/>
 <circle cx="52" cy="72" r="11" fill="#ffffff" opacity=".92"/>
 <circle cx="80" cy="76" r="8" fill="#ffffff" opacity=".72"/>""",
)

raw_icon(
    "document",
    """<defs><linearGradient id="dg" x1="64" y1="8" x2="64" y2="120" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8ecf2"/></linearGradient></defs>
 <path d="M26 10h54l22 22v86a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="url(#dg)" stroke="#c9d0da" stroke-width="2"/>
 <path d="M80 10l22 22H84a4 4 0 0 1-4-4z" fill="#d6dce5"/>
 <g stroke="#b9c1cd" stroke-width="4" stroke-linecap="round"><path d="M40 54h48M40 70h48M40 86h30"/></g>""",
)

raw_icon(
    "document-pdf",
    """<defs><linearGradient id="pg" x1="64" y1="8" x2="64" y2="120" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eceff4"/></linearGradient></defs>
 <path d="M26 10h54l22 22v86a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="url(#pg)" stroke="#c9d0da" stroke-width="2"/>
 <path d="M80 10l22 22H84a4 4 0 0 1-4-4z" fill="#d6dce5"/>
 <rect x="26" y="72" width="76" height="26" fill="#e0453a"/>
 <text x="64" y="91" font-family="Inter, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">PDF</text>""",
)

raw_icon(
    "volume",
    """<defs><linearGradient id="vg" x1="64" y1="30" x2="64" y2="100" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#f7f9fc"/><stop offset="1" stop-color="#9aa4b1"/></linearGradient></defs>
 <rect x="12" y="34" width="104" height="60" rx="9" fill="url(#vg)" stroke="#8d97a5" stroke-width="2"/>
 <rect x="24" y="46" width="80" height="10" rx="5" fill="#6f7885"/>
 <circle cx="96" cy="76" r="7" fill="#5f6773"/>
 <rect x="24" y="70" width="52" height="6" rx="3" fill="#c6cdd7"/>""",
)

raw_icon(
    "volume-external",
    """<defs><linearGradient id="veg" x1="64" y1="30" x2="64" y2="100" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#fdfdfe"/><stop offset="1" stop-color="#b8c0cb"/></linearGradient></defs>
 <rect x="12" y="34" width="104" height="60" rx="9" fill="url(#veg)" stroke="#8d97a5" stroke-width="2"/>
 <rect x="24" y="48" width="80" height="8" rx="4" fill="#f2a33c"/>
 <circle cx="96" cy="76" r="7" fill="#5f6773"/>""",
)

raw_icon(
    "airdrop",
    """<circle cx="64" cy="64" r="56" fill="#2f7ce6"/>
 <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round">
  <path d="M44 84a28 28 0 0 1 0-40M84 44a28 28 0 0 1 0 40"/>
  <path d="M64 48v34M52 62l12-14 12 14"/>
 </g>""",
)

# --------------------------------------------------------------------------
# Wallpapers
# --------------------------------------------------------------------------

WALLPAPERS = {
    "tahoe-light": [
        ("#7ad0ea", "0"),
        ("#4b7fd6", ".38"),
        ("#8f6ad2", ".68"),
        ("#f0a3c0", "1"),
    ],
    "tahoe-dark": [
        ("#0b1226", "0"),
        ("#16264f", ".4"),
        ("#3a2a63", ".72"),
        ("#0d1122", "1"),
    ],
    "sequoia-sunrise": [
        ("#ffd28a", "0"),
        ("#f7876f", ".36"),
        ("#a1548f", ".7"),
        ("#2c2c6b", "1"),
    ],
    "alpine": [
        ("#e8f4f2", "0"),
        ("#8fbdc0", ".36"),
        ("#3d6b7d", ".72"),
        ("#16283c", "1"),
    ],
    "midnight": [
        ("#050914", "0"),
        ("#101a35", ".45"),
        ("#26205a", ".78"),
        ("#050810", "1"),
    ],
    "graphite": [
        ("#f2f3f5", "0"),
        ("#c8ccd3", ".4"),
        ("#8b9099", ".72"),
        ("#4c5158", "1"),
    ],
}

for name, stops in WALLPAPERS.items():
    marks = "".join(
        f'<stop offset="{offset}" stop-color="{color}"/>' for color, offset in stops
    )
    dark = name in ("tahoe-dark", "midnight")
    glow = ".26" if dark else ".42"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
 <defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1600" y2="1000" gradientUnits="userSpaceOnUse">{marks}</linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
   <stop offset="0" stop-color="#ffffff" stop-opacity="{glow}"/>
   <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="corner" cx="0.12" cy="0.9" r="0.6">
   <stop offset="0" stop-color="#000000" stop-opacity=".28"/>
   <stop offset="1" stop-color="#000000" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="90"/></filter>
 </defs>
 <rect width="1600" height="1000" fill="url(#bg)"/>
 <g filter="url(#soft)" opacity=".72">
  <ellipse cx="420" cy="300" rx="440" ry="300" fill="{stops[0][0]}"/>
  <ellipse cx="1240" cy="700" rx="480" ry="320" fill="{stops[2][0]}"/>
  <ellipse cx="900" cy="180" rx="360" ry="220" fill="{stops[1][0]}"/>
 </g>
 <rect width="1600" height="1000" fill="url(#glow)"/>
 <rect width="1600" height="1000" fill="url(#corner)"/>
</svg>
"""
    (WALLS / f"{name}.svg").write_text(svg)

# Apple brand mark, drawn from primitives so nothing is copied from a remote file.
(SITE / "assets" / "brand" / "apple-mark.svg").write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 100" role="img" aria-label="System menu">
 <path fill="currentColor" d="M57.8 53.2c-.1-10.4 8.5-15.4 8.9-15.6-4.8-7-12.3-8-15-8.2-6.8-.5-12.5 3.8-15.8 3.8-3.3 0-8.1-3.7-13.3-3.6C15.8 29.7 9 34.4 5.3 41.7c-7.5 13-1.9 32.3 5.4 42.9 3.6 5.2 7.9 10.9 13.6 10.7 5.4-.2 7.5-3.5 14.1-3.5 6.6 0 8.4 3.5 14.1 3.4 5.8-.1 9.5-5.3 13.1-10.5 4.1-6 5.8-11.8 5.9-12.1-.1-.1-11.6-4.5-11.7-19.4z"/>
 <path fill="currentColor" d="M48.6 22.1c2.9-3.5 4.9-8.4 4.4-13.3-4.3.2-9.5 2.9-12.5 6.4-2.7 3.1-5 8.1-4.4 12.9 4.8.4 9.6-2.4 12.5-6z"/>
</svg>
"""
)

count = len(list(ICONS.glob("*.svg")))
print(f"icons: {count}  wallpapers: {len(WALLPAPERS)}")
