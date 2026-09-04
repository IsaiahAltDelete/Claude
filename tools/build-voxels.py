#!/usr/bin/env python3
"""Headless voxel builder for ClaudeVenture.

The game draws a shop full of voxel appliances, customers and props. None of
that geometry is authored in the browser: every model below is built here out
of primitives — boxes, plates, voxelised cylinders and a small ASCII layer
stamp — and this script bakes each one into a flat, already-projected draw
list. Run

    python3 tools/build-voxels.py

from the repository root after editing any model. It writes two things:

    game/scripts/01-voxels.js     the baked draw lists the game replays
    game/assets/voxels/sheet.svg  a labelled contact sheet of every model

Nothing here needs a browser, a GPU or a dependency — stdlib Python only —
which is the whole point: the expensive part of voxel rendering happens once,
offline, and the runtime only replays flat polygons into a canvas.

--------------------------------------------------------------------------
How the bake works

The projection is the classic 2:1 dimetric one. A lattice corner (i, j, k)
lands at

    px = (i - j) * HW          py = (i + j) * HH - k * ZH

With HW=2, HH=1, ZH=2 every projected coordinate is an integer, so the baked
list carries no floats and the runtime is free to scale it to any size.

Three of a cube's six faces can ever face the camera under this projection:
+z (the top), +y (screen-left) and +x (screen-right). A face is emitted only
when the neighbouring cell in that direction is empty, which drops the entire
interior of a solid model — typically two thirds of its faces.

The view ray for this projection is (1, 1, 1): moving a point along it changes
neither px nor py. Depth along the ray is therefore x + y + z, and sorting the
cells by that value ascending is an exact back-to-front order. Faces are
emitted per cell rather than merged into larger rectangles on purpose — a
merged rectangle spans a *range* of depths, and once it does, no single sort
key can order it correctly against the cells it overlaps. Painter's algorithm
stays honest here because every quad is one cell deep.

Shading is *not* baked. Each face records the index of its base colour in the
model's palette and which of the three directions it faces; the runtime
multiplies by CV_VOXEL_SHADE at bake-to-canvas time. That is what lets one
customer model be rendered in forty shirt colours from one draw list, and it
is why models can declare named palette slots (`@shirt`, `@skin`, `@hair`).
"""

from __future__ import annotations

import math
import pathlib
from typing import Iterable

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
OUT_JS = GAME / "scripts" / "01-voxels.js"
OUT_SVG = GAME / "assets" / "voxels" / "sheet.svg"

# Screen units per voxel. Integers, so nothing in the baked list is a float.
HW, HH, ZH = 2, 1, 2

# Face directions, in the order the runtime indexes them.
TOP, LEFT, RIGHT = 0, 1, 2

# How much light each face gets. Exported to the runtime so this file stays the
# only place the numbers live. Light sits above and to the screen-left.
SHADE = (1.0, 0.80, 0.60)

# Base-64-ish digits for the packed draw list. Ordinary base64's "+" and "/"
# would need escaping inside a JavaScript string literal; these two do not.
DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-"


def d1(value: int) -> str:
    if not 0 <= value < 64:
        raise ValueError(f"{value} does not fit in one digit")
    return DIGITS[value]


def d2(value: int) -> str:
    if not 0 <= value < 4096:
        raise ValueError(f"{value} does not fit in two digits")
    return DIGITS[value >> 6] + DIGITS[value & 63]


# --------------------------------------------------------------------- colour

def shade(hex_colour: str, factor: float) -> str:
    """Multiply a #rrggbb colour by a factor, staying in gamma space.

    Gamma space is the wrong place to do this arithmetically and the right
    place to do it artistically: voxel art has always been shaded by
    multiplying the sRGB triple, and correcting it to linear light makes the
    side faces read as washed-out grey rather than as shadow.
    """
    raw = hex_colour.lstrip("#")
    parts = [int(raw[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{min(255, round(c * factor)):02x}" for c in parts)


# ---------------------------------------------------------------------- model

class Model:
    """A voxel grid, plus the primitives used to fill one.

    Cells hold either a literal "#rrggbb" or a slot name like "@shirt", which
    becomes a palette entry the runtime can override per instance.
    """

    def __init__(self, name: str, note: str = ""):
        self.name = name
        self.note = note
        self.cells: dict[tuple[int, int, int], str] = {}
        self.slots: dict[str, str] = {}      # slot name -> default colour
        self.anchor: tuple[float, float] | None = None

    # -- primitives --------------------------------------------------------

    def put(self, x: int, y: int, z: int, colour: str | None) -> None:
        if colour is None:
            self.cells.pop((x, y, z), None)
        else:
            self.cells[(x, y, z)] = colour

    def box(self, x: int, y: int, z: int, sx: int, sy: int, sz: int,
            colour: str | None) -> "Model":
        """A solid rectangular block with its low corner at (x, y, z)."""
        for i in range(x, x + sx):
            for j in range(y, y + sy):
                for k in range(z, z + sz):
                    self.put(i, j, k, colour)
        return self

    def shell(self, x: int, y: int, z: int, sx: int, sy: int, sz: int,
              colour: str) -> "Model":
        """The four vertical walls of a box — no lid, no floor."""
        for i in range(x, x + sx):
            for j in range(y, y + sy):
                if i not in (x, x + sx - 1) and j not in (y, y + sy - 1):
                    continue
                for k in range(z, z + sz):
                    self.put(i, j, k, colour)
        return self

    def cyl(self, cx: float, cy: float, z: int, radius: float, height: int,
            colour: str | None, hollow: float = 0.0) -> "Model":
        """A voxelised cylinder about (cx, cy), sampled at cell centres."""
        lo = math.floor(cx - radius), math.floor(cy - radius)
        hi = math.ceil(cx + radius), math.ceil(cy + radius)
        for i in range(lo[0], hi[0] + 1):
            for j in range(lo[1], hi[1] + 1):
                dist = math.hypot(i + 0.5 - cx, j + 0.5 - cy)
                if dist > radius or dist < hollow:
                    continue
                for k in range(z, z + height):
                    self.put(i, j, k, colour)
        return self

    def dome(self, cx: float, cy: float, z: int, radius: float,
             colour: str) -> "Model":
        """The upper half of a voxelised sphere, sitting on z."""
        steps = math.ceil(radius)
        for k in range(steps + 1):
            slab = radius * radius - (k + 0.5) * (k + 0.5)
            if slab <= 0:
                continue
            self.cyl(cx, cy, z + k, math.sqrt(slab), 1, colour)
        return self

    def stamp(self, x: int, y: int, z: int, layers: Iterable[Iterable[str]],
              key: dict[str, str]) -> "Model":
        """Stamp ASCII layers, bottom layer first, back row first.

        Each layer is a list of rows; within a row, one character is one cell
        along +x. "." and " " leave a cell empty. This exists for the shapes
        that are quicker to draw than to describe — faces, logos, small props.
        """
        for dk, layer in enumerate(layers):
            for dj, row in enumerate(layer):
                for di, char in enumerate(row):
                    if char in ". ":
                        continue
                    if char not in key:
                        raise KeyError(f"{self.name}: no palette entry for {char!r}")
                    self.put(x + di, y + dj, z + dk, key[char])
        return self

    def mirror_x(self) -> "Model":
        """Reflect the model across the middle of its own x extent."""
        if not self.cells:
            return self
        span = max(c[0] for c in self.cells) + min(c[0] for c in self.cells)
        self.cells = {(span - x, y, z): c for (x, y, z), c in self.cells.items()}
        return self

    def slot(self, name: str, default: str) -> str:
        """Declare a recolourable palette entry and return its cell token."""
        self.slots[name] = default
        return "@" + name

    # -- bake --------------------------------------------------------------

    def size(self) -> tuple[int, int, int]:
        if not self.cells:
            return (0, 0, 0)
        return tuple(max(c[i] for c in self.cells) + 1 for i in range(3))  # type: ignore

    def bake(self) -> dict:
        if not self.cells:
            raise ValueError(f"{self.name} is empty")

        # Face culling: keep only what a viewer at (+1, +1, +1) could see.
        faces = []
        for (x, y, z), colour in self.cells.items():
            if (x, y, z + 1) not in self.cells:
                faces.append((x + y + z, TOP, x, y, z, colour))
            if (x, y + 1, z) not in self.cells:
                faces.append((x + y + z, LEFT, x, y, z, colour))
            if (x + 1, y, z) not in self.cells:
                faces.append((x + y + z, RIGHT, x, y, z, colour))

        # Back to front along the (1, 1, 1) view ray. The tie-break keeps the
        # output byte-identical between runs on any machine.
        faces.sort(key=lambda f: (f[0], f[2], f[3], f[4], f[1]))

        points = [face_origin(kind, x, y, z) for _, kind, x, y, z, _ in faces]
        min_x = min(p[0] for p in points) - HW      # the left face reaches left
        max_x = max(p[0] for p in points) + HW
        min_y = min(p[1] for p in points)
        max_y = max(p[1] for p in points) + HH + ZH

        palette: list[str] = []
        index: dict[str, int] = {}
        record = []
        for (_, kind, x, y, z, colour), (px, py) in zip(faces, points):
            if colour not in index:
                index[colour] = len(palette)
                palette.append(colour)
            record.append(d1(index[colour]) + d1(kind)
                          + d2(px - min_x) + d2(py - min_y))

        span = self.size()
        ax, ay = self.anchor if self.anchor else (span[0] / 2, span[1] / 2)
        return {
            "name": self.name,
            "note": self.note,
            "w": max_x - min_x,
            "h": max_y - min_y,
            # The ground point the sprite hangs from: where (ax, ay, 0) lands.
            "ax": round((ax - ay) * HW) - min_x,
            "ay": round((ax + ay) * HH) - min_y,
            "size": span,
            "palette": [self.slots.get(c[1:], c) if c.startswith("@") else c
                        for c in palette],
            "slots": {name: index["@" + name] for name in self.slots
                      if "@" + name in index},
            "ops": "".join(record),
            "faces": len(faces),
            "cells": len(self.cells),
        }


def face_origin(kind: int, x: int, y: int, z: int) -> tuple[int, int]:
    """Where a face's first corner projects. Everything else is relative."""
    if kind == TOP:                                    # corner (x, y, z+1)
        return ((x - y) * HW, (x + y) * HH - (z + 1) * ZH)
    if kind == LEFT:                                   # corner (x, y+1, z+1)
        return ((x - y - 1) * HW, (x + y + 1) * HH - (z + 1) * ZH)
    return ((x + 1 - y) * HW, (x + 1 + y) * HH - (z + 1) * ZH)  # (x+1, y, z+1)


# The three quads, as relative moves from the origin above. The runtime carries
# the same table; the contact sheet below uses this one.
QUADS = {
    TOP:   ((HW, HH), (-HW, HH), (-HW, -HH)),
    LEFT:  ((HW, HH), (0, ZH), (-HW, -HH)),
    RIGHT: ((-HW, HH), (0, ZH), (HW, -HH)),
}


# =========================================================================
#  The models
#
#  Everything the game draws lives here. They are built from primitives
#  rather than hand-placed cell by cell so that a change of proportion is a
#  number rather than a redraw, and so the file stays readable.
# =========================================================================

C = {
    "steel":    "#b4bec8",
    "steel_d":  "#8b95a0",
    "steel_l":  "#d9e0e7",
    "iron":     "#3b4149",
    "iron_d":   "#282d33",
    "rubber":   "#1f2226",
    "wood":     "#b07a45",
    "wood_d":   "#84582f",
    "cream":    "#f4efe4",
    "paper":    "#e6dcc8",
    "glass":    "#a8dcea",
    "gold":     "#f3c02f",
    "gold_d":   "#c8901a",
    "amber":    "#ffb000",
    "ember":    "#ff6a2b",
    "red":      "#d94a3c",
    "red_d":    "#a8342a",
    "green":    "#4f9c5f",
    "green_d":  "#38714a",
    "leaf":     "#63b06a",
    "blue":     "#3d7fb5",
    "blue_d":   "#2c5c86",
    "navy":     "#2e3f5c",
    "teal":     "#3fa39a",
    "pink":     "#e59ab8",
    "pink_d":   "#c4718f",
    "purple":   "#7a5aa6",
    "brown":    "#7a5334",
    "tan":      "#d9a25e",
    "bun":      "#e0a860",
    "meat":     "#8a4a2c",
    "lettuce":  "#6fbf5e",
    "cheese":   "#f0b429",
    "tomato":   "#d1443c",
    "soda":     "#5b3a22",
    "coffee":   "#4a2f1e",
    "milk":     "#f7f2e6",
    "choc":     "#6b4326",
    "berry":    "#c74b7a",
    "noodle":   "#e9d08a",
    "broth":    "#c98a3c",
    "nori":     "#2f4033",
    "rice":     "#f2ecdc",
}

MODELS: list[Model] = []


def model(name: str, note: str = "") -> Model:
    m = Model(name, note)
    MODELS.append(m)
    return m


# ------------------------------------------------------------- the stations

STATION_W, STATION_D = 7, 6


def cabinet(m: Model, body: str, accent: str, top: str = C["steel"]) -> Model:
    """The counter every appliance is built on: kick, body, stripe, worktop.

    Panel lines are cut into the two faces the camera can see and nowhere
    else — a detail on a hidden face is bytes nobody will ever look at.
    """
    w, d = STATION_W, STATION_D
    m.box(0, 0, 0, w, d, 2, C["iron_d"])                 # toe kick
    m.box(0, 0, 2, w, d, 6, body)                        # body
    m.box(0, 0, 7, w, d, 1, accent)                      # stripe
    m.box(0, 0, 8, w, d, 1, top)                         # worktop
    door = shade(body, 0.82)
    for x0 in (1, 4):                                    # doors, right face
        m.box(x0, d - 1, 3, 2, 1, 4, door)
    m.box(1, d - 1, 5, w - 2, 1, 1, shade(body, 1.12))   # a handle rail
    m.box(w - 1, 1, 3, 1, d - 2, 4, door)                # door, left face
    return m


def station(name: str, note: str, body: str, accent: str) -> Model:
    m = model(name, note)
    m.anchor = (STATION_W / 2, STATION_D / 2)
    return cabinet(m, body, accent)


# 1 — fryer: two oil wells, baskets over them, a heat lamp on a post.
m = station("st-fry", "Fry station", C["red"], C["gold"])
m.box(0, 0, 9, STATION_W, 1, 5, C["steel_d"])            # splashback
for x0 in (1, 4):
    m.box(x0, 1, 9, 2, 4, 1, C["iron_d"])                # well floor
    m.shell(x0 - 1, 1, 9, 4, 4, 3, C["iron"])            # well walls
    m.box(x0, 2, 10, 2, 2, 1, C["gold_d"])               # oil
    m.box(x0, 2, 11, 2, 2, 1, C["gold"])
    m.box(x0, 4, 12, 2, 1, 1, C["steel_l"])              # basket handle
m.box(0, 0, 14, 1, 1, 4, C["steel_d"])                   # lamp post
m.box(0, 0, 18, STATION_W, 2, 1, C["red_d"])             # lamp housing
m.box(1, 0, 17, STATION_W - 2, 2, 1, C["amber"])         # the lamp itself

# 2 — grill: a flat top with bars, an extraction hood over it.
m = station("st-grill", "Char grill", C["green"], C["cream"])
m.box(0, 0, 9, STATION_W, STATION_D, 1, C["iron"])
for x0 in range(0, STATION_W, 2):
    m.box(x0, 0, 10, 1, STATION_D, 1, C["iron_d"])       # the bars
m.box(2, 1, 10, 2, 2, 1, C["meat"])                      # something cooking
m.box(4, 3, 10, 2, 2, 1, C["meat"])
m.box(0, 0, 11, 1, 1, 4, C["steel_d"])                   # hood posts
m.box(STATION_W - 1, 0, 11, 1, 1, 4, C["steel_d"])
m.box(0, 0, 15, STATION_W, STATION_D - 2, 2, C["steel"])
m.box(0, 0, 14, STATION_W, 1, 1, C["steel_d"])

# 3 — soda fountain: a tower of taps over a cup rail.
m = station("st-soda", "Soda fountain", C["blue"], C["steel_l"])
m.box(0, 0, 9, STATION_W, 2, 8, C["steel"])              # the tower
m.box(0, 0, 16, STATION_W, 2, 1, C["blue_d"])            # its cap
for x0, flavour in ((0, C["soda"]), (2, C["red"]), (4, C["gold"]), (6, C["purple"])):
    m.box(x0, 2, 13, 1, 1, 2, C["steel_d"])              # tap
    m.box(x0, 2, 15, 1, 1, 1, flavour)                   # flavour badge
m.box(1, 3, 9, 2, 2, 3, C["cream"])                      # a stack of cups
m.box(1, 3, 12, 2, 2, 1, C["red"])
m.box(4, 4, 9, 2, 2, 1, C["steel_d"])                    # drip tray

# 4 — espresso bar: group heads, a steam wand, cups warming on top.
m = station("st-coffee", "Espresso bar", C["brown"], C["gold"])
m.box(1, 0, 9, 5, 4, 5, C["steel"])                      # the machine
m.box(1, 0, 14, 5, 4, 1, C["steel_d"])
m.box(2, 0, 15, 1, 1, 1, C["cream"])                     # cups warming
m.box(4, 0, 15, 1, 1, 1, C["cream"])
for x0 in (2, 4):
    m.box(x0, 4, 11, 1, 1, 2, C["iron"])                 # group head
    m.box(x0, 4, 10, 1, 1, 1, C["coffee"])               # the pour
m.box(0, 3, 9, 1, 1, 5, C["steel_d"])                    # steam wand
m.box(0, 4, 12, 1, 1, 1, C["steel_l"])
m.box(6, 2, 9, 1, 3, 2, C["brown"])                      # grinder
m.box(6, 3, 11, 1, 1, 3, C["iron"])

# 5 — soft serve: twin dispensers and a swirl on the counter.
m = station("st-cream", "Soft serve", C["pink"], C["cream"])
m.box(0, 0, 9, STATION_W, 3, 7, C["steel_l"])
m.box(0, 0, 16, STATION_W, 3, 1, C["pink_d"])
for x0 in (1, 4):
    m.box(x0, 3, 12, 2, 1, 2, C["steel_d"])              # dispenser head
    m.box(x0, 3, 11, 2, 1, 1, C["milk"])
m.box(2, 3, 14, 3, 1, 1, C["berry"])                     # flavour badge
m.cyl(3.5, 4.5, 9, 1.6, 1, C["paper"])                   # a cone under one
m.cyl(3.5, 4.5, 10, 1.2, 1, C["milk"])
m.cyl(3.5, 4.5, 11, 0.8, 1, C["milk"])

# 6 — pizza oven: a brick dome with a mouth and a chimney.
m = station("st-pizza", "Stone oven", C["red_d"], C["tan"])
m.dome(3.5, 3.0, 9, 4.2, C["tan"])
m.box(2, 4, 9, 3, 2, 3, None)                            # cut the mouth
m.box(2, 5, 9, 3, 1, 1, C["iron_d"])                     # the hearth
m.box(2, 5, 10, 3, 1, 2, C["ember"])                     # firelight inside
m.box(1, 4, 9, 1, 2, 4, C["red_d"])                      # mouth surround
m.box(5, 4, 9, 1, 2, 4, C["red_d"])
m.box(1, 4, 12, 5, 1, 1, C["red_d"])
m.box(1, 0, 13, 2, 2, 4, C["red_d"])                     # chimney
m.box(1, 0, 17, 2, 2, 1, C["iron"])

# 7 — taco griddle: a plancha under a striped awning.
m = station("st-taco", "Taco griddle", C["amber"], C["red"])
m.box(0, 1, 9, STATION_W, 4, 1, C["iron"])
m.box(1, 2, 10, 2, 2, 1, C["tan"])                       # tortillas warming
m.box(4, 2, 10, 2, 1, 1, C["meat"])
m.box(0, 0, 9, STATION_W, 1, 2, C["steel_d"])
for x0 in (0, STATION_W - 1):
    m.box(x0, 0, 11, 1, 1, 6, C["wood_d"])               # awning posts
for x0 in range(STATION_W):
    m.box(x0, 0, 17, 1, STATION_D, 1, C["red"] if x0 % 2 else C["cream"])
m.box(0, STATION_D - 1, 16, STATION_W, 1, 1, C["red_d"])  # awning valance

# 8 — noodle bar: two broth pots, bowls stacked beside them.
m = station("st-noodle", "Noodle bar", C["navy"], C["ember"])
m.box(0, 0, 9, STATION_W, 1, 6, C["navy"])               # back panel
m.box(0, 0, 15, STATION_W, 1, 1, C["ember"])
for cx in (1.8, 4.8):
    m.cyl(cx, 3.0, 9, 1.8, 3, C["iron"])
    m.cyl(cx, 3.0, 12, 1.6, 1, C["broth"])
    m.cyl(cx, 3.0, 13, 0.6, 2, C["steel_l"])             # a curl of steam
m.box(6, 3, 9, 1, 2, 1, C["cream"])                      # bowls
m.box(6, 3, 10, 1, 2, 1, C["blue"])


# -------------------------------------------------------------- the products
#
#  One per station, drawn small. They sit on the stock rail beside a station,
#  ride in the runner's hands, and stand in for the station in the rail list.

def product(name: str, note: str) -> Model:
    m = model(name, note)
    m.anchor = (2.5, 2.5)
    return m


m = product("pr-fry", "Fries")
m.box(1, 1, 0, 3, 3, 3, C["red"])
m.box(1, 1, 3, 3, 3, 1, C["red_d"])
for x0, y0, h in ((1, 1, 2), (3, 1, 3), (2, 3, 2), (1, 3, 3)):
    m.box(x0, y0, 4, 1, 1, h, C["gold"])

m = product("pr-burger", "Burger")
m.cyl(2.5, 2.5, 0, 2.1, 1, C["bun"])
m.cyl(2.5, 2.5, 1, 2.3, 1, C["meat"])
m.cyl(2.5, 2.5, 2, 2.4, 1, C["lettuce"])
m.cyl(2.5, 2.5, 3, 2.2, 1, C["cheese"])
m.dome(2.5, 2.5, 4, 2.4, C["bun"])

m = product("pr-soda", "Soda")
m.cyl(2.5, 2.5, 0, 1.6, 1, C["cream"])
m.cyl(2.5, 2.5, 1, 2.0, 4, C["cream"])
m.cyl(2.5, 2.5, 2, 2.1, 1, C["red"])
m.cyl(2.5, 2.5, 5, 2.1, 1, C["steel_l"])
m.box(3, 2, 6, 1, 1, 3, C["red"])

m = product("pr-coffee", "Coffee")
m.cyl(2.5, 2.5, 0, 1.7, 4, C["cream"])
m.cyl(2.5, 2.5, 2, 1.9, 1, C["brown"])
m.cyl(2.5, 2.5, 4, 1.8, 1, C["milk"])
m.box(1, 1, 5, 1, 1, 1, C["steel_l"])

m = product("pr-cream", "Cone")
m.cyl(2.5, 2.5, 0, 0.8, 1, C["paper"])
m.cyl(2.5, 2.5, 1, 1.4, 1, C["paper"])
m.cyl(2.5, 2.5, 2, 1.9, 1, C["tan"])
m.cyl(2.5, 2.5, 3, 1.9, 1, C["milk"])
m.cyl(2.5, 2.5, 4, 1.4, 1, C["milk"])
m.cyl(2.5, 2.5, 5, 0.9, 1, C["berry"])

m = product("pr-pizza", "Pizza slice")
m.stamp(0, 0, 0, [[
    ".....",
    "..X..",
    ".XXX.",
    "XXXXX",
    ".....",
]], {"X": C["tan"]})
m.stamp(0, 0, 1, [[
    ".....",
    "..X..",
    ".XoX.",
    "XoXoX",
    ".....",
]], {"X": C["cheese"], "o": C["tomato"]})

m = product("pr-taco", "Taco")
m.stamp(0, 0, 0, [[
    ".....",
    ".XXX.",
    ".XXX.",
    ".XXX.",
    ".....",
]], {"X": C["tan"]})
m.stamp(0, 0, 1, [[
    ".....",
    ".X.X.",
    ".XmX.",
    ".XgX.",
    ".....",
], [
    ".....",
    ".X.X.",
    ".X.X.",
    ".X.X.",
    ".....",
]], {"X": C["tan"], "m": C["meat"], "g": C["lettuce"]})

m = product("pr-noodle", "Ramen")
m.cyl(2.5, 2.5, 0, 1.4, 1, C["cream"])
m.cyl(2.5, 2.5, 1, 2.2, 2, C["cream"], hollow=1.2)
m.cyl(2.5, 2.5, 1, 1.6, 1, C["broth"])
m.cyl(2.5, 2.5, 2, 1.5, 1, C["noodle"])
m.box(2, 1, 3, 1, 1, 1, C["nori"])
m.box(3, 3, 3, 1, 1, 1, C["red"])


# ---------------------------------------------------------------- the people
#
#  One body, three builds. Shirt, trousers, skin and hair are palette slots,
#  so the runtime dresses forty customers out of three draw lists.

PERSON_W, PERSON_D = 7, 3


def person(name: str, note: str, height: int, width: int) -> Model:
    """A little figure. `height` is the leg length, `width` the shoulders."""
    m = model(name, note)
    m.anchor = (PERSON_W / 2, PERSON_D / 2)
    skin = m.slot("skin", "#e0ac7e")
    shirt = m.slot("shirt", "#4f9c5f")
    trous = m.slot("trousers", "#3f4a5c")
    hair = m.slot("hair", "#3a2a22")
    left = (PERSON_W - width) // 2
    torso = 5
    m.box(left + 1, 1, 0, 1, 2, 1, C["iron_d"])                  # shoes
    m.box(PERSON_W - left - 2, 1, 0, 1, 2, 1, C["iron_d"])
    m.box(left + 1, 1, 1, 1, 2, height, trous)                   # legs
    m.box(PERSON_W - left - 2, 1, 1, 1, 2, height, trous)
    m.box(left, 0, height + 1, width, PERSON_D, torso, shirt)    # torso
    m.box(left - 1, 0, height + 1, 1, 2, torso - 1, shirt)       # arms
    m.box(PERSON_W - left, 0, height + 1, 1, 2, torso - 1, shirt)
    m.box(left - 1, 0, height + 1, 1, 2, 1, skin)                # hands
    m.box(PERSON_W - left, 0, height + 1, 1, 2, 1, skin)
    head = height + torso + 1
    m.box(1, 0, head, 5, PERSON_D, 4, skin)                      # head
    m.box(1, 0, head + 3, 5, PERSON_D, 1, hair)                  # hair
    m.box(1, 0, head + 2, 5, 1, 1, hair)
    m.box(2, PERSON_D - 1, head + 2, 1, 1, 1, C["iron_d"])       # eyes, on the
    m.box(4, PERSON_D - 1, head + 2, 1, 1, 1, C["iron_d"])       # face we see
    return m


person("pp-a", "Customer, average build", height=4, width=5)
person("pp-b", "Customer, tall", height=6, width=5)
person("pp-c", "Customer, small", height=3, width=4)

m = person("pp-chef", "The chef", height=4, width=5)
m.box(2, 0, 15, 3, PERSON_D, 1, C["cream"])                      # toque band
m.box(1, 0, 16, 5, PERSON_D, 3, C["cream"])                      # toque
m.box(1, PERSON_D - 1, 6, 5, 1, 4, C["cream"])                   # apron


# ----------------------------------------------------------------- the props

m = model("pf-coin", "A coin of takings")
m.anchor = (2.5, 2.5)
m.cyl(2.5, 2.5, 0, 2.3, 2, C["gold_d"])
m.cyl(2.5, 2.5, 2, 2.3, 1, C["gold"])
m.box(2, 2, 3, 1, 1, 1, C["gold_d"])

m = model("pf-crate", "An upgrade crate")
m.anchor = (3.0, 3.0)
m.box(0, 0, 0, 6, 6, 5, C["wood"])
m.box(0, 0, 5, 6, 6, 1, C["wood_d"])
m.box(0, 0, 2, 6, 6, 1, C["wood_d"])                             # band
m.box(2, 0, 0, 2, 6, 6, C["amber"])                              # ribbon
m.box(0, 2, 0, 6, 2, 6, C["amber"])
m.box(2, 2, 6, 2, 2, 1, C["ember"])                              # bow

m = model("pf-plant", "A pot plant")
m.anchor = (3.0, 3.0)
m.cyl(3.0, 3.0, 0, 2.2, 3, C["tan"])
m.cyl(3.0, 3.0, 3, 2.4, 1, C["wood_d"])
m.box(3, 3, 4, 1, 1, 3, C["green_d"])
m.dome(3.0, 3.0, 6, 3.0, C["leaf"])
m.box(1, 3, 7, 1, 1, 1, C["green"])
m.box(5, 2, 7, 1, 1, 1, C["green"])

m = model("pf-table", "A table for two")
m.anchor = (4.0, 4.0)
m.box(3, 3, 0, 2, 2, 5, C["steel_d"])
m.box(0, 0, 5, 8, 8, 1, C["wood"])
m.box(0, 0, 6, 8, 8, 1, C["wood_d"])
m.box(1, 1, 7, 6, 6, 1, C["wood"])

m = model("pf-stool", "A stool")
m.anchor = (2.0, 2.0)
m.box(1, 1, 0, 2, 2, 4, C["steel_d"])
m.cyl(2.0, 2.0, 4, 2.0, 1, C["red"])
m.cyl(2.0, 2.0, 5, 1.8, 1, C["red_d"])

m = model("pf-counter", "A run of service counter")
m.anchor = (4.0, 1.5)
m.box(0, 0, 0, 8, 3, 7, C["wood_d"])
m.box(0, 0, 5, 8, 3, 1, C["amber"])
m.box(0, 0, 7, 8, 3, 1, C["wood"])
m.box(0, 0, 8, 8, 1, 1, C["wood"])

m = model("pf-bin", "A waste bin")
m.anchor = (2.0, 2.0)
m.cyl(2.0, 2.0, 0, 2.0, 5, C["steel_d"])
m.cyl(2.0, 2.0, 5, 2.2, 1, C["iron"])
m.box(1, 1, 6, 2, 2, 1, C["iron_d"])

m = model("pf-sign", "The shop sign")
m.anchor = (4.0, 0.5)
m.box(0, 0, 0, 8, 1, 1, C["iron"])
m.box(0, 0, 1, 8, 1, 4, C["iron_d"])
m.box(1, 0, 2, 6, 1, 2, C["amber"])
m.box(0, 0, 5, 8, 1, 1, C["iron"])
