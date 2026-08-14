/* ===========================================================================
   Live TV.

   A preview pane over a channel guide: channels down the left, three hours of
   schedule across. The schedule is generated deterministically from the
   channel number and the half-hour slot, so the guide is the same every time
   it is opened and blocks keep their widths.
   =========================================================================== */

'use strict';

const SLOT_MS = 30 * 60 * 1000;
const PX_PER_SLOT = 236;

/** The half-hour boundary at or before `date`. */
function slotFloor(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30);
  return d;
}

/**
 * One day of schedule for a channel, from midnight. Lengths come out of the
 * same seeded generator every time, so a programme never changes width or
 * name between renders.
 */
function daySchedule(live, date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const key = `${live.num}|${day.toDateString()}`;
  const random = rng(key);
  const lengths = [30, 30, 30, 60, 60, 60, 90, 120];
  const out = [];
  let cursor = day.getTime();
  const end = cursor + 24 * 3600 * 1000;
  let i = 0;

  while (cursor < end) {
    const mins = lengths[Math.floor(random() * lengths.length)];
    const title = PROGRAMMES[Math.floor(random() * PROGRAMMES.length)];
    out.push({
      start: cursor,
      mins,
      title,
      desc: `${live.name} — ${title}. ${mins >= 90 ? 'Feature length.' : 'Part of the daily schedule.'}`,
    });
    cursor += mins * 60000;
    i += 1;
    if (i > 80) break;
  }
  return out;
}

/** The programme on air at a moment, with a readable time window. */
function programmeAt(live, date) {
  const t = date.getTime();
  const list = daySchedule(live, date);
  const found = list.find(p => t >= p.start && t < p.start + p.mins * 60000) || list[0];
  const from = new Date(found.start);
  const to = new Date(found.start + found.mins * 60000);
  return {
    ...found,
    window: `${fmtClock(from, State.system.clock12)} – ${fmtClock(to, State.system.clock12)}`,
  };
}

defineScreen('live', {
  render(host, arg) {
    const now = new Date();
    const gridStart = slotFloor(now);
    /* Two hours is exactly what fits beside the channel column at 1280 wide. */
    const columns = 4;
    const windowEnd = gridStart.getTime() + columns * SLOT_MS;

    const headers = [];
    for (let i = 0; i < columns; i += 1) {
      headers.push(fmtClock(new Date(gridStart.getTime() + i * SLOT_MS), State.system.clock12));
    }

    const rowsHTML = LIVE_CHANNELS.map((live, ri) => {
      const blocks = daySchedule(live, now)
        .filter(p => p.start + p.mins * 60000 > gridStart.getTime() && p.start < windowEnd);

      const cells = blocks.map((p, bi) => {
        const from = Math.max(p.start, gridStart.getTime());
        const to = Math.min(p.start + p.mins * 60000, windowEnd);
        const width = Math.max(60, ((to - from) / SLOT_MS) * PX_PER_SLOT - 4);
        const live_now = now.getTime() >= p.start && now.getTime() < p.start + p.mins * 60000;
        const start = new Date(p.start);
        return `<div class="gprog f${live_now ? ' now' : ''}" style="width:${Math.round(width)}px"
            data-fid="g${ri}-${bi}" data-live="${live.num}" data-start="${p.start}"${ri === 0 && bi === 0 ? ' data-first' : ''}>
            <span class="gp-t">${esc(p.title)}</span>
            <span class="gp-s">${fmtClock(start, State.system.clock12)} &middot; ${p.mins} min</span>
          </div>`;
      }).join('');

      return `<div class="guide-row">
          <div class="gch">
            <span class="gch-art">${channelArt(CH[live.id], 'sz-s')}</span>
            <span style="min-width:0">
              <span class="gch-num">${esc(live.num)}</span>
              <span class="gch-name">${esc(live.name)}</span>
            </span>
          </div>
          <div class="gprogs">${cells}</div>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="guide">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('live')}
        <div class="guide-hero">
          <div class="gh-screen" id="lv-preview"></div>
          <div class="gh-body" id="lv-body"></div>
        </div>
        <div class="guide-times">${headers.map(h => `<span>${esc(h)}</span>`).join('')}</div>
        <div class="guide-body scroll-y">${rowsHTML}</div>
      </div>`;

    const rail = wireSideRail(host);
    const preview = host.querySelector('#lv-preview');
    const body = host.querySelector('#lv-body');

    function paint(node) {
      if (!node || !node.dataset.live) return;
      const live = LIVE_CHANNELS.find(c => c.num === node.dataset.live);
      if (!live) return;
      const start = Number(node.dataset.start);
      const prog = programmeAt(live, new Date(start + 1000));
      const onAir = Date.now() >= start && Date.now() < start + prog.mins * 60000;

      preview.innerHTML = sceneArt(`${live.num}-${prog.title}`);
      body.innerHTML = `
        <div class="hero-title">${esc(prog.title)}</div>
        <div class="hero-meta">
          ${onAir ? '<span class="pill live">On now</span>' : '<span class="pill hd">Later</span>'}
          <span>${esc(live.num)}</span><span class="dot">&middot;</span>
          <span>${esc(live.name)}</span><span class="dot">&middot;</span>
          <span>${esc(prog.window)}</span>
        </div>
        <div class="hero-desc">${esc(prog.desc)}</div>
        <div class="t-small" style="margin-top:12px">Press <b>OK</b> to ${onAir ? 'watch' : 'see options'}.</div>`;
    }

    /* Opened from a "live now" tile elsewhere: start on that channel. */
    if (arg && arg.channel) {
      const target = host.querySelector(`.gprog.now[data-live="${CSS.escape(arg.channel)}"]`);
      if (target) setTimeout(() => setFocus(target), 0);
    }

    return {
      onFocus(node) { rail.onFocus(node); paint(node); },
      select(node) {
        if (rail.select(node)) return;
        if (!node.dataset.live) return;
        const live = LIVE_CHANNELS.find(c => c.num === node.dataset.live);
        const start = Number(node.dataset.start);
        const prog = programmeAt(live, new Date(start + 1000));
        const onAir = Date.now() >= start && Date.now() < start + prog.mins * 60000;
        if (onAir) { playLive(live, prog); return; }
        dialog({
          title: prog.title,
          body: `<p>${esc(live.num)} ${esc(live.name)} &middot; ${esc(prog.window)}</p>
                 <p>${esc(prog.desc)}</p>`,
          actions: [{ id: 'ok', label: 'OK' }, { id: 'watch', label: 'Watch this channel now' }],
        }).then(answer => { if (answer === 'watch') playLive(live, programmeAt(live, new Date())); });
      },
      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };
  },
});
