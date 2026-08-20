/* ---------------------------------------------------------------------------
   Getting pictures out.

   A still is captured by resizing the pipeline to the requested output size,
   drawing one frame and reading the canvas back in the same task, while the
   drawing buffer is still intact — so nothing has to be preserved between
   frames during normal use.
   --------------------------------------------------------------------------- */

(() => {
const { download, toast, clamp } = window.ISO;

const CLIP_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Name the file after the picture it came from, so a folder reads. */
function name(app, ext) {
  const slug = String(app.sourceName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `isaiart${slug ? "-" + slug : ""}-${stamp()}.${ext}`;
}

/* One export at a time: two overlapping captures would restore each other's
   temporary size and strand the preview at export resolution. */
let exporting = false;

async function still(app, multiplier = 1, forceFormat) {
  const s = app.state;
  const r = app.renderer;
  if (!r.hasImage) return { blob: null, format: "png" };
  const w = clamp(Math.round(s.width * multiplier), 16, r.maxTex);
  const h = clamp(Math.round(s.height * multiplier), 16, r.maxTex);
  // A zero here would clamp to a sixteen-pixel preview on the way back. It
  // takes one line to make the order of boot and export not matter.
  const restore = { w: r.width || Math.round(s.width), h: r.height || Math.round(s.height) };

  r.resize(w, h);
  r.render(s, app.clock);

  const format = forceFormat || (MIME[s.format] ? s.format : "png");
  const blob = await new Promise((res) =>
    r.canvas.toBlob(res, MIME[format], format === "png" ? undefined : s.jpgQuality));

  r.resize(restore.w, restore.h);
  app.requestFrame();
  return { blob, format };
}

async function save(app, multiplier) {
  if (exporting) return;
  if (!app.renderer.hasImage) return toast("Open an image first");
  exporting = true;
  try {
    const { blob, format } = await still(app, multiplier);
    if (!blob) return toast("Export failed");
    download(blob, name(app, format === "jpg" ? "jpg" : format));
    const s = app.state;
    toast(`Saved ${format.toUpperCase()} ${Math.round(s.width * multiplier)}×${Math.round(s.height * multiplier)}`);
  } finally {
    exporting = false;
  }
}

async function copy(app) {
  if (exporting) return;
  if (!app.renderer.hasImage) return toast("Open an image first");
  exporting = true;
  try {
    // The clipboard only reliably takes PNG, whatever the export format says.
    // It goes through still() rather than reading the live canvas, because the
    // preview is drawn at the quality tier's pixel budget and the button sits
    // under a promise of canvas size.
    const { blob } = await still(app, 1, "png");
    if (!blob) return toast("Export failed");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Copied to clipboard");
    } catch {
      download(blob, name(app, "png"));
      toast("Clipboard blocked — downloaded instead");
    }
  } finally {
    exporting = false;
  }
}

/** Record the live canvas. Only useful with the animated effects running. */
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
    download(new Blob(chunks, { type }), name(app, ext));
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

window.ISO.Export = { save, copy, record, still };
})();
