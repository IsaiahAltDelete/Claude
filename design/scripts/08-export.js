/* ---------------------------------------------------------------------------
   Getting work out: stills at exact pixel dimensions, and clips recorded from
   the live canvas.

   A still is captured by resizing the render targets to the requested output
   size, drawing one frame and reading it back in the same task — the drawing
   buffer is still intact at that point, so nothing has to be preserved
   between frames (which would cost memory on every frame of normal use).
   --------------------------------------------------------------------------- */

(() => {
const { download, toast, clamp } = window.ISO;

const CLIP_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Render one frame at exactly `multiplier` × the artboard size. */
async function still(app, multiplier = 1) {
  const s = app.state;
  const r = app.renderer;
  const w = clamp(Math.round(s.width * multiplier), 16, r.maxTex);
  const h = clamp(Math.round(s.height * multiplier), 16, r.maxTex);

  const restore = { w: r.width, h: r.height, samples: r.samples };
  r.resize(w, h, r.samples);
  r.render(s, app.clock);

  const blob = await new Promise((res) => r.canvas.toBlob(res, "image/png"));
  r.resize(restore.w, restore.h, restore.samples);
  app.requestFrame();
  return blob;
}

async function savePng(app, multiplier) {
  const blob = await still(app, multiplier);
  if (!blob) return toast("Export failed");
  download(blob, `isaiart-${stamp()}.png`);
  toast(`Saved PNG ${Math.round(app.state.width * multiplier)}×${Math.round(app.state.height * multiplier)}`);
}

async function copyPng(app) {
  const blob = await still(app, 1);
  if (!blob) return toast("Export failed");
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied to clipboard");
  } catch {
    download(blob, `isaiart-${stamp()}.png`);
    toast("Clipboard blocked — downloaded instead");
  }
}

/** Record the live canvas for `seconds`. Returns a stop() you can call early. */
function record(app, seconds, fps, onState) {
  if (typeof MediaRecorder === "undefined" || !app.renderer.canvas.captureStream) {
    toast("Recording is not supported in this browser");
    return null;
  }
  const type = CLIP_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) {
    toast("No supported video codec");
    return null;
  }

  const stream = app.renderer.canvas.captureStream(fps);
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 });
  } catch {
    toast("Recorder refused to start");
    return null;
  }

  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
    download(new Blob(chunks, { type }), `isaiart-${stamp()}.${ext}`);
    chunks.length = 0;
    onState?.(false);
    toast("Clip saved");
  };

  recorder.start();
  onState?.(true);
  const timer = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, seconds * 1000);

  return () => {
    clearTimeout(timer);
    if (recorder.state !== "inactive") recorder.stop();
  };
}

window.ISO.Export = { savePng, copyPng, record, still };
})();
