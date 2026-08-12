/* ---------------------------------------------------------------------------
   GLSL.

   All placement and motion happens in the vertex shader from a per-instance
   seed, so the CPU never touches a position: changing formation, count or
   speed costs one uniform, not a buffer upload. That is what keeps thousands
   of copies cheap and the memory footprint flat.
   --------------------------------------------------------------------------- */

(() => {
const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* ------------------------------------------------------------ type field */

const SCENE_VS = `#version 300 es
precision highp float;

in vec2 aCorner;
in float aIndex;
in vec4 aRand;
in float aCell;

uniform mat4 uProj;
uniform mat4 uView;
uniform vec2 uAtlasSize;
uniform vec4 uCells[64];

uniform float uTime, uCount;
uniform int uFormation, uFacing, uColorMode;
uniform float uRadius, uDepth, uTurns, uScatter, uStagger;
uniform float uSize, uSizeVar, uSizeDepth, uRoll, uRollVar;
uniform float uSpeed, uSpin, uSwirl, uTumble;
uniform float uWobble, uWobbleFreq, uTurb, uTurbScale, uPulse, uPulseRate;
uniform vec2 uDrift;
uniform float uDriftAmt;
uniform vec3 uTintA, uTintB;
uniform float uFog;
uniform vec2 uFade;

out vec2 vUv;
out vec3 vTint;
out float vAlpha;
out float vFog;

const float TAU = 6.28318530718;

vec2 rot2(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

vec3 wave3(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.7 + t) + sin(p.z * 1.3 - t * 0.7),
    sin(p.z * 1.9 - t) + sin(p.x * 1.1 + t * 0.8),
    sin(p.x * 1.5 + t * 0.9) + sin(p.y * 1.2 - t)
  ) * 0.5;
}

void main() {
  float n = max(uCount, 1.0);
  float t01 = aIndex / max(n - 1.0, 1.0);
  float flow = uTime * uSpeed * 0.15;
  float f = fract(t01 + flow + aRand.w * uStagger);
  float zf = (f - 0.5) * uDepth;
  float R = uRadius;

  vec3 p = vec3(0.0);
  float fade01 = 1.0;
  float travel = 0.0;

  if (uFormation == 0) {                    // line
    p = vec3(0.0, 0.0, zf);
    travel = 1.0;
  } else if (uFormation == 1) {             // tunnel
    float a = aRand.x * TAU + f * uTurns * TAU * 0.25;
    p = vec3(cos(a) * R, sin(a) * R, zf);
    travel = 1.0;
  } else if (uFormation == 2) {             // helix
    float a = f * TAU * uTurns;
    p = vec3(cos(a) * R, sin(a) * R, zf);
    travel = 1.0;
  } else if (uFormation == 3 || uFormation == 4) {  // grid / wave wall
    float L = clamp(floor(uTurns + 1.0), 1.0, 24.0);
    float per = ceil(n / L);
    float layer = floor(aIndex / per);
    float idx = mod(aIndex, per);
    float cols = ceil(sqrt(per));
    float rows = ceil(per / cols);
    vec2 g = vec2(mod(idx, cols) / max(cols - 1.0, 1.0), floor(idx / cols) / max(rows - 1.0, 1.0));
    g = (g - 0.5) * 2.0 * R;
    float lz = (fract(layer / L + flow) - 0.5) * uDepth;
    p = vec3(g, lz);
    if (uFormation == 4) {
      p.z += sin(g.x * 2.0 + uTime * 0.8) * R * 0.35 + cos(g.y * 2.4 - uTime * 0.6) * R * 0.25;
    }
    fade01 = smoothstep(0.0, 0.1, fract(layer / L + flow)) * smoothstep(0.0, 0.1, 1.0 - fract(layer / L + flow));
  } else if (uFormation == 5) {             // sphere
    float y = 1.0 - 2.0 * t01;
    float rr = sqrt(max(0.0, 1.0 - y * y));
    float a = aIndex * 2.39996323 + uTurns * t01;
    p = vec3(cos(a) * rr, y, sin(a) * rr) * R;
  } else if (uFormation == 6) {             // torus
    float a = t01 * TAU * max(uTurns, 1.0);
    float b = aRand.x * TAU;
    float rr = R * 0.38;
    p = vec3((R + rr * cos(b)) * cos(a), (R + rr * cos(b)) * sin(a), rr * sin(b));
  } else if (uFormation == 7) {             // vortex
    float a = f * TAU * uTurns + aRand.x * TAU;
    float rr = R * f;
    p = vec3(cos(a) * rr, sin(a) * rr, zf);
    travel = 1.0;
  } else if (uFormation == 8) {             // galaxy
    float rr = R * sqrt(t01);
    float a = t01 * TAU * uTurns + aRand.x * 0.5 + uTime * 0.1 / max(0.25, t01);
    p = vec3(cos(a) * rr, sin(a) * rr, (aRand.y - 0.5) * uDepth * 0.12);
  } else if (uFormation == 9) {             // cloud
    p = (aRand.xyz - 0.5) * vec3(2.0 * R, 2.0 * R, uDepth);
    p.z = mod(p.z + uDepth * 0.5 + flow * uDepth, uDepth) - uDepth * 0.5;
    travel = 1.0;
    f = (p.z / uDepth) + 0.5;
  } else if (uFormation == 10) {            // rings
    float L = clamp(floor(uTurns + 1.0), 1.0, 16.0);
    float ring = floor(aRand.w * L);
    float a = aRand.x * TAU + ring * 0.6;
    float rr = R * (0.25 + 0.75 * (ring + 1.0) / L);
    p = vec3(cos(a) * rr, sin(a) * rr, ((ring / max(L - 1.0, 1.0)) - 0.5) * uDepth);
  } else if (uFormation == 11) {            // corridor
    float side = floor(aRand.x * 4.0);
    float u = (aRand.y - 0.5) * 2.0;
    vec2 xy = side < 1.0 ? vec2(-R, u * R * 0.62)
            : side < 2.0 ? vec2(R, u * R * 0.62)
            : side < 3.0 ? vec2(u * R, -R * 0.62)
                         : vec2(u * R, R * 0.62);
    p = vec3(xy, zf);
    travel = 1.0;
  } else if (uFormation == 12) {            // column
    float a = t01 * TAU * uTurns + aRand.x * 0.2;
    p = vec3(cos(a) * R, (f - 0.5) * uDepth, sin(a) * R);
    fade01 = smoothstep(0.0, 0.08, f) * smoothstep(0.0, 0.08, 1.0 - f);
  } else if (uFormation == 13) {            // ribbon
    float a = t01 * TAU * max(uTurns, 0.5);
    p = vec3(sin(a) * R, sin(a * 2.0 + 1.0) * R * 0.55, zf);
    travel = 1.0;
  } else if (uFormation == 14) {            // arc — a curved wall around you
    float a = (t01 - 0.5) * (0.6 + uTurns * 0.55);
    float band = (aRand.y - 0.5) * uDepth * 0.35;
    p = vec3(sin(a) * R * 1.7, band, cos(a) * R * 1.7 - R * 1.7);
  } else {                                  // shell
    vec3 dir = normalize(aRand.xyz - 0.5 + 0.0001);
    p = dir * R * (0.65 + 0.35 * aRand.w);
  }

  if (travel > 0.5) fade01 = smoothstep(0.0, 0.07, f) * smoothstep(0.0, 0.07, 1.0 - f);

  // ---- disturbance -------------------------------------------------------
  p += (vec3(aRand.x, aRand.y, aRand.z) - 0.5) * uScatter * vec3(R, R, uDepth) * 0.7;

  if (uWobble > 0.0) {
    float ph = aRand.x * TAU;
    p += vec3(sin(uTime * uWobbleFreq + ph), cos(uTime * uWobbleFreq * 0.9 + ph * 1.7),
              sin(uTime * uWobbleFreq * 1.3 + ph * 0.6)) * uWobble * 0.35;
  }
  if (uTurb > 0.0) p += wave3(p * uTurbScale, uTime * 0.6) * uTurb * 0.5;
  if (uDriftAmt > 0.0) p.xy += uDrift * uDriftAmt * uTime * 0.4;

  // ---- field transforms --------------------------------------------------
  if (uSwirl != 0.0) p.xy = rot2(p.xy, (p.z / max(uDepth, 0.001)) * uSwirl * TAU * 0.5);
  if (uSpin != 0.0) p.xy = rot2(p.xy, uTime * uSpin * 0.5);

  // ---- depth, measured from the centre of the copy ------------------------
  vec4 centreView = uView * vec4(p, 1.0);
  float dist = max(-centreView.z, 0.0001);
  float dn = clamp((dist - uFade.x) / max(uFade.y - uFade.x, 0.0001), 0.0, 1.0);

  // ---- size --------------------------------------------------------------
  vec4 cell = uCells[int(aCell)];
  float aspect = (cell.z * uAtlasSize.x) / max(cell.w * uAtlasSize.y, 0.0001);

  float size = uSize * (1.0 + (aRand.x - 0.5) * 2.0 * uSizeVar);
  if (uPulse > 0.0) size *= 1.0 + sin(uTime * uPulseRate + aRand.y * TAU) * uPulse * 0.5;
  if (uSizeDepth != 0.0) size *= max(0.02, 1.0 + uSizeDepth * (dn - 0.5) * 2.0);
  size = max(size, 0.0001);

  // ---- orientation -------------------------------------------------------
  float roll = radians(uRoll + (aRand.z - 0.5) * 2.0 * uRollVar) + uTumble * uTime * (0.4 + aRand.w);
  vec2 corner = aCorner * vec2(size * aspect, size);

  vec4 viewPos;
  if (uFacing == 0) {                       // camera-facing
    viewPos = centreView;
    viewPos.xy += rot2(corner, roll);
  } else {
    vec3 right, up;
    if (uFacing == 1) {                     // flat to the field
      right = vec3(1.0, 0.0, 0.0);
      up = vec3(0.0, 1.0, 0.0);
    } else if (uFacing == 2) {              // wrapped on the radius
      vec2 nrm = normalize(p.xy + vec2(0.0001));
      right = vec3(-nrm.y, nrm.x, 0.0);
      up = vec3(0.0, 0.0, 1.0);
    } else {                                // along the direction of travel
      vec2 nrm = normalize(p.xy + vec2(0.0001));
      right = vec3(nrm.x, nrm.y, 0.0);
      up = vec3(-nrm.y, nrm.x, 0.0);
    }
    vec2 rc = rot2(corner, roll);
    vec3 world = p + right * rc.x + up * rc.y;
    viewPos = uView * vec4(world, 1.0);
  }

  gl_Position = uProj * viewPos;

  vUv = cell.xy + vec2(aCorner.x + 0.5, 0.5 - aCorner.y) * cell.zw;

  vec3 tint = uTintA;
  if (uColorMode == 1) tint = mix(uTintA, uTintB, dn);
  else if (uColorMode == 2) tint = mix(uTintA, uTintB, t01);
  else if (uColorMode == 3) tint = mix(uTintA, uTintB, aRand.y);
  vTint = tint;

  // Distance is expressed as fog on the colour, not as transparency: alpha has
  // to stay near 1 so the depth buffer can sort overlapping copies for us.
  vFog = uFog * smoothstep(0.0, 1.0, dn);
  vAlpha = fade01 * smoothstep(0.0, 0.06, dist);
}`;

const SCENE_FS = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform float uOpacity;
uniform float uCut;
uniform vec3 uFogColor;

in vec2 vUv;
in vec3 vTint;
in float vAlpha;
in float vFog;
out vec4 frag;

void main() {
  vec4 t = texture(uAtlas, vUv);
  // In depth-sorted mode the glyph is treated as a cut-out, so half-covered
  // texels never claim depth they have not earned.
  if (uCut > 0.5 && t.a < 0.5) discard;
  float a = t.a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  frag = vec4(mix(t.rgb * vTint, uFogColor, vFog), a);
}`;

/* ------------------------------------------------------------ background */

const BG_FS = `#version 300 es
precision highp float;

uniform int uType;
uniform vec3 uA, uB;
uniform float uAngle, uScale, uTime;
uniform vec2 uRes;
uniform sampler2D uPattern;
uniform float uPatRot, uPatJitter, uPatOpacity, uPatDrift;

in vec2 vUv;
out vec4 frag;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec2 rot2(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  vec2 uv = vUv;
  vec2 ar = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec3 col = uA;

  if (uType == 1) {                                   // linear
    float a = radians(uAngle);
    float t = clamp(dot(uv - 0.5, vec2(cos(a), sin(a))) + 0.5, 0.0, 1.0);
    col = mix(uA, uB, t);
  } else if (uType == 2) {                            // radial
    float d = length((uv - 0.5) * ar) / (0.72 / max(uScale, 0.05));
    col = mix(uB, uA, clamp(d, 0.0, 1.0));
  } else if (uType == 3) {                            // grid
    vec2 g = uv * ar * 10.0 * uScale;
    vec2 w = fwidth(g);
    vec2 d = abs(fract(g) - 0.5);
    float line = 1.0 - min(min(d.x / max(w.x, 0.0001), d.y / max(w.y, 0.0001)), 1.0);
    col = mix(uA, uB, clamp(line, 0.0, 1.0) * 0.9);
  } else if (uType == 4) {                            // dots
    vec2 g = uv * ar * 14.0 * uScale;
    vec2 f = fract(g) - 0.5;
    float d = length(f);
    float r = 0.16;
    float m = 1.0 - smoothstep(r - fwidth(d) * 1.5, r + fwidth(d) * 1.5, d);
    col = mix(uA, uB, m);
  } else if (uType == 5) {                            // stripes
    vec2 p = rot2(uv * ar - 0.5, radians(uAngle));
    float s = step(0.5, fract(p.x * 8.0 * uScale));
    col = mix(uA, uB, s);
  } else if (uType == 6) {                            // noise
    float v = valueNoise(uv * ar * 8.0 * uScale + uTime * 0.02);
    v = v * 0.6 + valueNoise(uv * ar * 22.0 * uScale) * 0.4;
    col = mix(uA, uB, smoothstep(0.35, 0.75, v));
  } else if (uType == 7) {                            // glyph pattern
    vec2 g = uv * ar * 5.0 * max(uScale, 0.05) + vec2(uTime * uPatDrift * 0.15, uTime * uPatDrift * 0.09);
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h1 = hash(cell), h2 = hash(cell + 17.3);
    f += (vec2(h1, h2) - 0.5) * uPatJitter * 0.7;
    f = rot2(f, radians(uPatRot) + (h1 - 0.5) * uPatJitter * TAU);
    vec4 tex = texture(uPattern, clamp(f + 0.5, 0.001, 0.999));
    float m = tex.a * uPatOpacity;
    col = mix(uA, uB * tex.rgb, m);
  }

  frag = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ post */

const BRIGHT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uThreshold;
in vec2 vUv;
out vec4 frag;
void main() {
  vec4 c = texture(uTex, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(1.0 - uThreshold, 0.001);
  frag = vec4(c.rgb * k, c.a);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUv;
out vec4 frag;
void main() {
  vec4 sum = texture(uTex, vUv) * 0.227027;
  sum += (texture(uTex, vUv + uDir * 1.3846) + texture(uTex, vUv - uDir * 1.3846)) * 0.3162162;
  sum += (texture(uTex, vUv + uDir * 3.2308) + texture(uTex, vUv - uDir * 3.2308)) * 0.0702703;
  frag = sum;
}`;

const POST_FS = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomAmt, uChroma, uGrain, uScan, uVignette, uPixelate, uPosterize, uContrast;
uniform float uInvert;

in vec2 vUv;
out vec4 frag;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  if (uPixelate > 0.0) {
    float n = max(6.0, uRes.x * pow(0.5, 1.0 + uPixelate * 7.0));
    vec2 grid = vec2(n, max(4.0, floor(n * uRes.y / max(uRes.x, 1.0))));
    uv = (floor(uv * grid) + 0.5) / grid;
  }

  vec4 c;
  if (uChroma > 0.0) {
    vec2 dir = (uv - 0.5) * uChroma * 0.04;
    float r = texture(uScene, uv + dir).r;
    vec4 g = texture(uScene, uv);
    float b = texture(uScene, uv - dir).b;
    float a = max(g.a, max(texture(uScene, uv + dir).a, texture(uScene, uv - dir).a));
    c = vec4(r, g.g, b, a);
  } else {
    c = texture(uScene, uv);
  }

  if (uBloomAmt > 0.0) {
    vec4 b = texture(uBloom, uv);
    c.rgb += b.rgb * uBloomAmt;
    c.a = clamp(c.a + dot(b.rgb, vec3(0.33)) * uBloomAmt, 0.0, 1.0);
  }

  if (uPosterize > 0.0) {
    float steps = mix(64.0, 3.0, uPosterize);
    c.rgb = floor(c.rgb * steps + 0.5) / steps;
  }

  if (uContrast != 0.0) {
    float k = 1.0 + uContrast;
    c.rgb = clamp((c.rgb - 0.5) * k + 0.5, 0.0, 1.0);
  }

  if (uScan > 0.0) {
    // Fixed line count, so a clip looks the same at any export size.
    float line = 0.5 + 0.5 * sin(uv.y * 700.0);
    c.rgb *= mix(1.0, 0.35 + 0.65 * line, uScan);
  }

  if (uGrain > 0.0) {
    float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
    c.rgb += g * uGrain * 0.5;
  }

  if (uVignette > 0.0) {
    vec2 d = (uv - 0.5) * vec2(1.0, uRes.y / max(uRes.x, 1.0)) * 2.0;
    float v = 1.0 - smoothstep(0.65, 1.5, length(d));
    c.rgb *= mix(1.0, v, uVignette);
  }

  if (uInvert > 0.5) c.rgb = 1.0 - c.rgb;

  frag = vec4(clamp(c.rgb, 0.0, 1.0), clamp(c.a, 0.0, 1.0));
}`;

window.ISO.GLSL = { QUAD_VS, SCENE_VS, SCENE_FS, BG_FS, BRIGHT_FS, BLUR_FS, POST_FS };
})();
