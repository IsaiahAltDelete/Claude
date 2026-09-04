/* ---------------------------------------------------------------------------
   GLSL for the image page.

   Every stage is a fullscreen pass over the same quad, so the whole file is
   one vertex shader and a list of fragment shaders. Each shader ships with a
   manifest of its uniforms — name, GL setter type, and either the parameter
   key that feeds it or the renderer-side value that does. The renderer walks
   that manifest instead of knowing any shader by name, which means a new
   control is a row in the table and a line in a manifest, never a new branch
   in the render loop.
   --------------------------------------------------------------------------- */

(() => {
const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* ---------------------------------------------------------------- geometry

   Placement of the source inside the canvas. The photograph and the subject
   mask both come through here with identical uniforms, so the two stay in
   register no matter how the frame is moved. */

const GEOM_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;

uniform int uFit;
uniform float uZoom, uPanX, uPanY, uRotate;
uniform float uFlipH, uFlipV;
uniform float uImageAspect, uCanvasAspect, uFlipUv;

in vec2 vUv;
out vec4 frag;

vec2 rot2(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// Drawn size of the source in canvas units, where the canvas is one unit tall
// and uCanvasAspect units wide.
vec2 frameSize() {
  if (uFit == 2) return vec2(uCanvasAspect, 1.0);
  float h = uCanvasAspect / max(uImageAspect, 0.0001);
  h = uFit == 0 ? max(1.0, h) : min(1.0, h);
  return vec2(h * max(uImageAspect, 0.0001), h);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uCanvasAspect, 1.0);

  // The transform is read backwards, from canvas to source, so each control
  // is inverted here to read forwards on screen.
  p -= vec2(uPanX * uCanvasAspect, uPanY) * 0.5;
  p = rot2(p, -radians(uRotate));
  p /= max(uZoom, 0.0001);

  vec2 uv = p / frameSize() + 0.5;
  if (uFlipH > 0.5) uv.x = 1.0 - uv.x;
  if (uFlipV > 0.5) uv.y = 1.0 - uv.y;

  // Outside the source rectangle nothing exists at all. A one-texel ramp on
  // the way out keeps a rotated frame from showing a staircase edge.
  vec2 fw = fwidth(uv) + 0.00001;
  vec2 cov2 = smoothstep(vec2(0.0), fw, uv) * smoothstep(vec2(0.0), fw, 1.0 - uv);
  float cov = cov2.x * cov2.y;

  vec2 s = uv;
  if (uFlipUv > 0.5) s.y = 1.0 - s.y;

  // Coverage lands on alpha, so the soft edge composites as straight alpha
  // rather than being darkened twice. Colour is cut only where there is no
  // coverage at all, which is what the mask pass needs: a mask read from the
  // red channel must be zero beyond the frame, not the clamped edge value.
  vec4 texel = texture(uTex, clamp(s, 0.0, 1.0));
  frag = vec4(texel.rgb * step(0.0001, cov), texel.a * cov);
}`;

/* -------------------------------------------------------------------- tone

   Everything that is a decision about colour rather than about shape: the
   photographic controls, then the grade panel on top of them. Light is
   gathered in linear space because exposure and white balance are physical;
   the tonal controls run in display space because that is where they were
   designed to feel right. */

const TONE_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;

uniform float uExposure, uContrast, uBrightness, uGamma;
uniform float uHighlights, uShadows, uWhites, uBlacks;
uniform float uTemperature, uTintGM, uVibrance, uSaturation, uHueShift;

uniform int uGradeMode;
uniform float uGradeAmt;
uniform vec3 uGradeA, uGradeB, uGradeC;

uniform float uPosterize, uThresholdAmt, uThresholdLevel;
uniform int uDither;
uniform float uDitherLevels;
uniform float uSolarize, uSepia, uInvert;

in vec2 vUv;
out vec4 frag;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toDisplay(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Ordered dither thresholds, built by the usual doubling recursion so the
// three sizes share one two-by-two seed.
float bayer2u(vec2 p) {
  vec2 c = mod(floor(p), 2.0);
  return mod(2.0 * c.y + 3.0 * c.x, 4.0);
}
float bayer4u(vec2 p) { return 4.0 * bayer2u(floor(p * 0.5)) + bayer2u(p); }
float bayer8u(vec2 p) { return 4.0 * bayer4u(floor(p * 0.5)) + bayer2u(p); }

vec3 stageLight(vec3 c) {
  c = toLinear(c);
  c *= exp2(uExposure);

  // Warm shifts red up and blue down; tint runs green against magenta and
  // lifts the other two a little so the overall level barely moves.
  vec3 gain = vec3(1.0 + uTemperature * 0.32 + uTintGM * 0.10,
                   1.0 - uTintGM * 0.22,
                   1.0 - uTemperature * 0.32 + uTintGM * 0.10);
  return toDisplay(c * gain);
}

vec3 stageTone(vec3 c) {
  c += uBrightness * 0.35;

  // Positive contrast is an S-curve rather than a gain, so the ends roll off
  // instead of clipping; negative contrast folds towards mid grey.
  vec3 hi = smoothstep(vec3(0.0), vec3(1.0), c);
  vec3 lo = c * 0.5 + 0.25;
  c = mix(c, mix(lo, hi, step(0.0, uContrast)), abs(uContrast));

  c = pow(max(c, 0.0), vec3(1.0 / max(uGamma, 0.01)));

  // The four range controls are weighted by luminance, so each one only
  // reaches the band it is named after and colour ratios survive.
  float L = luma(c);
  c += uHighlights * smoothstep(0.5, 1.0, L) * 0.45;
  c += uShadows * (1.0 - smoothstep(0.0, 0.5, L)) * 0.45;
  c += uWhites * smoothstep(0.7, 1.0, L) * 0.35;
  c += uBlacks * (1.0 - smoothstep(0.0, 0.3, L)) * 0.35;

  return clamp(c, 0.0, 1.0);
}

vec3 stageColour(vec3 c) {
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  hsv.x = fract(hsv.x + uHueShift / 360.0);
  // Vibrance is weighted by how unsaturated the pixel already is, which is
  // what keeps skin from going first.
  hsv.y = clamp(hsv.y * (1.0 + uVibrance * (1.0 - hsv.y)), 0.0, 1.0);
  hsv.y = clamp(hsv.y * (1.0 + uSaturation), 0.0, 1.0);
  return hsv2rgb(hsv);
}

vec3 stageGrade(vec3 c) {
  if (uGradeMode == 0) return c;

  float L = luma(c);
  vec3 g = c;

  if (uGradeMode == 1) {                       // duotone
    g = mix(uGradeA, uGradeB, smoothstep(0.0, 1.0, L));
  } else if (uGradeMode == 2) {                // gradient, three stops
    g = L < 0.5 ? mix(uGradeA, uGradeC, L * 2.0) : mix(uGradeC, uGradeB, (L - 0.5) * 2.0);
  } else if (uGradeMode == 3) {                // split tone
    float sh = 1.0 - smoothstep(0.0, 0.5, L);
    float hl = smoothstep(0.5, 1.0, L);
    float mid = clamp(1.0 - sh - hl, 0.0, 1.0);
    g = c + (uGradeA - 0.5) * sh * 0.55 + (uGradeB - 0.5) * hl * 0.55 + (uGradeC - 0.5) * mid * 0.30;
  } else {                                     // mono
    g = vec3(L);
  }

  return mix(c, clamp(g, 0.0, 1.0), uGradeAmt);
}

vec3 stageBreak(vec3 c, vec2 px) {
  if (uPosterize > 0.0) {
    float steps = max(2.0, floor(mix(48.0, 2.0, uPosterize)));
    c = floor(c * steps + 0.5) / steps;
  }

  if (uThresholdAmt > 0.0) {
    float L = luma(c);
    float t = smoothstep(uThresholdLevel - 0.03, uThresholdLevel + 0.03, L);
    c = mix(c, vec3(t), uThresholdAmt);
  }

  if (uDither > 0) {
    float n = max(2.0, floor(uDitherLevels));
    float d = hash(px);
    if (uDither == 1) d = bayer2u(px) / 4.0;
    else if (uDither == 2) d = bayer4u(px) / 16.0;
    else if (uDither == 3) d = bayer8u(px) / 64.0;
    c = floor(clamp(c, 0.0, 1.0) * (n - 1.0) + d) / (n - 1.0);
  }

  c = mix(c, 1.0 - abs(1.0 - 2.0 * c), uSolarize);

  vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)),
                  dot(c, vec3(0.349, 0.686, 0.168)),
                  dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, clamp(sep, 0.0, 1.0), uSepia);

  c = mix(c, 1.0 - c, step(0.5, uInvert));
  return c;
}

void main() {
  vec4 src = texture(uTex, vUv);
  vec3 c = stageLight(src.rgb);
  c = stageTone(c);
  c = stageColour(c);
  c = stageGrade(c);
  c = stageBreak(c, gl_FragCoord.xy);
  frag = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/* -------------------------------------------------------------------- blur

   One separable Gaussian, nine taps, run once per axis. Clarity, soften,
   background blur and bloom all read the same output, so this pass is worth
   keeping cheap. */

const BLUR_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uRadius;

in vec2 vUv;
out vec4 frag;

const float W[5] = float[5](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);

void main() {
  vec2 tap = uDir * uRadius;
  vec4 sum = texture(uTex, vUv) * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = tap * float(i);
    sum += (texture(uTex, vUv + o) + texture(uTex, vUv - o)) * W[i];
  }
  frag = sum;
}`;

/* ------------------------------------------------------------------- style

   The effect panel. Everything that moves a sample lands first, because they
   all argue about the same coordinate and only one of them can win last;
   everything that changes a colour follows, reading the coordinate they
   agreed on. */

const STYLE_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform sampler2D uBlur;

uniform vec2 uRes;
uniform float uTime;

uniform float uClarity, uSharpen, uSoftBlur;
uniform float uPixelate;
uniform float uHalftone, uHalftoneScale, uHalftoneAngle;
uniform int uHalftoneShape;
uniform float uEdge;
uniform int uEdgeMode;
uniform float uEmboss;
uniform float uGlitch, uGlitchScale;
uniform float uRgbSplit, uRgbAngle;
uniform float uScanlines, uScanCount;
uniform float uKaleido, uKaleidoAngle;
uniform int uMirror;
uniform float uWaveAmt, uWaveFreq;

in vec2 vUv;
out vec4 frag;

const float TAU = 6.28318530718;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 rot2(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/* ---- coordinate stage ---- */

vec2 applyMirror(vec2 uv) {
  if (uMirror == 1) uv.x = 0.5 - abs(uv.x - 0.5);
  else if (uMirror == 2) uv.x = 0.5 + abs(uv.x - 0.5);
  else if (uMirror == 3) uv.y = 0.5 + abs(uv.y - 0.5);
  else if (uMirror == 4) uv.y = 0.5 - abs(uv.y - 0.5);
  else if (uMirror == 5) uv = 0.5 - abs(uv - 0.5);
  return uv;
}

vec2 applyKaleido(vec2 uv, float aspect) {
  float seg = floor(uKaleido + 0.5);
  if (seg < 1.0) return uv;

  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float a = atan(p.y, p.x) + radians(uKaleidoAngle);
  float r = length(p);

  // Fold the circle into one wedge and mirror it, so the seams meet instead
  // of butting up against each other.
  float w = TAU / seg;
  a = abs(mod(a, w) - w * 0.5);

  p = vec2(cos(a), sin(a)) * r;
  return p / vec2(aspect, 1.0) + 0.5;
}

vec2 applyWave(vec2 uv) {
  if (uWaveAmt <= 0.0) return uv;
  float t = uTime * 0.6;
  vec2 d = vec2(sin((uv.y * uWaveFreq + t) * TAU * 0.25),
                cos((uv.x * uWaveFreq - t) * TAU * 0.25));
  return uv + d * uWaveAmt * 0.06;
}

vec2 applyGlitch(vec2 uv) {
  if (uGlitch <= 0.0) return uv;
  float slices = max(2.0, floor(uGlitchScale));
  float row = floor(vUv.y * slices);
  float frame = floor(uTime * 9.0);
  float pick = hash(vec2(row, frame));
  float shift = hash(vec2(row + 3.7, frame * 1.3)) - 0.5;
  // Only a minority of the slices tear at once, which is what makes the rest
  // read as intact rather than as noise.
  uv.x += shift * uGlitch * 0.4 * step(0.68, pick);
  return uv;
}

vec2 applyPixelate(vec2 uv, float aspect) {
  if (uPixelate <= 0.0) return uv;
  // Quantised last of the geometric stages so the blocks stay square to the
  // canvas rather than following a fold.
  float n = max(4.0, uRes.x * pow(0.5, uPixelate * 8.0));
  vec2 grid = vec2(n, max(3.0, floor(n / max(aspect, 0.0001))));
  return (floor(uv * grid) + 0.5) / grid;
}

/* ---- colour stage ---- */

vec3 applyEdge(vec3 c, vec2 uv) {
  if (uEdge <= 0.0) return c;
  vec2 t = 1.0 / uRes;

  float tl = luma(texture(uTex, uv + t * vec2(-1.0, 1.0)).rgb);
  float tc = luma(texture(uTex, uv + t * vec2(0.0, 1.0)).rgb);
  float tr = luma(texture(uTex, uv + t * vec2(1.0, 1.0)).rgb);
  float ml = luma(texture(uTex, uv + t * vec2(-1.0, 0.0)).rgb);
  float mr = luma(texture(uTex, uv + t * vec2(1.0, 0.0)).rgb);
  float bl = luma(texture(uTex, uv + t * vec2(-1.0, -1.0)).rgb);
  float bc = luma(texture(uTex, uv + t * vec2(0.0, -1.0)).rgb);
  float br = luma(texture(uTex, uv + t * vec2(1.0, -1.0)).rgb);

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float e = clamp(length(vec2(gx, gy)) * 1.4, 0.0, 1.0);

  vec3 drawn = c * (1.0 - e);
  if (uEdgeMode == 1) drawn = vec3(e);
  else if (uEdgeMode == 2) drawn = vec3(1.0 - e);
  return mix(c, drawn, uEdge);
}

vec3 applyEmboss(vec3 c, vec2 uv) {
  if (uEmboss <= 0.0) return c;
  vec2 t = 1.0 / uRes;
  float hi = luma(texture(uTex, uv - t).rgb);
  float lo = luma(texture(uTex, uv + t).rgb);
  vec3 relief = vec3(clamp(0.5 + (hi - lo) * 3.0, 0.0, 1.0));
  return mix(c, relief, uEmboss);
}

// One screen, returned as paper coverage: 1 where the cell is bare and 0
// where the ink lands.
float screenCell(vec2 px, float angleDeg, float value) {
  float cell = max(uHalftoneScale, 2.0);
  vec2 f = fract(rot2(px, radians(angleDeg)) / cell) - 0.5;
  float aa = 0.9 / cell;
  float ink = clamp(1.0 - value, 0.0, 1.0);

  // Each shape is pulled back by the width of its own soft edge, otherwise a
  // tone of pure white still leaves half a dot at the centre of every cell.
  if (uHalftoneShape == 1) {
    float w = ink * 0.55 - aa * 1.5;
    return smoothstep(w - aa, w + aa, abs(f.y));
  }
  if (uHalftoneShape == 2) {
    float w = ink * 0.5 - aa * 1.5;
    return smoothstep(w - aa, w + aa, min(abs(f.x), abs(f.y)));
  }
  float r = sqrt(ink) * 0.72 - aa * 1.5;
  return smoothstep(r - aa, r + aa, length(f));
}

vec3 applyHalftone(vec3 c, vec2 px) {
  if (uHalftone <= 0.0) return c;
  // Separate screen angles per channel, the way a press would set them, so a
  // colour image gets rosettes instead of one flat moire.
  vec3 dots = vec3(screenCell(px, uHalftoneAngle + 15.0, c.r),
                   screenCell(px, uHalftoneAngle + 75.0, c.g),
                   screenCell(px, uHalftoneAngle, c.b));
  return mix(c, dots, uHalftone);
}

vec3 applyScanlines(vec3 c) {
  if (uScanlines <= 0.0) return c;
  // Counted across the canvas rather than in texels, so the look holds at any
  // export size.
  float line = 0.5 + 0.5 * cos(vUv.y * max(uScanCount, 1.0) * TAU);
  return c * mix(1.0, 0.25 + 0.75 * line, uScanlines);
}

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);

  vec2 uv = applyMirror(vUv);
  uv = applyKaleido(uv, aspect);
  uv = applyWave(uv);
  uv = applyGlitch(uv);
  uv = applyPixelate(uv, aspect);
  uv = clamp(uv, 0.0, 1.0);

  vec4 base = texture(uTex, uv);
  if (uRgbSplit > 0.0) {
    vec2 off = vec2(cos(radians(uRgbAngle)), sin(radians(uRgbAngle))) * uRgbSplit * 0.03;
    off.x /= max(aspect, 0.0001);
    base.r = texture(uTex, clamp(uv + off, 0.0, 1.0)).r;
    base.b = texture(uTex, clamp(uv - off, 0.0, 1.0)).b;
  }
  vec4 soft = texture(uBlur, uv);

  vec3 c = base.rgb;
  vec3 detail = base.rgb - soft.rgb;

  // Clarity and sharpen both come out of the same difference; clarity is
  // pulled towards the midtones so it thickens form without eating the ends.
  if (uClarity != 0.0) {
    float w = 1.0 - abs(luma(base.rgb) * 2.0 - 1.0);
    c += detail * uClarity * 1.6 * w;
  }
  if (uSharpen > 0.0) c += detail * uSharpen;
  if (uSoftBlur > 0.0) c = mix(c, soft.rgb, uSoftBlur);
  c = clamp(c, 0.0, 1.0);

  c = applyEdge(c, uv);
  c = applyEmboss(c, uv);
  c = applyHalftone(c, gl_FragCoord.xy);
  c = applyScanlines(c);

  frag = vec4(clamp(c, 0.0, 1.0), base.a);
}`;

/* -------------------------------------------------------------- composite

   Where the subject and its surroundings are finally separated. The CPU has
   already done the real morphology on the mask; the only shaping here is at
   the edge, which is the part that has to answer to a slider in real time.

   With no mask loaded the renderer binds an all-ones texture, and every
   remap below leaves that at one, so the page behaves as if the whole frame
   were the subject. */

const COMP_FS = `#version 300 es
precision highp float;

uniform sampler2D uStyled;
uniform sampler2D uPlain;
uniform sampler2D uBlur;
uniform sampler2D uMask;

uniform vec2 uRes;

uniform float uMaskFeather, uMaskExpand, uMaskSmooth, uShowMask;
uniform int uBgMode;
uniform vec3 uBgColorA, uBgColorB;
uniform float uBgBlur, uBgDim;
uniform int uEffectTarget;
uniform float uSubjectLift;
uniform float uOutline;
uniform vec3 uOutlineColor;
uniform float uShadowAmt, uShadowAngle, uShadowDist, uShadowBlurR;
uniform vec3 uShadowColor;

in vec2 vUv;
out vec4 frag;

const vec2 RING[8] = vec2[8](
  vec2(1.0, 0.0), vec2(0.7071068, 0.7071068), vec2(0.0, 1.0), vec2(-0.7071068, 0.7071068),
  vec2(-1.0, 0.0), vec2(-0.7071068, -0.7071068), vec2(0.0, -1.0), vec2(0.7071068, -0.7071068)
);

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Straight-alpha source over destination. Written out once because the
// shadow, the subject and the outline all stack the same way, and doing it by
// hand each time is how a transparent export picks up a grey fringe.
vec4 over(vec4 src, vec4 dst) {
  float a = src.a + dst.a * (1.0 - src.a);
  vec3 c = (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / max(a, 0.00001);
  return vec4(c, a);
}

float maskShape(float m) {
  float t = 0.5 - uMaskExpand * 0.45;
  float w = 0.015 + uMaskFeather * 0.40;
  return smoothstep(t - w, t + w, m);
}

float maskEdge(vec2 uv) {
  return maskShape(texture(uMask, clamp(uv, 0.0, 1.0)).r);
}

float maskAt(vec2 uv) {
  float m = texture(uMask, uv).r;
  if (uMaskSmooth > 0.0) {
    vec2 t = (1.0 + uMaskSmooth * 6.0) / uRes;
    m *= 0.36;
    m += (texture(uMask, clamp(uv + vec2(t.x, 0.0), 0.0, 1.0)).r
        + texture(uMask, clamp(uv - vec2(t.x, 0.0), 0.0, 1.0)).r) * 0.16;
    m += (texture(uMask, clamp(uv + vec2(0.0, t.y), 0.0, 1.0)).r
        + texture(uMask, clamp(uv - vec2(0.0, t.y), 0.0, 1.0)).r) * 0.16;
  }
  return maskShape(m);
}

// The band where a ring of samples disagrees is exactly the edge, at whatever
// width the ring is set to.
float outlineBand(vec2 uv, vec2 iso) {
  if (uOutline <= 0.0) return 0.0;
  float lo = 1.0, hi = 0.0;
  for (int i = 0; i < 8; i++) {
    float m = maskEdge(uv + RING[i] * uOutline * iso);
    lo = min(lo, m);
    hi = max(hi, m);
  }
  return clamp(hi - lo, 0.0, 1.0);
}

float shadowAt(vec2 uv, vec2 iso) {
  if (uShadowAmt <= 0.0) return 0.0;
  float a = radians(uShadowAngle);
  vec2 p = uv - vec2(cos(a), sin(a)) * uShadowDist * iso;
  if (uShadowBlurR <= 0.0) return maskEdge(p);

  float sum = maskEdge(p) * 0.12;
  for (int i = 0; i < 8; i++) {
    sum += maskEdge(p + RING[i] * uShadowBlurR * 0.5 * iso) * 0.06;
    sum += maskEdge(p + RING[i] * uShadowBlurR * iso) * 0.05;
  }
  return clamp(sum, 0.0, 1.0);
}

vec4 backgroundPlate(vec4 kept, vec4 blurred, vec2 px) {
  if (uBgMode == 1) return vec4(uBgColorA, 1.0);
  if (uBgMode == 2) return vec4(mix(uBgColorA, uBgColorB, smoothstep(0.0, 1.0, 1.0 - vUv.y)), 1.0);
  if (uBgMode == 3) return mix(kept, blurred, uBgBlur);
  if (uBgMode == 4) return vec4(0.0);
  if (uBgMode == 5) {
    float sq = mod(floor(px.x / 16.0) + floor(px.y / 16.0), 2.0);
    return vec4(mix(vec3(0.145), vec3(0.215), sq), 1.0);
  }
  return kept;
}

void main() {
  vec2 iso = vec2(max(uRes.y, 1.0) / max(uRes.x, 1.0), 1.0);

  vec4 styled = texture(uStyled, vUv);
  vec4 plain = texture(uPlain, vUv);
  vec4 blurred = texture(uBlur, vUv);

  float m = maskAt(vUv);

  // Which of the two images each side reads from is the whole of effectTarget.
  vec4 subject = uEffectTarget == 2 ? plain : styled;
  vec4 behind = uEffectTarget == 1 ? plain : styled;

  if (uShowMask > 0.5) {
    // Legibility beats fidelity here: the picture is flattened so the mask
    // reads over it, and the boundary itself is drawn as a line.
    vec3 grey = vec3(luma(plain.rgb)) * 0.55 + 0.07;
    vec3 shown = mix(grey, vec3(0.93, 0.20, 0.27), m * 0.62);
    float line = 1.0 - smoothstep(0.0, fwidth(m) * 2.0 + 0.004, abs(m - 0.5));
    frag = vec4(mix(shown, vec3(1.0), line * 0.85), 1.0);
    return;
  }

  vec4 bg = backgroundPlate(behind, blurred, gl_FragCoord.xy);

  // Both level shifts are stops rather than gains, to match the exposure
  // control they sit under in the panel.
  bg.rgb = clamp(bg.rgb * exp2(uBgDim * 2.0), 0.0, 1.0);
  subject.rgb = clamp(subject.rgb * exp2(uSubjectLift * 1.5), 0.0, 1.0);

  float sh = shadowAt(vUv, iso) * uShadowAmt * (1.0 - m);
  vec4 out0 = over(vec4(uShadowColor, sh), bg);

  out0 = over(vec4(subject.rgb, subject.a * m), out0);

  float band = outlineBand(vUv, iso);
  out0 = over(vec4(uOutlineColor, band), out0);

  frag = vec4(clamp(out0.rgb, 0.0, 1.0), clamp(out0.a, 0.0, 1.0));
}`;

/* -------------------------------------------------------------------- post

   Bright pass and the final finish. Alpha is carried through untouched by
   both, because a transparent background has to survive all the way to the
   PNG. */

const BRIGHT_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform float uBloomThresh;

in vec2 vUv;
out vec4 frag;

void main() {
  vec4 c = texture(uTex, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uBloomThresh) / max(1.0 - uBloomThresh, 0.001);
  frag = vec4(c.rgb * k * c.a, c.a);
}`;

const POST_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform sampler2D uBloom;

uniform vec2 uRes;
uniform float uTime;

uniform float uBloomAmt, uChroma, uGrain, uGrainSize, uVignette, uBorder;
uniform vec3 uBorderColor;

in vec2 vUv;
out vec4 frag;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);

  vec4 c = texture(uTex, vUv);
  if (uChroma > 0.0) {
    // Spread grows with distance from the centre, the way a real lens fails.
    vec2 d = (vUv - 0.5) * uChroma * 0.05;
    c.r = texture(uTex, clamp(vUv + d, 0.0, 1.0)).r;
    c.b = texture(uTex, clamp(vUv - d, 0.0, 1.0)).b;
  }

  if (uBloomAmt > 0.0) c.rgb += texture(uBloom, vUv).rgb * uBloomAmt;

  if (uGrain > 0.0) {
    vec2 cell = floor(gl_FragCoord.xy / max(uGrainSize, 0.5));
    float g = hash(cell + fract(uTime) * 91.7) - 0.5;
    // Film carries less grain where it is dense, so the highlights stay clean.
    c.rgb += g * uGrain * 0.38 * (1.0 - 0.55 * dot(c.rgb, vec3(0.3333)));
  }

  if (uVignette != 0.0) {
    vec2 d = (vUv - 0.5) * 2.0;
    d.x *= aspect;
    float v = smoothstep(0.55, 1.45, length(d));
    c.rgb *= 1.0 - v * max(uVignette, 0.0) * 0.95;
    c.rgb += (1.0 - c.rgb) * v * max(-uVignette, 0.0) * 0.9;
  }

  if (uBorder > 0.0) {
    // Measured in pixels off the shorter side, so the frame is the same
    // weight on all four edges whatever the ratio.
    vec2 px = min(vUv, 1.0 - vUv) * uRes;
    float w = uBorder * min(uRes.x, uRes.y);
    float f = 1.0 - smoothstep(w - 1.0, w + 1.0, min(px.x, px.y));
    c.rgb = mix(c.rgb, uBorderColor, f);
    c.a = max(c.a, f);
  }

  frag = vec4(clamp(c.rgb, 0.0, 1.0), clamp(c.a, 0.0, 1.0));
}`;

/* ---------------------------------------------------------------- manifest

   Sliders and toggles are all declared "1f", including the ones the table
   marks as integers: the shaders use them as floats, and one setter for every
   numeric control means the renderer never has to ask what a key means.
   Only the enumerated controls need "1i", and those carry the option list
   whose index the shader compares against. */

const PROGRAMS = [
  {
    id: "geom",
    fs: GEOM_FS,
    samplers: ["uTex"],
    uniforms: [
      { name: "uFit", type: "1i", key: "fit", enum: ["cover", "contain", "stretch"] },
      { name: "uZoom", type: "1f", key: "zoom" },
      { name: "uPanX", type: "1f", key: "panX" },
      { name: "uPanY", type: "1f", key: "panY" },
      { name: "uRotate", type: "1f", key: "rotate" },
      { name: "uFlipH", type: "1f", key: "flipH" },
      { name: "uFlipV", type: "1f", key: "flipV" },
      { name: "uImageAspect", type: "1f", src: "imageAspect" },
      { name: "uCanvasAspect", type: "1f", src: "canvasAspect" },
      { name: "uFlipUv", type: "1f", src: "flipUv" },
    ],
  },
  {
    id: "tone",
    fs: TONE_FS,
    samplers: ["uTex"],
    uniforms: [
      { name: "uExposure", type: "1f", key: "exposure" },
      { name: "uContrast", type: "1f", key: "contrast" },
      { name: "uBrightness", type: "1f", key: "brightness" },
      { name: "uGamma", type: "1f", key: "gamma" },
      { name: "uHighlights", type: "1f", key: "highlights" },
      { name: "uShadows", type: "1f", key: "shadows" },
      { name: "uWhites", type: "1f", key: "whites" },
      { name: "uBlacks", type: "1f", key: "blacks" },
      { name: "uTemperature", type: "1f", key: "temperature" },
      { name: "uTintGM", type: "1f", key: "tintGM" },
      { name: "uVibrance", type: "1f", key: "vibrance" },
      { name: "uSaturation", type: "1f", key: "saturation" },
      { name: "uHueShift", type: "1f", key: "hueShift" },
      { name: "uGradeMode", type: "1i", key: "gradeMode", enum: ["off", "duotone", "gradient", "split", "mono"] },
      { name: "uGradeAmt", type: "1f", key: "gradeAmt" },
      { name: "uGradeA", type: "3fc", key: "gradeA" },
      { name: "uGradeB", type: "3fc", key: "gradeB" },
      { name: "uGradeC", type: "3fc", key: "gradeC" },
      { name: "uPosterize", type: "1f", key: "posterize" },
      { name: "uThresholdAmt", type: "1f", key: "thresholdAmt" },
      { name: "uThresholdLevel", type: "1f", key: "thresholdLevel" },
      { name: "uDither", type: "1i", key: "dither", enum: ["off", "bayer2", "bayer4", "bayer8", "noise"] },
      { name: "uDitherLevels", type: "1f", key: "ditherLevels" },
      { name: "uSolarize", type: "1f", key: "solarize" },
      { name: "uSepia", type: "1f", key: "sepia" },
      { name: "uInvert", type: "1f", key: "invert" },
    ],
  },
  {
    id: "blur",
    fs: BLUR_FS,
    samplers: ["uTex"],
    uniforms: [
      { name: "uDir", type: "2f", src: "blurDir" },
      { name: "uRadius", type: "1f", src: "blurRadius" },
    ],
  },
  {
    id: "style",
    fs: STYLE_FS,
    samplers: ["uTex", "uBlur"],
    uniforms: [
      { name: "uRes", type: "2f", src: "resolution" },
      { name: "uTime", type: "1f", src: "time" },
      { name: "uClarity", type: "1f", key: "clarity" },
      { name: "uSharpen", type: "1f", key: "sharpen" },
      { name: "uSoftBlur", type: "1f", key: "softBlur" },
      { name: "uPixelate", type: "1f", key: "pixelate" },
      { name: "uHalftone", type: "1f", key: "halftone" },
      { name: "uHalftoneScale", type: "1f", key: "halftoneScale" },
      { name: "uHalftoneAngle", type: "1f", key: "halftoneAngle" },
      { name: "uHalftoneShape", type: "1i", key: "halftoneShape", enum: ["dot", "line", "cross"] },
      { name: "uEdge", type: "1f", key: "edge" },
      { name: "uEdgeMode", type: "1i", key: "edgeMode", enum: ["over", "only", "invert"] },
      { name: "uEmboss", type: "1f", key: "emboss" },
      { name: "uGlitch", type: "1f", key: "glitch" },
      { name: "uGlitchScale", type: "1f", key: "glitchScale" },
      { name: "uRgbSplit", type: "1f", key: "rgbSplit" },
      { name: "uRgbAngle", type: "1f", key: "rgbAngle" },
      { name: "uScanlines", type: "1f", key: "scanlines" },
      { name: "uScanCount", type: "1f", key: "scanCount" },
      { name: "uKaleido", type: "1f", key: "kaleido" },
      { name: "uKaleidoAngle", type: "1f", key: "kaleidoAngle" },
      { name: "uMirror", type: "1i", key: "mirror", enum: ["off", "left", "right", "top", "bottom", "quad"] },
      { name: "uWaveAmt", type: "1f", key: "waveAmt" },
      { name: "uWaveFreq", type: "1f", key: "waveFreq" },
    ],
  },
  {
    id: "comp",
    fs: COMP_FS,
    samplers: ["uStyled", "uPlain", "uBlur", "uMask"],
    uniforms: [
      { name: "uRes", type: "2f", src: "resolution" },
      { name: "uMaskFeather", type: "1f", key: "maskFeather" },
      { name: "uMaskExpand", type: "1f", key: "maskExpand" },
      { name: "uMaskSmooth", type: "1f", key: "maskSmooth" },
      { name: "uShowMask", type: "1f", key: "showMask" },
      { name: "uBgMode", type: "1i", key: "bgMode", enum: ["keep", "solid", "gradient", "blur", "transparent", "checker"] },
      { name: "uBgColorA", type: "3fc", key: "bgColorA" },
      { name: "uBgColorB", type: "3fc", key: "bgColorB" },
      { name: "uBgBlur", type: "1f", key: "bgBlur" },
      { name: "uBgDim", type: "1f", key: "bgDim" },
      { name: "uEffectTarget", type: "1i", key: "effectTarget", enum: ["all", "subject", "background"] },
      { name: "uSubjectLift", type: "1f", key: "subjectLift" },
      { name: "uOutline", type: "1f", key: "outline" },
      { name: "uOutlineColor", type: "3fc", key: "outlineColor" },
      { name: "uShadowAmt", type: "1f", key: "shadowAmt" },
      { name: "uShadowAngle", type: "1f", key: "shadowAngle" },
      { name: "uShadowDist", type: "1f", key: "shadowDist" },
      { name: "uShadowBlurR", type: "1f", key: "shadowBlurR" },
      { name: "uShadowColor", type: "3fc", key: "shadowColor" },
    ],
  },
  {
    id: "bright",
    fs: BRIGHT_FS,
    samplers: ["uTex"],
    uniforms: [
      { name: "uBloomThresh", type: "1f", key: "bloomThresh" },
    ],
  },
  {
    id: "post",
    fs: POST_FS,
    samplers: ["uTex", "uBloom"],
    uniforms: [
      { name: "uRes", type: "2f", src: "resolution" },
      { name: "uTime", type: "1f", src: "time" },
      { name: "uBloomAmt", type: "1f", key: "bloom" },
      { name: "uChroma", type: "1f", key: "chroma" },
      { name: "uGrain", type: "1f", key: "grain" },
      { name: "uGrainSize", type: "1f", key: "grainSize" },
      { name: "uVignette", type: "1f", key: "vignette" },
      { name: "uBorder", type: "1f", key: "border" },
      { name: "uBorderColor", type: "3fc", key: "borderColor" },
    ],
  },
];

window.ISO = window.ISO || {};
window.ISO.ImageGLSL = { QUAD_VS, PROGRAMS };
})();
