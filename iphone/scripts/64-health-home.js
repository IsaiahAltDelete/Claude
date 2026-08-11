/* ===========================================================================
   Health, Fitness, Home, Find My, FaceTime, Books, Podcasts and Freeform.

   The data is generated from the seeded PRNG keyed on the calendar date, so a
   week of activity looks plausible and stays stable while you browse it.
   =========================================================================== */

/* =============================================================== HEALTH === */

const HEALTH_METRICS = [
  { id: 'steps', name: 'Steps', unit: 'steps', colour: '#ff9f0a', base: 6400, spread: 4200, round: 1 },
  { id: 'distance', name: 'Walking + Running Distance', unit: 'mi', colour: '#ff9f0a', base: 2.7, spread: 2.1, round: 0.01 },
  { id: 'flights', name: 'Flights Climbed', unit: 'floors', colour: '#ff9f0a', base: 7, spread: 8, round: 1 },
  { id: 'heart', name: 'Heart Rate', unit: 'BPM', colour: '#ff375f', base: 68, spread: 22, round: 1 },
  { id: 'resting', name: 'Resting Heart Rate', unit: 'BPM', colour: '#ff375f', base: 58, spread: 8, round: 1 },
  { id: 'sleep', name: 'Sleep', unit: 'hr', colour: '#5e5ce6', base: 6.9, spread: 1.8, round: 0.1 },
  { id: 'energy', name: 'Active Energy', unit: 'cal', colour: '#30d158', base: 420, spread: 280, round: 1 },
  { id: 'exercise', name: 'Exercise Minutes', unit: 'min', colour: '#30d158', base: 26, spread: 24, round: 1 },
  { id: 'stand', name: 'Stand Hours', unit: 'hr', colour: '#40c8e0', base: 9, spread: 4, round: 1 },
  { id: 'water', name: 'Water', unit: 'fl oz', colour: '#5ac8fa', base: 44, spread: 30, round: 1 },
  { id: 'weight', name: 'Weight', unit: 'lb', colour: '#bf5af2', base: 168, spread: 3, round: 0.1 },
  { id: 'oxygen', name: 'Blood Oxygen', unit: '%', colour: '#ff453a', base: 97, spread: 2, round: 1 },
  { id: 'noise', name: 'Environmental Sound', unit: 'dB', colour: '#ffd60a', base: 62, spread: 18, round: 1 },
  { id: 'screen', name: 'Time in Daylight', unit: 'min', colour: '#ffd60a', base: 64, spread: 50, round: 1 },
];

const healthMetric = id => HEALTH_METRICS.find(m => m.id === id);

/** Value for a metric on a given day offset (0 = today). Deterministic. */
function healthValue(id, dayOffset = 0) {
  const metric = healthMetric(id);
  const day = Math.floor(Date.now() / 864e5) - dayOffset;
  const random = rng(`health:${id}:${day}`);
  const weekday = new Date(Date.now() - dayOffset * 864e5).getDay();
  const weekendDip = (weekday === 0 || weekday === 6) && ['steps', 'exercise', 'energy'].includes(id) ? 0.72 : 1;
  let value = (metric.base + (random() - 0.4) * metric.spread) * weekendDip;
  // Today is only partly done, so scale by how much of the day has elapsed.
  if (dayOffset === 0 && ['steps', 'distance', 'flights', 'energy', 'exercise', 'stand', 'water', 'screen'].includes(id)) {
    const hours = new Date().getHours() + new Date().getMinutes() / 60;
    value *= Math.min(1, Math.max(0.08, (hours - 6.5) / 15));
  }
  value = Math.max(0, value);
  return Math.round(value / metric.round) * metric.round;
}

const healthWeek = id => Array.from({ length: 7 }, (_, index) => healthValue(id, 6 - index));

function healthFormat(id, value) {
  const metric = healthMetric(id);
  const text = metric.round < 1 ? value.toFixed(String(metric.round).split('.')[1].length) : Math.round(value).toLocaleString();
  return `${text} ${metric.unit}`;
}

function HL() {
  return slice('health', () => ({
    favourites: ['steps', 'heart', 'sleep', 'energy', 'exercise'],
    profile: { name: 'Alex Rivera', dob: '1996-04-14', sex: 'Male', height: `5'11"`, blood: 'O+' },
    medications: [
      { id: 1, name: 'Vitamin D3', dose: '2000 IU', when: 'Morning', taken: true },
      { id: 2, name: 'Cetirizine', dose: '10 mg', when: 'Evening', taken: false },
    ],
    medicalID: { conditions: 'None', allergies: 'Penicillin', contact: 'Nina Okafor — 407-555-0142', organDonor: true },
  }));
}

defineApp({
  id: 'health',
  name: 'Health',
  bg: 'linear-gradient(180deg,#fff,#f6f6f8)',
  glyph: `<div style="display:grid;place-items:center;height:100%">
    <svg viewBox="0 0 32 32" style="width:26px;height:26px">
      <path d="M16 28C8 22.4 3 18.2 3 12.6A7.6 7.6 0 0116 8.4 7.6 7.6 0 0129 12.6C29 18.2 24 22.4 16 28z" fill="#ff2d55"/></svg></div>`,
  mount(win, inst) {
    HL();
    const nav = new Nav(win);
    inst.nav = nav;
    inst.tab = inst.tab || 'Summary';
    const tabbar = el('div', 'tabbar');
    const setTab = name => {
      inst.tab = name;
      nav.setRoot(name === 'Summary' ? healthSummaryView() : healthBrowseView());
      nav.top._page.appendChild(tabbar);
      paint();
    };
    const paint = () => {
      tabbar.innerHTML = '';
      [['Summary', SF.star], ['Sharing', SF.person], ['Browse', SF.grid]].forEach(([name, glyph]) => {
        const button = el('button', inst.tab === name ? 'on' : '', `${glyph}<span>${name}</span>`);
        button.onclick = () => {
          if (name === 'Sharing') { toast('Health Sharing needs a second device'); return; }
          setTab(name);
        };
        tabbar.appendChild(button);
      });
    };
    setTab(inst.tab);
  },
  onShow(inst) { inst.nav.refresh(); },
});

function healthSummaryView() {
  return {
    title: 'Summary',
    largeTitle: true,
    right: [{ html: `<div class="avatar" style="background:#ff2d55;width:30px;height:30px;font-size:13px">A</div>`,
      onClick: nav => nav.push(healthProfileView()) }],
    build(body, nav) {
      const state = HL();

      /* Today's rings, borrowed from Fitness so the two apps agree. */
      const goals = fitnessGoals();
      const move = healthValue('energy');
      const exercise = healthValue('exercise');
      const stand = healthValue('stand');
      card(body, box => {
        box.style.padding = '16px';
        box.appendChild(h(`<div style="font-size:13px;color:var(--txt3);font-weight:600">TODAY’S ACTIVITY</div>`));
        const row = el('div');
        row.style.cssText = 'display:flex;align-items:center;gap:18px;margin-top:12px';
        row.innerHTML = `<div style="position:relative;width:112px;height:112px;flex:none">
          <div style="position:absolute;inset:0">${ringSVG(move / goals.move, '#ff375f', { size: 112, width: 12 })}</div>
          <div style="position:absolute;inset:16px">${ringSVG(exercise / goals.exercise, '#a3e635', { size: 80, width: 12 })}</div>
          <div style="position:absolute;inset:32px">${ringSVG(stand / goals.stand, '#40c8e0', { size: 48, width: 12 })}</div></div>
          <div style="flex:1;min-width:0;font-size:14px;line-height:1.7">
            <div style="color:#ff375f">Move <b>${Math.round(move)}</b>/${goals.move} cal</div>
            <div style="color:#7bc62d">Exercise <b>${Math.round(exercise)}</b>/${goals.exercise} min</div>
            <div style="color:#40c8e0">Stand <b>${Math.round(stand)}</b>/${goals.stand} hrs</div></div>`;
        box.appendChild(row);
        const open = el('button', '', 'Open Fitness →');
        open.style.cssText = 'color:var(--sysblue);font-size:14px;margin-top:12px';
        open.onclick = () => openApp('fitness');
        box.appendChild(open);
      });

      /* Favourites */
      body.appendChild(cardHeader('Favourites', 'Edit'));
      state.favourites.forEach(id => {
        const metric = healthMetric(id);
        const week = healthWeek(id);
        const item = el('div');
        item.style.cssText = 'background:var(--group);border-radius:14px;padding:14px 16px;margin:10px 16px;cursor:pointer';
        item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="color:${metric.colour};font-weight:600;font-size:15px">${esc(metric.name)}</div>
            <div style="color:var(--txt3);font-size:12px">${esc(relativeDay(Date.now()))}</div></div>
          <div style="font-size:26px;font-weight:600;margin-top:4px">${esc(healthFormat(id, healthValue(id)))}</div>`;
        item.appendChild(barsSVG(week, {
          labels: Array.from({ length: 7 }, (_, index) => shortDay(new Date(Date.now() - (6 - index) * 864e5))[0]),
          colour: metric.colour,
          height: 84,
        }));
        item.onclick = () => nav.push(healthMetricView(id));
        body.appendChild(item);
      });

      /* Highlights, medications and the medical ID */
      group(body, {
        header: 'Highlights',
        rows: [
          {
            labelHTML: `<div>Steps are up this week</div><div class="sub">Averaging ${Math.round(healthWeek('steps').reduce((a, b) => a + b, 0) / 7).toLocaleString()} a day</div>`,
            icon: SF.sparkles, iconBg: '#ff9f0a', onClick: () => nav.push(healthMetricView('steps')),
          },
          {
            labelHTML: `<div>Sleep is fairly consistent</div><div class="sub">${healthValue('sleep').toFixed(1)} hr last night</div>`,
            icon: SF.moon, iconBg: '#5e5ce6', onClick: () => nav.push(healthMetricView('sleep')),
          },
        ],
      });

      group(body, {
        header: 'Medications',
        rows: state.medications.map(medication => ({
          label: medication.name,
          sub: `${medication.dose} · ${medication.when}`,
          rightHTML: medication.taken
            ? '<span style="color:var(--sysgreen);font-size:13px">Taken</span>'
            : '<span style="color:var(--sysblue);font-size:13px">Log</span>',
          chevron: false,
          onClick: () => {
            medication.taken = !medication.taken;
            save();
            nav.refresh();
            if (medication.taken) island(SF.sparkles, '#30d158', 'Health', `${medication.name} logged`);
          },
        })).concat([{
          label: 'Add Medication',
          icon: SF.plusCircle,
          iconBg: '#30d158',
          onClick: () => {
            state.medications.push({ id: Date.now(), name: 'New Medication', dose: '—', when: 'Morning', taken: false });
            save();
            nav.refresh();
          },
        }]),
      });

      group(body, {
        rows: [
          { label: 'Medical ID', icon: SF.sos, iconBg: '#ff453a', onClick: () => nav.push(medicalIDView()) },
          { label: 'Health Records', icon: SF.archive, iconBg: '#40c8e0', onClick: () => toast('No connected providers') },
          { label: 'Browse All Health Data', icon: SF.grid, iconBg: '#8e8e93', onClick: () => nav.push(healthBrowseView()) },
        ],
      });
      body.appendChild(h(`<div class="grp-f">All figures in this simulator are generated on device for
        troubleshooting practice. Nothing is measured and nothing leaves the browser.</div>`));
    },
  };
}

function healthBrowseView() {
  return {
    title: 'Browse',
    largeTitle: true,
    build(body, nav) {
      let query = '';
      const results = el('div');
      body.appendChild(searchField('Search health categories', value => { query = value; render(); }));
      body.appendChild(results);
      const CATEGORIES = [
        ['Activity', '#ff9f0a', ['steps', 'distance', 'flights', 'energy', 'exercise', 'stand']],
        ['Body Measurements', '#bf5af2', ['weight']],
        ['Heart', '#ff375f', ['heart', 'resting']],
        ['Hearing', '#ffd60a', ['noise']],
        ['Nutrition', '#30d158', ['water']],
        ['Respiratory', '#40c8e0', ['oxygen']],
        ['Sleep', '#5e5ce6', ['sleep']],
        ['Other Data', '#8e8e93', ['screen']],
      ];
      function render() {
        results.innerHTML = '';
        const needle = query.trim().toLowerCase();
        if (needle) {
          const hits = HEALTH_METRICS.filter(m => m.name.toLowerCase().includes(needle));
          if (!hits.length) { results.appendChild(emptyState(SF.magnifier, 'No Results', 'Try “steps” or “heart”.')); return; }
          group(results, { rows: hits.map(metric => ({
            label: metric.name,
            value: healthFormat(metric.id, healthValue(metric.id)),
            onClick: () => nav.push(healthMetricView(metric.id)),
          })) });
          return;
        }
        group(results, {
          header: 'Health Categories',
          rows: CATEGORIES.map(([name, colour, ids]) => ({
            label: name,
            icon: SF.star,
            iconBg: colour,
            onClick: () => nav.push({
              title: name,
              shortTitle: 'Browse',
              build(inner, innerNav) {
                group(inner, { rows: ids.map(id => ({
                  label: healthMetric(id).name,
                  value: healthFormat(id, healthValue(id)),
                  onClick: () => innerNav.push(healthMetricView(id)),
                })) });
              },
            }),
          })),
        });
      }
      render();
    },
  };
}

function healthMetricView(id) {
  const metric = healthMetric(id);
  return {
    title: metric.name,
    shortTitle: 'Health',
    build(body, nav, view) {
      const ranges = ['D', 'W', 'M', '6M', 'Y'];
      view.range = view.range || 'W';
      const wrap = el('div');
      wrap.style.padding = '0 16px';
      const seg = segmented(ranges, view.range, choice => { view.range = choice; nav.refresh(); });
      wrap.appendChild(seg);
      body.appendChild(wrap);

      const days = { D: 1, W: 7, M: 30, '6M': 26, Y: 12 }[view.range];
      const stride = view.range === '6M' ? 7 : view.range === 'Y' ? 30 : 1;
      const values = Array.from({ length: days }, (_, index) => healthValue(id, (days - 1 - index) * stride));
      const labels = view.range === 'W'
        ? values.map((_, index) => shortDay(new Date(Date.now() - (6 - index) * 864e5))[0])
        : view.range === 'D' ? ['Today'] : [];

      card(body, box => {
        const total = values.reduce((a, b) => a + b, 0);
        const average = total / values.length;
        box.appendChild(h(`<div style="color:var(--txt2);font-size:13px">
          ${['steps', 'distance', 'flights', 'energy', 'exercise', 'water'].includes(id) && view.range !== 'D' ? 'DAILY AVERAGE' : 'AVERAGE'}</div>
          <div style="font-size:30px;font-weight:600;color:${metric.colour};margin:2px 0 6px">${esc(healthFormat(id, average))}</div>
          <div style="color:var(--txt3);font-size:12px">${esc(view.range === 'D' ? 'Today' : `Last ${days} ${stride > 1 ? (stride === 7 ? 'weeks' : 'months') : 'days'}`)}</div>`));
        box.appendChild(barsSVG(values, { labels, colour: metric.colour, height: 150 }));
      });

      const sorted = [...values].sort((a, b) => a - b);
      group(body, {
        header: 'Range',
        rows: [
          { label: 'Minimum', value: healthFormat(id, sorted[0]) },
          { label: 'Maximum', value: healthFormat(id, sorted[sorted.length - 1]) },
          { label: 'Latest', value: healthFormat(id, values[values.length - 1]) },
          ...(['steps', 'energy', 'exercise', 'water', 'distance', 'flights'].includes(id)
            ? [{ label: 'Total', value: healthFormat(id, values.reduce((a, b) => a + b, 0)) }]
            : []),
        ],
      });

      const state = HL();
      group(body, {
        rows: [{
          label: state.favourites.includes(id) ? 'Remove from Favourites' : 'Add to Favourites',
          cls: 'center',
          chevron: false,
          onClick: () => {
            state.favourites = state.favourites.includes(id)
              ? state.favourites.filter(f => f !== id)
              : [...state.favourites, id];
            save();
            nav.refresh();
          },
        }],
      });
      body.appendChild(h(`<div class="grp-f">Data source: Simulated iPhone. ${esc(metric.name)} is generated
        deterministically from today’s date, so the same day always reads the same way.</div>`));
    },
  };
}

function healthProfileView() {
  return {
    title: 'Health Details',
    shortTitle: 'Summary',
    build(body, nav) {
      const state = HL();
      const profile = state.profile;
      body.appendChild(h(`<div style="text-align:center;padding:10px 0 6px">
        <div class="avatar" style="background:#ff2d55;width:74px;height:74px;font-size:30px;margin:0 auto 8px">A</div>
        <div style="font-size:21px;font-weight:600">${esc(profile.name)}</div>
        <div style="color:var(--txt2);font-size:14px">Health data from this iPhone</div></div>`));
      const editable = [['name', 'Name'], ['dob', 'Date of Birth'], ['sex', 'Sex'], ['height', 'Height'], ['blood', 'Blood Type']];
      group(body, {
        header: 'Details',
        rows: editable.map(([key, label]) => ({
          label,
          value: profile[key],
          onClick: () => sheet(box => {
            box.appendChild(h(`<div style="font-size:20px;font-weight:700;margin-bottom:10px">${esc(label)}</div>`));
            const field = el('div', 'compose-field');
            const input = el('input');
            input.value = profile[key];
            field.appendChild(input);
            box.appendChild(field);
            box.appendChild(primaryButton('Save', () => {
              profile[key] = input.value.trim() || profile[key];
              save();
              closeOverlay();
              nav.refresh();
            }));
            setTimeout(() => input.focus(), 320);
          }),
        })),
      });
      group(body, {
        rows: [
          { label: 'Medical ID', onClick: () => nav.push(medicalIDView()) },
          { label: 'Export All Health Data', onClick: () => toast('Export is simulated') },
          { label: 'Erase All Health Data', cls: 'destructive center', chevron: false, onClick: () => alertBox({
            title: 'Erase All Health Data?',
            message: 'Every generated sample in this simulator will be cleared.',
            buttons: [{ text: 'Cancel' }, { text: 'Erase', style: 'red', onClick: () => {
              delete State.health;
              save();
              nav.popToRoot();
              toast('Health data erased');
            } }],
          }) },
        ],
      });
    },
  };
}

function medicalIDView() {
  return {
    title: 'Medical ID',
    shortTitle: 'Health',
    build(body, nav) {
      const state = HL();
      const id = state.medicalID;
      body.appendChild(h(`<div style="margin:12px 16px;padding:14px;border-radius:14px;background:rgba(255,69,58,.14);
        border:.5px solid rgba(255,69,58,.4);font-size:13px;line-height:1.5;color:var(--txt2)">
        Medical ID can be shown from the lock screen during an emergency call, even while the phone is locked.</div>`));
      const fields = [['conditions', 'Medical Conditions'], ['allergies', 'Allergies & Reactions'], ['contact', 'Emergency Contact']];
      group(body, {
        rows: fields.map(([key, label]) => ({
          labelHTML: `<div>${esc(label)}</div><div class="sub">${esc(id[key] || 'None')}</div>`,
          onClick: () => sheet(box => {
            box.appendChild(h(`<div style="font-size:20px;font-weight:700;margin-bottom:10px">${esc(label)}</div>`));
            const field = el('div', 'compose-field');
            const input = el('input');
            input.value = id[key] || '';
            field.appendChild(input);
            box.appendChild(field);
            box.appendChild(primaryButton('Save', () => { id[key] = input.value.trim(); save(); closeOverlay(); nav.refresh(); }));
            setTimeout(() => input.focus(), 320);
          }),
        })),
      });
      group(body, {
        rows: [
          { label: 'Organ Donor', toggle: () => id.organDonor, onToggle: value => { id.organDonor = value; save(); } },
          { label: 'Show When Locked', toggle: () => id.whenLocked !== false, onToggle: value => { id.whenLocked = value; save(); } },
        ],
        footer: 'Emergency responders can view this even when the iPhone is locked.',
      });
    },
  };
}

/* ============================================================== FITNESS === */

function fitnessGoals() {
  const state = slice('fitness', () => ({ move: 520, exercise: 30, stand: 12, workouts: [], streak: 4 }));
  return state;
}

const WORKOUT_TYPES = [
  ['Outdoor Walk', '#a3e635', 4.1],
  ['Outdoor Run', '#ff9f0a', 11.6],
  ['Indoor Cycle', '#5ac8fa', 9.4],
  ['Strength Training', '#bf5af2', 7.2],
  ['Yoga', '#ff6482', 3.4],
  ['HIIT', '#ff453a', 12.8],
  ['Pool Swim', '#40c8e0', 9.9],
  ['Hiking', '#30d158', 6.6],
];

/** A week of workouts, generated once and then persisted so edits stick. */
function fitnessWorkouts() {
  const state = fitnessGoals();
  if (!state.workouts.length) {
    const random = rng(`workouts:${Math.floor(Date.now() / 864e5)}`);
    state.workouts = Array.from({ length: 6 }, (_, index) => {
      const [name, colour, rate] = WORKOUT_TYPES[Math.floor(random() * WORKOUT_TYPES.length)];
      const minutes = Math.round(18 + random() * 44);
      return {
        id: index + 1,
        name,
        colour,
        minutes,
        at: Date.now() - (index * 1.4 + random()) * 864e5,
        calories: Math.round(minutes * rate),
        heart: Math.round(112 + random() * 42),
        distance: /Walk|Run|Cycle|Hik|Swim/.test(name) ? +(minutes * (rate / 90)).toFixed(2) : null,
      };
    });
    save();
  }
  return state.workouts.slice().sort((a, b) => b.at - a.at);
}

defineApp({
  id: 'fitness',
  name: 'Fitness',
  bg: '#0a0a0c',
  darkStatus: true,
  glyph: `<div style="display:grid;place-items:center;height:100%">
    <svg viewBox="0 0 34 34" style="width:30px;height:30px;transform:rotate(-90deg)">
      <circle cx="17" cy="17" r="14" fill="none" stroke="#ff375f" stroke-width="4" stroke-linecap="round" stroke-dasharray="66 88"/>
      <circle cx="17" cy="17" r="9.5" fill="none" stroke="#a3e635" stroke-width="4" stroke-linecap="round" stroke-dasharray="42 60"/>
      <circle cx="17" cy="17" r="5" fill="none" stroke="#40c8e0" stroke-width="4" stroke-linecap="round" stroke-dasharray="24 31"/></svg></div>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(fitnessSummaryView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function fitnessSummaryView() {
  return {
    title: 'Summary',
    largeTitle: true,
    right: [{ html: SF.sliders, onClick: nav => nav.push(fitnessGoalsView()) }],
    build(body, nav) {
      const goals = fitnessGoals();
      const move = healthValue('energy');
      const exercise = healthValue('exercise');
      const stand = healthValue('stand');

      card(body, box => {
        box.style.padding = '18px 16px';
        box.appendChild(h(`<div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-size:19px;font-weight:600">Activity</div>
          <div style="color:var(--txt3);font-size:13px">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</div></div>`));
        const rings = el('div');
        rings.style.cssText = 'display:flex;align-items:center;gap:20px;margin-top:16px';
        rings.innerHTML = `<div style="position:relative;width:128px;height:128px;flex:none">
            <div style="position:absolute;inset:0">${ringSVG(move / goals.move, '#ff375f', { size: 128, width: 14 })}</div>
            <div style="position:absolute;inset:19px">${ringSVG(exercise / goals.exercise, '#a3e635', { size: 90, width: 14 })}</div>
            <div style="position:absolute;inset:38px">${ringSVG(stand / goals.stand, '#40c8e0', { size: 52, width: 14 })}</div></div>
          <div style="flex:1;min-width:0">
            ${[['Move', move, goals.move, 'CAL', '#ff375f'], ['Exercise', exercise, goals.exercise, 'MIN', '#a3e635'], ['Stand', stand, goals.stand, 'HRS', '#40c8e0']]
    .map(([label, value, goal, unit, colour]) => `<div style="margin-bottom:12px">
              <div style="font-size:11px;letter-spacing:.5px;color:${colour};font-weight:700">${label.toUpperCase()}</div>
              <div style="font-size:19px;font-weight:600">${Math.round(value)}<span style="color:var(--txt3);font-size:14px">/${goal}${unit}</span></div></div>`).join('')}
          </div>`;
        box.appendChild(rings);
        const complete = move >= goals.move && exercise >= goals.exercise && stand >= goals.stand;
        box.appendChild(h(`<div style="margin-top:4px;font-size:13px;color:${complete ? 'var(--sysgreen)' : 'var(--txt2)'}">
          ${complete ? 'All three rings closed. Nice work.' : `Move ${Math.max(0, Math.round(goals.move - move))} more calories to close your Move ring.`}
          · ${goals.streak}-day streak</div>`));
      });

      /* Weekly steps and distance */
      card(body, box => {
        box.appendChild(h('<div style="font-size:15px;font-weight:600">Steps</div>'));
        box.appendChild(barsSVG(healthWeek('steps'), {
          labels: Array.from({ length: 7 }, (_, index) => shortDay(new Date(Date.now() - (6 - index) * 864e5))[0]),
          colour: '#ff9f0a',
          height: 110,
        }));
        box.appendChild(h(`<div style="color:var(--txt2);font-size:13px">Average
          <b style="color:var(--txt)">${Math.round(healthWeek('steps').reduce((a, b) => a + b, 0) / 7).toLocaleString()}</b> steps a day</div>`));
      });

      body.appendChild(cardHeader('Workouts', 'Start'));
      const start = el('div');
      start.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding:0 16px 4px;scrollbar-width:none';
      WORKOUT_TYPES.forEach(([name, colour]) => {
        const chip = el('button', '', esc(name));
        chip.style.cssText = `flex:none;background:${colour};color:#0a0a0c;font-weight:600;border-radius:16px;
          padding:9px 14px;font-size:13px`;
        chip.onclick = () => startWorkoutSheet(name, colour, nav);
        start.appendChild(chip);
      });
      body.appendChild(start);

      const workouts = fitnessWorkouts();
      group(body, {
        header: 'Recent',
        rows: workouts.slice(0, 6).map(workout => ({
          labelHTML: `<div>${esc(workout.name)}</div>
            <div class="sub">${esc(relativeDay(workout.at))} · ${workout.minutes} min · ${workout.calories} cal</div>`,
          icon: SF.star,
          iconBg: workout.colour,
          onClick: () => nav.push(workoutDetailView(workout)),
        })),
      });

      group(body, {
        rows: [
          { label: 'Awards', icon: SF.star, iconBg: '#ffd60a', onClick: () => nav.push(fitnessAwardsView()) },
          { label: 'Sharing', icon: SF.person, iconBg: '#0a84ff', onClick: () => toast('Sharing needs a second device') },
          { label: 'Change Goals', icon: SF.sliders, iconBg: '#8e8e93', onClick: () => nav.push(fitnessGoalsView()) },
        ],
      });
    },
  };
}

function startWorkoutSheet(name, colour, nav) {
  sheet(box => {
    box.appendChild(h(`<div style="font-size:22px;font-weight:700">${esc(name)}</div>
      <div style="color:var(--txt2);font-size:14px;margin-bottom:12px">Open Goal</div>`));
    let seconds = 0;
    let running = true;
    const readout = el('div');
    readout.style.cssText = `font-size:52px;font-weight:200;font-variant-numeric:tabular-nums;text-align:center;
      color:${colour};padding:10px 0`;
    const stats = el('div');
    stats.style.cssText = 'display:flex;justify-content:space-around;color:var(--txt2);font-size:14px;padding-bottom:14px';
    box.append(readout, stats);

    const rate = (WORKOUT_TYPES.find(w => w[0] === name) || [, , 6])[2];
    const tick = () => {
      readout.textContent = clockDuration(seconds);
      stats.innerHTML = `<div><b style="color:var(--txt)">${Math.round(seconds / 60 * rate)}</b> CAL</div>
        <div><b style="color:var(--txt)">${Math.round(116 + Math.sin(seconds / 9) * 14)}</b> BPM</div>
        <div><b style="color:var(--txt)">${(seconds / 60 * (rate / 90)).toFixed(2)}</b> MI</div>`;
    };
    tick();
    const timer = setInterval(() => {
      if (!box.isConnected) { clearInterval(timer); return; }
      if (running) { seconds += 1; tick(); }
    }, 1000);

    const buttons = el('div');
    buttons.style.cssText = 'display:flex;gap:10px';
    const pause = el('button', 'btn-primary', 'Pause');
    pause.style.background = '#ffd60a';
    pause.style.color = '#000';
    pause.onclick = () => { running = !running; pause.textContent = running ? 'Pause' : 'Resume'; };
    const end = el('button', 'btn-primary', 'End Workout');
    end.style.background = 'var(--sysred)';
    end.onclick = () => {
      clearInterval(timer);
      if (seconds < 5) { closeOverlay(); toast('Workout discarded — too short'); return; }
      const minutes = Math.max(1, Math.round(seconds / 60));
      fitnessGoals().workouts.push({
        id: Date.now(),
        name,
        colour,
        minutes,
        at: Date.now(),
        calories: Math.round(minutes * rate),
        heart: Math.round(116 + Math.random() * 20),
        distance: /Walk|Run|Cycle|Hik|Swim/.test(name) ? +(minutes * (rate / 90)).toFixed(2) : null,
      });
      save();
      closeOverlay();
      nav.refresh();
      island(SF.star, colour, 'Fitness', `${name} saved · ${minutes} min`);
    };
    buttons.append(pause, end);
    box.appendChild(buttons);
  });
}

function workoutDetailView(workout) {
  return {
    title: workout.name,
    shortTitle: 'Summary',
    build(body, nav) {
      body.appendChild(h(`<div style="padding:6px 20px 12px">
        <div style="font-size:13px;color:var(--txt3)">${esc(new Date(workout.at).toLocaleString())}</div>
        <div style="font-size:44px;font-weight:200;color:${workout.colour};margin-top:6px">${esc(clockDuration(workout.minutes * 60))}</div>
        <div style="color:var(--txt2);font-size:14px">Total time</div></div>`));
      const tiles = [
        ['Active Calories', `${workout.calories} cal`],
        ['Avg. Heart Rate', `${workout.heart} BPM`],
        ...(workout.distance != null ? [['Distance', `${workout.distance} mi`]] : []),
        ['Avg. Pace', workout.distance ? `${clockDuration((workout.minutes * 60) / workout.distance)} /mi` : '—'],
        ['Elevation Gain', `${Math.round(rng(`${workout.id}:elev`)() * 220)} ft`],
        ['Effort', ['Easy', 'Moderate', 'Hard', 'All Out'][Math.min(3, Math.floor(workout.heart / 45) - 1)] || 'Moderate'],
      ];
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px';
      tiles.forEach(([label, value]) => {
        grid.appendChild(h(`<div style="background:var(--group);border-radius:14px;padding:14px">
          <div style="color:var(--txt2);font-size:12px">${esc(label)}</div>
          <div style="font-size:20px;font-weight:600;margin-top:3px">${esc(value)}</div></div>`));
      });
      body.appendChild(grid);

      card(body, box => {
        box.appendChild(h('<div style="font-size:14px;font-weight:600;margin-bottom:4px">Heart Rate</div>'));
        const random = rng(`${workout.id}:hr`);
        box.appendChild(h(lineSVG(Array.from({ length: 28 }, () => workout.heart + (random() - 0.5) * 34),
          { colour: '#ff375f', w: 300, h: 90 })));
      });

      group(body, {
        rows: [{ label: 'Delete Workout', cls: 'destructive center', chevron: false, onClick: () => {
          fitnessGoals().workouts = fitnessGoals().workouts.filter(w => w.id !== workout.id);
          save();
          nav.pop();
          toast('Workout deleted');
        } }],
      });
    },
  };
}

function fitnessGoalsView() {
  return {
    title: 'Change Goals',
    shortTitle: 'Summary',
    build(body, nav) {
      const goals = fitnessGoals();
      [['move', 'Move', 'calories', 40], ['exercise', 'Exercise', 'minutes', 5], ['stand', 'Stand', 'hours', 1]].forEach(([key, label, unit, step]) => {
        card(body, box => {
          box.appendChild(h(`<div style="font-size:16px;font-weight:600">${esc(label)} Goal</div>
            <div style="color:var(--txt2);font-size:13px">Daily ${esc(unit)}</div>`));
          const row = el('div');
          row.style.cssText = 'display:flex;align-items:center;gap:16px;margin-top:10px';
          const value = el('div', '', String(goals[key]));
          value.style.cssText = 'flex:1;text-align:center;font-size:34px;font-weight:300';
          const bump = (delta, text) => {
            const button = el('button', '', text);
            button.style.cssText = `width:46px;height:46px;border-radius:50%;background:var(--bg3);color:var(--sysblue);font-size:24px`;
            button.onclick = () => {
              goals[key] = Math.max(step, goals[key] + delta);
              value.textContent = String(goals[key]);
              save();
            };
            return button;
          };
          row.append(bump(-step, '−'), value, bump(step, '+'));
          box.appendChild(row);
        });
      });
      group(body, {
        rows: [{ label: 'Reset to Defaults', cls: 'center', chevron: false, onClick: () => {
          Object.assign(fitnessGoals(), { move: 520, exercise: 30, stand: 12 });
          save();
          nav.refresh();
        } }],
      });
    },
  };
}

function fitnessAwardsView() {
  const AWARDS = [
    ['Perfect Week', 'Close all three rings every day for a week', true],
    ['Longest Move Streak', `${fitnessGoals().streak} days`, true],
    ['New Move Record', '742 calories on a Saturday', true],
    ['Workout November', 'Record 20 workouts in a month', false],
    ['Ring in the New Year', 'Close every ring on 1 January', false],
  ];
  return {
    title: 'Awards',
    shortTitle: 'Summary',
    build(body) {
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:8px 16px';
      AWARDS.forEach(([name, detail, earned], index) => {
        const tile = h(`<div style="text-align:center;padding:14px 10px;background:var(--group);border-radius:16px;
          opacity:${earned ? 1 : 0.45}">
          <div style="width:64px;height:64px;margin:0 auto 10px;border-radius:50%;
            background:${earned ? `conic-gradient(from ${index * 60}deg,#ff375f,#ff9f0a,#a3e635,#40c8e0,#ff375f)` : 'var(--bg3)'};
            display:grid;place-items:center;color:#fff">${SF.star}</div>
          <div style="font-size:14px;font-weight:600;line-height:1.25">${esc(name)}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:4px;line-height:1.35">${esc(detail)}</div></div>`);
        tile.onclick = () => toast(earned ? `Earned: ${name}` : `Not earned yet: ${name}`);
        grid.appendChild(tile);
      });
      body.appendChild(grid);
    },
  };
}

/* ================================================================= HOME === */

const HOME_KINDS = {
  light: { name: 'Light', colour: '#ffd60a', glyph: SF.sun, dimmable: true },
  lock: { name: 'Lock', colour: '#0a84ff', glyph: SF.lock },
  thermostat: { name: 'Thermostat', colour: '#ff9f0a', glyph: SF.sun, temp: true },
  camera: { name: 'Camera', colour: '#5e5ce6', glyph: SF.camera },
  speaker: { name: 'Speaker', colour: '#bf5af2', glyph: SF.speaker, dimmable: true },
  outlet: { name: 'Outlet', colour: '#30d158', glyph: SF.gear },
  sensor: { name: 'Sensor', colour: '#40c8e0', glyph: SF.antenna, readonly: true },
  fan: { name: 'Fan', colour: '#64d2ff', glyph: SF.gear, dimmable: true },
};

function HM() {
  return slice('home', () => ({
    name: 'Rivera Home',
    rooms: ['Living Room', 'Kitchen', 'Bedroom', 'Office', 'Garage'],
    devices: [
      { id: 1, name: 'Ceiling Light', kind: 'light', room: 'Living Room', on: true, level: 74 },
      { id: 2, name: 'Floor Lamp', kind: 'light', room: 'Living Room', on: false, level: 40 },
      { id: 3, name: 'TV Outlet', kind: 'outlet', room: 'Living Room', on: true },
      { id: 4, name: 'Sonos One', kind: 'speaker', room: 'Living Room', on: false, level: 30 },
      { id: 5, name: 'Under-Cabinet', kind: 'light', room: 'Kitchen', on: true, level: 55 },
      { id: 6, name: 'Coffee Maker', kind: 'outlet', room: 'Kitchen', on: false },
      { id: 7, name: 'Bedside Lamp', kind: 'light', room: 'Bedroom', on: false, level: 22 },
      { id: 8, name: 'Ceiling Fan', kind: 'fan', room: 'Bedroom', on: true, level: 60 },
      { id: 9, name: 'Thermostat', kind: 'thermostat', room: 'Bedroom', on: true, target: 72, current: 74 },
      { id: 10, name: 'Desk Light', kind: 'light', room: 'Office', on: true, level: 90 },
      { id: 11, name: 'Front Door', kind: 'lock', room: 'Garage', on: true },
      { id: 12, name: 'Driveway Cam', kind: 'camera', room: 'Garage', on: true },
      { id: 13, name: 'Garage Sensor', kind: 'sensor', room: 'Garage', on: true },
    ],
    scenes: [
      { id: 's1', name: 'Good Morning', devices: [1, 5, 6], on: true },
      { id: 's2', name: 'Movie Night', devices: [1, 2, 3], on: false },
      { id: 's3', name: 'Good Night', devices: [7, 8, 11], on: false },
      { id: 's4', name: 'Leaving Home', devices: [11], on: false },
    ],
  }));
}

const homeDevice = id => HM().devices.find(d => d.id === id);

function homeSummary() {
  const devices = HM().devices;
  const lightsOn = devices.filter(d => d.kind === 'light' && d.on).length;
  const locked = devices.filter(d => d.kind === 'lock').every(d => d.on);
  const thermostat = devices.find(d => d.kind === 'thermostat');
  return [
    lightsOn ? `${lightsOn} light${lightsOn === 1 ? '' : 's'} on` : 'All lights off',
    locked ? 'Doors locked' : 'A door is unlocked',
    thermostat ? `Climate ${thermostat.current}°` : null,
  ].filter(Boolean);
}

defineApp({
  id: 'home',
  name: 'Home',
  bg: 'linear-gradient(180deg,#ff9f0a,#ff6482)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">
    ${sf('<path d="M3.5 11L12 3.8 20.5 11"/><path d="M5.6 12.6V20h12.8v-7.4"/><path d="M10 20v-5h4v5"/>', { size: 32, w: 1.9 })}</div>`,
  mount(win, inst) {
    HM();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(homeRootView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function homeRootView() {
  return {
    title: 'Home',
    largeTitle: true,
    right: [{ html: SF.plusCircle, onClick: nav => actionSheet('Add', [
      { text: 'Add Accessory', onClick: () => addDeviceSheet(nav) },
      { text: 'Add Scene', onClick: () => addSceneSheet(nav) },
      { text: 'Add Room', onClick: () => sheet(box => {
        box.appendChild(h('<div style="font-size:20px;font-weight:700;margin-bottom:10px">New Room</div>'));
        const field = el('div', 'compose-field');
        const input = el('input');
        input.placeholder = 'Room name';
        field.appendChild(input);
        box.appendChild(field);
        box.appendChild(primaryButton('Add', () => {
          if (!input.value.trim()) { toast('Enter a name'); return; }
          HM().rooms.push(input.value.trim());
          save();
          closeOverlay();
          nav.refresh();
        }));
        setTimeout(() => input.focus(), 320);
      }) },
    ]) }],
    build(body, nav) {
      const state = HM();
      body.appendChild(h(`<div style="padding:0 20px 12px;color:var(--txt2);font-size:14px;line-height:1.5">
        ${esc(state.name)}<br>${esc(homeSummary().join(' · '))}</div>`));

      /* Cameras strip */
      const cameras = state.devices.filter(d => d.kind === 'camera');
      if (cameras.length) {
        body.appendChild(cardHeader('Cameras'));
        const strip = el('div', 'hscroll');
        cameras.forEach(camera => {
          const tile = el('div', 'hcard');
          tile.style.minWidth = '236px';
          tile.innerHTML = `<div style="height:132px;border-radius:14px;overflow:hidden;position:relative;
              background-image:url('${artURI(`cam:${camera.id}`, { w: 320, h: 180, kind: 'photo' })}');background-size:cover">
              <div style="position:absolute;inset:auto 0 0;padding:8px 10px;background:linear-gradient(transparent,rgba(0,0,0,.7));
                color:#fff;font-size:13px;font-weight:600">${esc(camera.name)}
                <span style="opacity:.7;font-weight:400"> · ${esc(camera.on ? 'Live' : 'Off')}</span></div>
              ${camera.on ? '<div style="position:absolute;top:8px;left:10px;width:8px;height:8px;border-radius:50%;background:#ff453a"></div>' : ''}</div>`;
          tile.onclick = () => nav.push(homeDeviceView(camera));
          strip.appendChild(tile);
        });
        body.appendChild(strip);
      }

      /* Scenes */
      body.appendChild(cardHeader('Scenes'));
      const scenes = el('div');
      scenes.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px';
      state.scenes.forEach(scene => {
        const tile = el('button');
        tile.style.cssText = `text-align:left;padding:12px 14px;border-radius:16px;color:var(--txt);
          background:${scene.on ? 'linear-gradient(135deg,#ff9f0a,#ff6482)' : 'var(--group)'};
          ${scene.on ? 'color:#fff' : ''}`;
        tile.innerHTML = `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;
            background:${scene.on ? 'rgba(255,255,255,.28)' : 'var(--bg3)'};margin-bottom:8px">${SF.sparkles}</div>
          <div style="font-size:15px;font-weight:600">${esc(scene.name)}</div>
          <div style="font-size:12px;opacity:.75">${scene.devices.length} accessor${scene.devices.length === 1 ? 'y' : 'ies'}</div>`;
        tile.onclick = () => {
          scene.on = !scene.on;
          scene.devices.forEach(id => {
            const device = homeDevice(id);
            if (device && !HOME_KINDS[device.kind].readonly) device.on = scene.on;
          });
          save();
          nav.refresh();
          island(SF.sparkles, '#ff9f0a', 'Home', `${scene.name} ${scene.on ? 'on' : 'off'}`);
        };
        tile.oncontextmenu = event => {
          event.preventDefault();
          actionSheet(scene.name, [{ text: 'Delete Scene', style: 'red', onClick: () => {
            state.scenes = state.scenes.filter(s => s.id !== scene.id);
            save();
            nav.refresh();
          } }]);
        };
        scenes.appendChild(tile);
      });
      body.appendChild(scenes);

      /* Rooms */
      state.rooms.forEach(room => {
        const devices = state.devices.filter(d => d.room === room);
        if (!devices.length) return;
        body.appendChild(cardHeader(room, `${devices.filter(d => d.on).length}/${devices.length} on`));
        const grid = el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px';
        devices.forEach(device => grid.appendChild(homeTile(device, nav)));
        body.appendChild(grid);
      });
      body.appendChild(h('<div style="height:26px"></div>'));
    },
  };
}

function homeTile(device, nav) {
  const kind = HOME_KINDS[device.kind];
  const tile = el('div');
  const active = device.on;
  tile.style.cssText = `border-radius:16px;padding:12px 14px;cursor:pointer;position:relative;overflow:hidden;
    background:${active ? '#fff' : 'var(--group)'};color:${active ? '#000' : 'var(--txt)'}`;
  if (active && kind.dimmable) {
    // Fill shows the level, the way the real tiles do.
    tile.style.background = `linear-gradient(to top,${kind.colour} ${device.level || 50}%,#fff ${device.level || 50}%)`;
  }
  const detail = device.kind === 'thermostat'
    ? `${device.current}° → ${device.target}°`
    : device.kind === 'lock' ? (device.on ? 'Locked' : 'Unlocked')
      : device.kind === 'sensor' ? 'No motion'
        : device.on ? (kind.dimmable ? `On · ${device.level || 50}%` : 'On') : 'Off';
  tile.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px">
      <div style="display:grid;place-items:center;width:32px;height:32px;border-radius:50%;flex:none;
        background:${active ? 'rgba(0,0,0,.08)' : 'var(--bg3)'};color:${active ? kind.colour : 'var(--txt2)'}">${kind.glyph}</div></div>
    <div style="font-size:14px;font-weight:600;margin-top:8px;line-height:1.2">${esc(device.name)}</div>
    <div style="font-size:12px;opacity:.7">${esc(detail)}</div>`;
  tile.onclick = () => {
    if (kind.readonly) { nav.push(homeDeviceView(device)); return; }
    device.on = !device.on;
    save();
    nav.refresh();
  };
  tile.oncontextmenu = event => { event.preventDefault(); nav.push(homeDeviceView(device)); };
  const more = el('button', '', '⋯');
  more.style.cssText = `position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;
    background:${active ? 'rgba(0,0,0,.08)' : 'var(--bg3)'};color:${active ? '#000' : 'var(--txt2)'};font-size:15px;line-height:1`;
  more.onclick = event => { event.stopPropagation(); nav.push(homeDeviceView(device)); };
  tile.appendChild(more);
  return tile;
}

function homeDeviceView(device) {
  const kind = HOME_KINDS[device.kind];
  return {
    title: device.name,
    shortTitle: 'Home',
    build(body, nav) {
      if (device.kind === 'camera') {
        body.appendChild(h(`<div style="margin:0 16px 14px;border-radius:16px;overflow:hidden;aspect-ratio:16/9;
          background-image:url('${artURI(`cam:${device.id}`, { w: 640, h: 360, kind: 'photo' })}');background-size:cover"></div>`));
      }

      if (kind.temp) {
        card(body, box => {
          box.appendChild(h(`<div style="text-align:center">
            <div style="font-size:13px;color:var(--txt2)">CURRENTLY</div>
            <div style="font-size:56px;font-weight:200;color:#ff9f0a">${device.current}°</div>
            <div style="color:var(--txt2);font-size:14px">Target ${device.target}° · Heating</div></div>`));
          const row = el('div');
          row.style.cssText = 'display:flex;align-items:center;gap:14px;margin-top:12px';
          const bump = (delta, text) => {
            const button = el('button', '', text);
            button.style.cssText = 'flex:1;height:46px;border-radius:14px;background:var(--bg3);color:var(--txt);font-size:22px';
            button.onclick = () => { device.target = Math.max(50, Math.min(90, device.target + delta)); save(); nav.refresh(); };
            return button;
          };
          row.append(bump(-1, '−'), bump(1, '+'));
          box.appendChild(row);
        });
      }

      group(body, {
        rows: [
          ...(kind.readonly ? [{ label: 'Status', value: device.on ? 'No motion detected' : 'Offline' }]
            : [{
              label: device.kind === 'lock' ? 'Locked' : 'On',
              toggle: () => device.on,
              onToggle: value => { device.on = value; save(); },
            }]),
          ...(kind.dimmable ? [(() => {
            const row = el('div', 'row');
            row.style.flexDirection = 'column';
            row.style.alignItems = 'stretch';
            row.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:15px">
              <span>${device.kind === 'speaker' ? 'Volume' : device.kind === 'fan' ? 'Speed' : 'Brightness'}</span>
              <span style="color:var(--txt2)">${device.level || 50}%</span></div>`;
            const slider = el('input');
            slider.type = 'range';
            slider.min = '1';
            slider.max = '100';
            slider.value = String(device.level || 50);
            slider.style.cssText = 'width:100%;margin-top:10px;accent-color:' + kind.colour;
            slider.oninput = () => {
              device.level = +slider.value;
              device.on = true;
              row.querySelector('span:last-child').textContent = `${device.level}%`;
              save();
            };
            row.appendChild(slider);
            return row;
          })()] : []),
        ],
      });

      group(body, {
        header: 'Accessory',
        rows: [
          { label: 'Room', value: device.room, onClick: () => actionSheet('Move to Room', HM().rooms.map(room => ({
            text: room,
            onClick: () => { device.room = room; save(); nav.refresh(); },
          }))) },
          { label: 'Type', value: kind.name },
          { label: 'Firmware', value: `1.${device.id}.4` },
          { label: 'Serial Number', value: `HK${String(device.id).padStart(4, '0')}X` },
          { label: 'Include in Favourites', toggle: () => device.favourite !== false, onToggle: value => { device.favourite = value; save(); } },
        ],
      });

      group(body, {
        rows: [
          { label: 'Identify Accessory', cls: 'center', chevron: false, onClick: () => island(kind.glyph, kind.colour, 'Home', `${device.name} is blinking`) },
          { label: 'Remove Accessory', cls: 'destructive center', chevron: false, onClick: () => alertBox({
            title: `Remove “${device.name}”?`,
            message: 'It will be removed from this home and every scene.',
            buttons: [{ text: 'Cancel' }, { text: 'Remove', style: 'red', onClick: () => {
              const state = HM();
              state.devices = state.devices.filter(d => d.id !== device.id);
              state.scenes.forEach(scene => { scene.devices = scene.devices.filter(id => id !== device.id); });
              save();
              nav.pop();
            } }],
          }) },
        ],
      });
    },
  };
}

function addDeviceSheet(nav) {
  sheet(box => {
    box.appendChild(h('<div style="font-size:22px;font-weight:700;margin-bottom:8px">Add Accessory</div>'));
    const field = el('div', 'compose-field');
    const input = el('input');
    input.placeholder = 'Accessory name';
    field.appendChild(input);
    box.appendChild(field);
    let kind = 'light';
    let room = HM().rooms[0];
    const kindSeg = segmented(['light', 'outlet', 'lock', 'speaker', 'fan'], kind, choice => { kind = choice; });
    kindSeg.style.marginTop = '10px';
    box.appendChild(kindSeg);
    const roomSeg = segmented(HM().rooms.slice(0, 4), room, choice => { room = choice; });
    roomSeg.style.marginTop = '8px';
    box.appendChild(roomSeg);
    box.appendChild(primaryButton('Add to Home', () => {
      const name = input.value.trim();
      if (!name) { toast('Enter a name'); return; }
      HM().devices.push({ id: Date.now(), name, kind, room, on: false, level: 50 });
      save();
      closeOverlay();
      nav.refresh();
      island(HOME_KINDS[kind].glyph, HOME_KINDS[kind].colour, 'Home', `${name} added to ${room}`);
    }));
    setTimeout(() => input.focus(), 320);
  });
}

function addSceneSheet(nav) {
  sheet(box => {
    box.appendChild(h('<div style="font-size:22px;font-weight:700;margin-bottom:8px">New Scene</div>'));
    const field = el('div', 'compose-field');
    const input = el('input');
    input.placeholder = 'Scene name';
    field.appendChild(input);
    box.appendChild(field);
    const chosen = new Set();
    const list = el('div');
    list.style.cssText = 'max-height:38vh;overflow-y:auto;margin:8px -4px';
    HM().devices.filter(d => !HOME_KINDS[d.kind].readonly).forEach(device => {
      const row = makeRow({
        label: device.name,
        sub: device.room,
        chevron: false,
        onClick: row2 => {
          if (chosen.has(device.id)) { chosen.delete(device.id); row2.style.background = ''; }
          else { chosen.add(device.id); row2.style.background = 'color-mix(in srgb,var(--sysblue) 22%,transparent)'; }
        },
      });
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(primaryButton('Create Scene', () => {
      if (!input.value.trim() || !chosen.size) { toast('Name it and pick accessories'); return; }
      HM().scenes.push({ id: `s${Date.now()}`, name: input.value.trim(), devices: [...chosen], on: false });
      save();
      closeOverlay();
      nav.refresh();
    }));
    setTimeout(() => input.focus(), 320);
  });
}

/* ============================================================== FIND MY === */

function FM() {
  return slice('findmy', () => ({
    people: [
      { id: 'p1', name: 'Nina Okafor', where: 'Winter Park, FL', distance: '4.2 mi', at: Date.now() - 12 * 6e4, colour: '#bf5af2' },
      { id: 'p2', name: 'Dad', where: 'Kissimmee, FL', distance: '18 mi', at: Date.now() - 46 * 6e4, colour: '#0a84ff' },
    ],
    devices: [
      { id: 'd1', name: 'iPhone 17 Pro', model: 'This Device', where: 'Orlando, FL', battery: 0.86, at: Date.now(), colour: '#30d158' },
      { id: 'd2', name: 'MacBook Pro', model: '16-inch', where: 'Home · Orlando, FL', battery: 0.42, at: Date.now() - 8 * 6e4, colour: '#0a84ff' },
      { id: 'd3', name: 'AirPods Pro', model: '2nd generation', where: 'Home · Orlando, FL', battery: 0.61, at: Date.now() - 3 * 36e5, colour: '#8e8e93' },
      { id: 'd4', name: 'Apple Watch', model: 'Series 10', where: 'With you', battery: 0.73, at: Date.now(), colour: '#ff375f' },
    ],
    items: [
      { id: 'i1', name: 'Keys', where: 'Home · Orlando, FL', at: Date.now() - 26 * 6e4, colour: '#ff9f0a' },
      { id: 'i2', name: 'Backpack', where: 'Last seen at the office', at: Date.now() - 5 * 36e5, colour: '#30d158' },
    ],
  }));
}

defineApp({
  id: 'findmy',
  name: 'Find My',
  bg: 'linear-gradient(160deg,#5ac8fa,#0a63e8)',
  glyph: `<div style="display:grid;place-items:center;height:100%">
    <svg viewBox="0 0 32 32" style="width:28px;height:28px">
      <circle cx="16" cy="16" r="13" fill="none" stroke="#fff" stroke-width="2.2"/>
      <path d="M22 10l-4.4 11.6L16 17l-4.6-1.6z" fill="#fff"/></svg></div>`,
  mount(win, inst) {
    FM();
    const nav = new Nav(win);
    inst.nav = nav;
    inst.tab = inst.tab || 'People';
    const tabbar = el('div', 'tabbar');
    const setTab = name => {
      inst.tab = name;
      nav.setRoot(findMyListView(name));
      nav.top._page.appendChild(tabbar);
      paint();
    };
    const paint = () => {
      tabbar.innerHTML = '';
      [['People', SF.person], ['Devices', SF.grid], ['Items', SF.archive], ['Me', SF.compass]].forEach(([name, glyph]) => {
        const button = el('button', inst.tab === name ? 'on' : '', `${glyph}<span>${name}</span>`);
        button.onclick = () => setTab(name);
        tabbar.appendChild(button);
      });
    };
    setTab(inst.tab);
  },
  onShow(inst) { inst.nav.refresh(); },
});

function findMyListView(tab) {
  return {
    title: tab === 'Me' ? 'Me' : `${tab}`,
    largeTitle: true,
    build(body, nav) {
      const state = FM();

      /* A generated map, so the app has the same shape as the real one. */
      body.appendChild(h(`<div style="margin:0 16px 14px;border-radius:16px;overflow:hidden;height:180px;position:relative;
          background-image:url('${artURI(`findmy:${tab}`, { w: 400, h: 260, kind: 'map' })}');background-size:cover">
          <div style="position:absolute;left:46%;top:44%;width:16px;height:16px;border-radius:50%;background:#0a84ff;
            border:2.5px solid #fff;box-shadow:0 0 0 8px rgba(10,132,255,.25)"></div>
          <button id="fmOpen" style="position:absolute;right:10px;bottom:10px;background:rgba(0,0,0,.6);color:#fff;
            border-radius:14px;padding:7px 12px;font-size:12px">Open in Maps</button></div>`));
      const open = $('#fmOpen', body);
      if (open) open.onclick = () => openApp('maps');

      if (tab === 'Me') {
        group(body, {
          header: 'My Location',
          rows: [
            { label: 'Share My Location', toggle: () => state.sharing !== false, onToggle: value => { state.sharing = value; save(); } },
            { label: 'My Location', value: 'This Device' },
            { label: 'Address', value: 'Orlando, FL' },
          ],
          footer: 'Location is simulated. Nothing about this device is transmitted anywhere.',
        });
        group(body, {
          rows: [
            { label: 'Allow Friend Requests', toggle: () => state.requests !== false, onToggle: value => { state.requests = value; save(); } },
            { label: 'Receive Location Updates', toggle: () => state.updates !== false, onToggle: value => { state.updates = value; save(); } },
            { label: 'Edit Location Name', value: 'Home', onClick: () => toast('Editing is simulated') },
          ],
        });
        return;
      }

      const entries = tab === 'People' ? state.people : tab === 'Devices' ? state.devices : state.items;
      if (!entries.length) {
        body.appendChild(emptyState(SF.compass, `No ${tab}`, `Nothing is being tracked in ${tab}.`));
        return;
      }
      group(body, {
        rows: entries.map(entry => ({
          icon: tab === 'People' ? SF.person : tab === 'Items' ? SF.archive : SF.grid,
          iconBg: entry.colour,
          labelHTML: `<div>${esc(entry.name)}</div>
            <div class="sub">${esc(entry.where)}${entry.distance ? ` · ${esc(entry.distance)}` : ''} · ${esc(relativeDay(entry.at))} ${esc(timeStr(new Date(entry.at)))}</div>`,
          rightHTML: entry.battery != null
            ? `<span style="font-size:12px;color:${entry.battery < 0.2 ? 'var(--sysred)' : 'var(--txt2)'}">${Math.round(entry.battery * 100)}%</span>`
            : '',
          onClick: () => nav.push(findMyDetailView(entry, tab)),
        })),
      });
      if (tab !== 'People') {
        group(body, { rows: [{ label: `Add ${tab === 'Items' ? 'Item' : 'Device'}`, cls: 'center', chevron: false, onClick: () => toast('Pairing needs real hardware') }] });
      } else {
        group(body, { rows: [{ label: 'Share My Location', cls: 'center', chevron: false, onClick: () => toast('Sharing needs a second device') }] });
      }
    },
  };
}

function findMyDetailView(entry, tab) {
  return {
    title: entry.name,
    shortTitle: tab,
    build(body, nav) {
      body.appendChild(h(`<div style="margin:0 16px 14px;border-radius:16px;overflow:hidden;height:200px;position:relative;
        background-image:url('${artURI(`findmy:${entry.id}`, { w: 400, h: 280, kind: 'map' })}');background-size:cover">
        <div style="position:absolute;left:48%;top:46%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
          background:${entry.colour};border:3px solid #fff;display:grid;place-items:center;color:#fff;font-weight:700">
          ${esc(entry.name[0])}</div></div>`));
      group(body, {
        rows: [
          { label: 'Location', value: entry.where },
          { label: 'Updated', value: `${relativeDay(entry.at)} ${timeStr(new Date(entry.at))}` },
          ...(entry.battery != null ? [{ label: 'Battery', value: `${Math.round(entry.battery * 100)}%` }] : []),
          ...(entry.model ? [{ label: 'Model', value: entry.model }] : []),
        ],
      });
      group(body, {
        rows: [
          { label: 'Directions', icon: SF.map, iconBg: '#0a84ff', onClick: () => openApp('maps') },
          { label: 'Play Sound', icon: SF.speaker, iconBg: '#30d158', onClick: () => island(SF.speaker, '#30d158', 'Find My', `Playing a sound on ${entry.name}`) },
          { label: 'Notify When Found', toggle: () => Boolean(entry.notify), onToggle: value => { entry.notify = value; save(); } },
        ],
      });
      if (tab === 'Devices') {
        group(body, {
          rows: [
            { label: 'Mark As Lost', icon: SF.lock, iconBg: '#ff9f0a', onClick: () => alertBox({
              title: 'Mark As Lost?',
              message: `${entry.name} will lock and display a message.`,
              buttons: [{ text: 'Cancel' }, { text: 'Continue', onClick: () => { entry.lost = true; save(); nav.refresh(); toast('Marked as lost'); } }],
            }) },
            { label: 'Erase This Device', cls: 'destructive', onClick: () => alertBox({
              title: `Erase ${entry.name}?`,
              message: 'All content and settings will be erased. This is simulated.',
              buttons: [{ text: 'Cancel' }, { text: 'Erase', style: 'red', onClick: () => toast('Erase is simulated') }],
            }) },
          ],
        });
      }
      if (entry.lost) {
        body.appendChild(h(`<div class="grp-f" style="color:var(--sysorange)">${esc(entry.name)} is marked as lost.</div>`));
      }
    },
  };
}

/* ============================================================= FACETIME === */

function FT() {
  return slice('facetime', () => ({
    recents: [
      { id: 1, name: 'Nina Okafor', kind: 'video', outgoing: true, at: Date.now() - 40 * 6e4, missed: false },
      { id: 2, name: 'Dad', kind: 'audio', outgoing: false, at: Date.now() - 5 * 36e5, missed: true },
      { id: 3, name: 'Sablewave Support', kind: 'video', outgoing: false, at: Date.now() - 26 * 36e5, missed: false },
      { id: 4, name: 'Nina Okafor', kind: 'video', outgoing: false, at: Date.now() - 2 * 864e5, missed: false },
    ],
  }));
}

defineApp({
  id: 'facetime',
  name: 'FaceTime',
  bg: 'linear-gradient(180deg,#6ce67d,#17b02f)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">
    ${sf('<rect x="2.5" y="6" width="13.5" height="12" rx="3.2" fill="currentColor" stroke="none"/><path d="M17.6 12l3.9-3v9z" fill="currentColor" stroke="none"/>', { fill: true, size: 30 })}</div>`,
  mount(win, inst) {
    FT();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(faceTimeView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function faceTimeView() {
  return {
    title: 'FaceTime',
    largeTitle: true,
    build(body, nav) {
      const state = FT();
      const newCall = primaryButton('New FaceTime', () => faceTimeCompose(nav));
      body.appendChild(newCall);

      /* Recents, grouped the way the real app groups them. */
      if (!state.recents.length) {
        body.appendChild(emptyState(SF.phoneGlyph, 'No Recent Calls', 'Start one with the button above.'));
        return;
      }
      group(body, {
        rows: state.recents.map(entry => ({
          icon: entry.kind === 'video' ? SF.camera : SF.phoneGlyph,
          iconBg: entry.missed ? '#ff453a' : '#30d158',
          labelHTML: `<div style="${entry.missed ? 'color:var(--sysred)' : ''}">${esc(entry.name)}</div>
            <div class="sub">${entry.outgoing ? 'Outgoing' : entry.missed ? 'Missed' : 'Incoming'} ·
              ${esc(entry.kind === 'video' ? 'FaceTime Video' : 'FaceTime Audio')}</div>`,
          value: `${relativeDay(entry.at)} ${timeStr(new Date(entry.at))}`,
          onClick: () => actionSheet(entry.name, [
            { text: 'FaceTime Video', onClick: () => faceTimeCall(entry.name, 'video', nav) },
            { text: 'FaceTime Audio', onClick: () => faceTimeCall(entry.name, 'audio', nav) },
            { text: 'Call', onClick: () => { startOutgoingCall(entry.name, 'mobile'); } },
            { text: 'Remove from Recents', style: 'red', onClick: () => {
              state.recents = state.recents.filter(r => r.id !== entry.id);
              save();
              nav.refresh();
            } },
          ]),
        })),
      });
      group(body, {
        rows: [{ label: 'Clear Recents', cls: 'destructive center', chevron: false, onClick: () => { state.recents = []; save(); nav.refresh(); } }],
      });
      body.appendChild(h(`<div class="grp-f">FaceTime in this simulator plays out the call UI without a camera or a
        network, so the whole flow can be walked through for training.</div>`));
    },
  };
}

function faceTimeCompose(nav) {
  sheet(box => {
    box.appendChild(h('<div style="font-size:22px;font-weight:700;margin-bottom:8px">New FaceTime</div>'));
    const field = el('div', 'compose-field');
    field.appendChild(h('<div class="k">To:</div>'));
    const input = el('input');
    input.placeholder = 'Name, email or number';
    field.appendChild(input);
    box.appendChild(field);
    const suggestions = (typeof CON === 'function' ? CON().people.slice(0, 5) : []).map(person => ({
      label: personName(person),
      sub: person.phone || person.email || '',
      onClick: () => { input.value = personName(person); },
    }));
    if (suggestions.length) group(box, { header: 'Suggested', rows: suggestions });
    const buttons = el('div');
    buttons.style.cssText = 'display:flex;gap:10px;margin-top:12px';
    const audio = el('button', 'btn-primary', 'Audio');
    audio.style.background = 'var(--bg3)';
    audio.style.color = 'var(--txt)';
    audio.onclick = () => { if (!input.value.trim()) { toast('Enter a contact'); return; } closeOverlay(); faceTimeCall(input.value.trim(), 'audio', nav); };
    const video = el('button', 'btn-primary', 'FaceTime');
    video.onclick = () => { if (!input.value.trim()) { toast('Enter a contact'); return; } closeOverlay(); faceTimeCall(input.value.trim(), 'video', nav); };
    buttons.append(audio, video);
    box.appendChild(buttons);
    setTimeout(() => input.focus(), 320);
  });
}

/** Full-screen FaceTime call, rendered over the app window. */
function faceTimeCall(name, kind, nav) {
  const inst = openApps.get('facetime');
  if (!inst) return;
  FT().recents.unshift({ id: Date.now(), name, kind, outgoing: true, at: Date.now(), missed: false });
  FT().recents = FT().recents.slice(0, 20);
  save();

  const layer = el('div');
  layer.style.cssText = `position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;color:#fff;
    background:linear-gradient(160deg,#2c2c2e,#0a0a0c)`;
  const seed = `ft:${name}`;
  layer.innerHTML = `
    <div style="position:absolute;inset:0;background-image:url('${artURI(seed, { w: 400, h: 800, kind: 'album' })}');
      background-size:cover;opacity:${kind === 'video' ? 0.95 : 0.35}"></div>
    <div style="position:relative;padding:64px 22px 0;text-align:center">
      <div style="font-size:26px;font-weight:600">${esc(name)}</div>
      <div id="ftStatus" style="opacity:.75;font-size:15px;margin-top:4px">Connecting…</div></div>
    ${kind === 'video' ? `<div style="position:absolute;right:14px;top:120px;width:96px;height:132px;border-radius:14px;
      overflow:hidden;border:1px solid rgba(255,255,255,.3);
      background-image:url('${artURI('ft:self', { w: 200, h: 280, kind: 'album' })}');background-size:cover"></div>` : ''}
    <div style="flex:1"></div>
    <div id="ftControls" style="position:relative;padding:0 20px 34px"></div>`;
  inst.win.appendChild(layer);

  const status = $('#ftStatus', layer);
  const controls = $('#ftControls', layer);
  let seconds = 0;
  let connected = false;
  const flags = { mute: false, camera: kind === 'video', speaker: true };

  const paint = () => {
    controls.innerHTML = '';
    const grid = el('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px;justify-items:center';
    const pill = (label, glyph, active, onClick) => {
      const button = el('button', '', `${glyph}<div style="font-size:11px;margin-top:5px">${esc(label)}</div>`);
      button.style.cssText = `display:grid;place-items:center;width:66px;height:66px;border-radius:50%;
        background:${active ? '#fff' : 'rgba(255,255,255,.22)'};color:${active ? '#000' : '#fff'};backdrop-filter:blur(10px)`;
      button.onclick = onClick;
      return button;
    };
    grid.append(
      pill('Mute', SF.speaker, flags.mute, () => { flags.mute = !flags.mute; paint(); toast(flags.mute ? 'Muted' : 'Unmuted'); }),
      pill('Camera', SF.camera, flags.camera, () => { flags.camera = !flags.camera; paint(); }),
      pill('Flip', SF.history, false, () => toast('Camera flipped')),
      pill('Effects', SF.sparkles, false, () => toast('Effects are simulated')),
      pill('Speaker', SF.speaker, flags.speaker, () => { flags.speaker = !flags.speaker; paint(); }),
      pill('More', SF.grid, false, () => actionSheet('More', [
        { text: 'Add People', onClick: () => toast('Group FaceTime is simulated') },
        { text: 'Share Screen', onClick: () => toast('Screen sharing is simulated') },
        { text: 'SharePlay', onClick: () => toast('SharePlay is simulated') },
      ])),
    );
    controls.appendChild(grid);
    const end = el('button', '', SF.phoneGlyph);
    end.style.cssText = `display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:#ff453a;
      color:#fff;margin:22px auto 0;transform:rotate(135deg)`;
    end.onclick = () => { clearInterval(timer); layer.remove(); nav.refresh(); toast(`FaceTime ended · ${clockDuration(seconds)}`); };
    controls.appendChild(end);
  };
  paint();

  const timer = setInterval(() => {
    if (!layer.isConnected) { clearInterval(timer); return; }
    if (!connected) {
      connected = true;
      status.textContent = 'FaceTime';
      return;
    }
    seconds += 1;
    status.textContent = clockDuration(seconds);
  }, 1000);
}

/* ================================================================ BOOKS === */

const BOOK_LIST = [
  ['The Pragmatic Programmer', 'Andrew Hunt & David Thomas', 352, 'Technology'],
  ['Project Hail Mary', 'Andy Weir', 476, 'Science Fiction'],
  ['Educated', 'Tara Westover', 334, 'Memoir'],
  ['The Design of Everyday Things', 'Don Norman', 368, 'Design'],
  ['Piranesi', 'Susanna Clarke', 245, 'Fiction'],
  ['Thinking, Fast and Slow', 'Daniel Kahneman', 499, 'Psychology'],
  ['Klara and the Sun', 'Kazuo Ishiguro', 303, 'Fiction'],
  ['The Soul of a New Machine', 'Tracy Kidder', 293, 'Technology'],
  ['Braiding Sweetgrass', 'Robin Wall Kimmerer', 391, 'Nature'],
  ['Station Eleven', 'Emily St. John Mandel', 333, 'Fiction'],
];

function BK() {
  return slice('books', () => ({
    library: BOOK_LIST.slice(0, 6).map(([title, author, pages, genre], index) => ({
      id: index + 1, title, author, pages, genre,
      page: [64, 212, 0, 130, 0, 18][index],
      finished: false,
      at: Date.now() - index * 3 * 864e5,
    })),
    goal: 20,
    readToday: 12,
  }));
}

defineApp({
  id: 'books',
  name: 'Books',
  bg: 'linear-gradient(180deg,#ff9f0a,#ff6482)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">${sf('<path d="M4 5.2A2 2 0 016 3.4h5.2v17H6a2 2 0 00-2 1.8z"/><path d="M20 5.2a2 2 0 00-2-1.8h-5.2v17H18a2 2 0 012 1.8z"/>', { size: 32 })}</div>`,
  mount(win, inst) {
    BK();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(booksHomeView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function booksHomeView() {
  return {
    title: 'Home',
    largeTitle: true,
    right: [{ html: SF.magnifier, onClick: nav => nav.push(booksStoreView()) }],
    build(body, nav) {
      const state = BK();
      const reading = state.library.filter(book => book.page > 0 && !book.finished);

      card(body, box => {
        box.appendChild(h(`<div style="display:flex;justify-content:space-between;align-items:center">
          <div><div style="font-size:16px;font-weight:600">Reading Goal</div>
          <div style="color:var(--txt2);font-size:13px">${state.readToday} of ${state.goal} minutes today</div></div>
          <div style="width:60px;height:60px">${ringSVG(state.readToday / state.goal, '#ff9f0a', { size: 60, width: 8 })}</div></div>`));
        const add = el('button', '', 'Log 5 minutes');
        add.style.cssText = 'color:var(--sysblue);font-size:14px;margin-top:8px';
        add.onclick = () => {
          state.readToday += 5;
          save();
          nav.refresh();
          if (state.readToday >= state.goal) island(SF.book, '#ff9f0a', 'Books', 'Reading goal met');
        };
        box.appendChild(add);
      });

      if (reading.length) {
        body.appendChild(cardHeader('Current'));
        const strip = el('div', 'hscroll');
        reading.forEach(book => {
          const tile = el('div', 'hcard');
          tile.style.minWidth = '148px';
          tile.innerHTML = `
            <div style="height:210px;border-radius:8px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.4);
              background-image:url('${artURI(`book:${book.id}`, { w: 200, h: 300, kind: 'book' })}');background-size:cover;
              display:flex;align-items:flex-end;padding:10px;color:#fff;font-weight:700;font-size:14px;line-height:1.2">
              ${esc(book.title)}</div>
            <div style="margin-top:8px;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(book.title)}</div>
            <div style="font-size:12px;color:var(--txt2)">${Math.round((book.page / book.pages) * 100)}% · ${book.pages - book.page} pages left</div>`;
          tile.onclick = () => nav.push(bookReaderView(book));
          strip.appendChild(tile);
        });
        body.appendChild(strip);
      }

      group(body, {
        header: 'Library',
        rows: state.library.map(book => ({
          labelHTML: `<div>${esc(book.title)}</div><div class="sub">${esc(book.author)} · ${esc(book.genre)}</div>`,
          rightHTML: book.finished
            ? '<span style="color:var(--sysgreen);font-size:12px">Finished</span>'
            : book.page ? `<span style="color:var(--txt2);font-size:12px">${Math.round((book.page / book.pages) * 100)}%</span>` : '',
          onClick: () => nav.push(bookReaderView(book)),
        })),
      });
      group(body, { rows: [{ label: 'Browse the Book Store', icon: SF.magnifier, iconBg: '#ff6482', onClick: () => nav.push(booksStoreView()) }] });
    },
  };
}

function booksStoreView() {
  return {
    title: 'Book Store',
    shortTitle: 'Books',
    largeTitle: true,
    build(body, nav) {
      const state = BK();
      let query = '';
      const results = el('div');
      body.appendChild(searchField('All Books', value => { query = value; render(); }));
      body.appendChild(results);
      function render() {
        results.innerHTML = '';
        const needle = query.trim().toLowerCase();
        const hits = BOOK_LIST.filter(([title, author]) => !needle || `${title} ${author}`.toLowerCase().includes(needle));
        if (!hits.length) { results.appendChild(emptyState(SF.magnifier, 'No Books', 'The catalogue in this simulator is fixed.')); return; }
        group(results, {
          rows: hits.map(([title, author, pages, genre]) => {
            const owned = state.library.some(book => book.title === title);
            return {
              labelHTML: `<div>${esc(title)}</div><div class="sub">${esc(author)} · ${esc(genre)} · ${pages} pages</div>`,
              rightHTML: owned ? '<span style="color:var(--txt2);font-size:12px">In Library</span>'
                : '<span style="color:var(--sysblue);font-size:13px">Get</span>',
              chevron: false,
              onClick: () => {
                if (owned) { toast('Already in your library'); return; }
                state.library.push({ id: Date.now(), title, author, pages, genre, page: 0, finished: false, at: Date.now() });
                save();
                render();
                island(SF.book, '#ff9f0a', 'Books', `${title} added`);
              },
            };
          }),
        });
      }
      render();
    },
  };
}

/** A generated reader: real paging, real progress, generated prose. */
function bookReaderView(book) {
  const PARAGRAPHS = [
    'The trouble with a system that mostly works is that the exceptions are the only part anyone remembers.',
    'She had learned to read the room the way an engineer reads a log: from the bottom up, looking for the first thing that went wrong rather than the loudest.',
    'Every layer promised to hide the layer beneath it, and every failure came from that promise being kept a little too well.',
    'There is a particular kind of quiet that settles over a place when the power comes back on and nobody says anything.',
    'He wrote it down because writing it down was the only way to be sure he had understood it, and understanding it was the only way to make it smaller.',
    'The map was accurate in every detail except the one that mattered, which was the direction people actually walked.',
  ];
  return {
    title: '',
    backLabel: 'Library',
    right: [{ html: SF.sliders, onClick: () => actionSheet('Reader', [
      { text: 'Add Bookmark', onClick: () => toast('Bookmark added') },
      { text: 'Mark as Finished', onClick: () => { book.finished = true; book.page = book.pages; save(); toast('Marked as finished'); } },
      { text: 'Start Over', onClick: () => { book.page = 0; book.finished = false; save(); toast('Progress reset'); } },
    ]) }],
    build(body, nav, view) {
      const page = Math.max(1, book.page || 1);
      const random = rng(`${book.id}:${page}`);
      body.style.background = '#f7f1e3';
      const sheetEl = el('div');
      sheetEl.style.cssText = `padding:18px 22px 10px;color:#2c2418;font-size:17px;line-height:1.62;
        font-family:Georgia,"Times New Roman",serif;min-height:52vh`;
      sheetEl.innerHTML = `<div style="text-align:center;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
          opacity:.5;margin-bottom:16px">${esc(book.title)}</div>
        ${Array.from({ length: 4 }, () => `<p style="margin-bottom:14px">${esc(PARAGRAPHS[Math.floor(random() * PARAGRAPHS.length)])}
          ${esc(PARAGRAPHS[Math.floor(random() * PARAGRAPHS.length)])}</p>`).join('')}`;
      body.appendChild(sheetEl);

      const bar = el('div');
      bar.style.cssText = `position:sticky;bottom:0;background:#f7f1e3;border-top:1px solid rgba(0,0,0,.08);
        padding:10px 16px 16px;color:#5a5140`;
      bar.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px">
        <span>Page ${page} of ${book.pages}</span><span>${Math.round((page / book.pages) * 100)}%</span></div>
        <div style="height:3px;border-radius:2px;background:rgba(0,0,0,.1)">
          <div style="height:100%;width:${(page / book.pages) * 100}%;background:#ff9f0a;border-radius:2px"></div></div>`;
      const buttons = el('div');
      buttons.style.cssText = 'display:flex;gap:10px;margin-top:12px';
      const turn = (label, delta) => {
        const button = el('button', '', label);
        button.style.cssText = 'flex:1;padding:11px;border-radius:12px;background:rgba(0,0,0,.06);color:#2c2418;font-size:15px';
        button.onclick = () => {
          book.page = Math.max(1, Math.min(book.pages, page + delta));
          book.finished = book.page >= book.pages;
          book.at = Date.now();
          BK().readToday += 1;
          save();
          nav.refresh();
        };
        return button;
      };
      buttons.append(turn('← Previous', -1), turn('Next →', 1));
      bar.appendChild(buttons);
      body.appendChild(bar);
      view.onPop = () => save();
    },
  };
}

/* ============================================================= PODCASTS === */

const SHOWS = [
  ['The Daily Reset', 'Independent', 'News', 24],
  ['Support Desk', 'Field Notes Media', 'Technology', 41],
  ['Long Way Round', 'Atlas Audio', 'Travel', 18],
  ['Numbers Game', 'Quant House', 'Business', 33],
  ['Night Shift', 'Static Collective', 'Fiction', 12],
  ['Two Rooms', 'Homebody Studio', 'Design', 27],
];

function PC() {
  return slice('podcasts', () => ({
    following: ['The Daily Reset', 'Support Desk', 'Two Rooms'],
    played: {},
    queue: [],
  }));
}

/** Episodes for a show — deterministic titles, durations and dates. */
function showEpisodes(name) {
  const show = SHOWS.find(s => s[0] === name) || SHOWS[0];
  const random = rng(`pod:${name}`);
  return Array.from({ length: show[3] > 20 ? 12 : 8 }, (_, index) => {
    const topics = ['the outage nobody logged', 'a week of small fixes', 'why the map is wrong', 'the long way round',
      'reading the room', 'what the numbers hid', 'a quiet Tuesday', 'the second opinion', 'after the reset'];
    return {
      id: `${name}:${index}`,
      show: name,
      title: `${show[3] - index}. ${topics[Math.floor(random() * topics.length)].replace(/^./, c => c.toUpperCase())}`,
      seconds: Math.round((16 + random() * 52) * 60),
      at: Date.now() - (index * 6 + random() * 3) * 864e5,
      notes: 'Episode notes are generated locally in this simulator. Playback is a timer, not audio.',
    };
  });
}

defineApp({
  id: 'podcasts',
  name: 'Podcasts',
  bg: 'linear-gradient(180deg,#bf5af2,#7b2cbf)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">
    ${sf('<circle cx="12" cy="9" r="3.2"/><path d="M7.6 15.4a6 6 0 118.8 0"/><path d="M10.6 21h2.8l.7-6h-4.2z" fill="currentColor" stroke="none"/>', { size: 32 })}</div>`,
  mount(win, inst) {
    PC();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(podcastsHomeView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function podcastsHomeView() {
  return {
    title: 'Listen Now',
    largeTitle: true,
    build(body, nav) {
      const state = PC();
      const upNext = state.following.flatMap(name => showEpisodes(name).slice(0, 2))
        .sort((a, b) => b.at - a.at).slice(0, 6);

      body.appendChild(cardHeader('Up Next'));
      const strip = el('div', 'hscroll');
      upNext.forEach(episode => {
        const played = state.played[episode.id] || 0;
        const tile = el('div', 'hcard');
        tile.style.minWidth = '230px';
        tile.innerHTML = `
          <div style="height:150px;border-radius:14px;overflow:hidden;
            background-image:url('${artURI(`pod:${episode.show}`, { w: 300, h: 300, kind: 'album' })}');background-size:cover"></div>
          <div style="margin-top:9px;font-size:12px;color:var(--txt2)">${esc(relativeDay(episode.at))} · ${esc(episode.show)}</div>
          <div style="font-size:14px;font-weight:600;line-height:1.25;margin-top:2px">${esc(episode.title)}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:3px">
            ${played ? `${clockDuration(episode.seconds - played)} left` : clockDuration(episode.seconds)}</div>`;
        tile.onclick = () => nav.push(episodeView(episode));
        strip.appendChild(tile);
      });
      body.appendChild(strip);

      group(body, {
        header: 'Following',
        rows: state.following.map(name => ({
          icon: SF.music,
          iconBg: '#bf5af2',
          label: name,
          sub: `${showEpisodes(name).length} episodes`,
          onClick: () => nav.push(showView(name)),
        })),
      });
      group(body, {
        header: 'Browse',
        rows: SHOWS.filter(([name]) => !state.following.includes(name)).map(([name, publisher, category]) => ({
          label: name,
          sub: `${publisher} · ${category}`,
          rightHTML: '<span style="color:var(--sysblue);font-size:13px">Follow</span>',
          chevron: false,
          onClick: () => { state.following.push(name); save(); nav.refresh(); island(SF.music, '#bf5af2', 'Podcasts', `Following ${name}`); },
        })),
      });
    },
  };
}

function showView(name) {
  const show = SHOWS.find(s => s[0] === name) || SHOWS[0];
  return {
    title: name,
    shortTitle: 'Podcasts',
    build(body, nav) {
      const state = PC();
      body.appendChild(h(`<div style="display:flex;gap:14px;padding:6px 20px 14px">
        <div style="width:104px;height:104px;border-radius:14px;flex:none;
          background-image:url('${artURI(`pod:${name}`, { w: 300, h: 300, kind: 'album' })}');background-size:cover"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:19px;font-weight:700;line-height:1.2">${esc(name)}</div>
          <div style="color:var(--txt2);font-size:13px;margin-top:3px">${esc(show[1])}</div>
          <div style="color:var(--txt3);font-size:12px;margin-top:3px">${esc(show[2])} · Updated weekly</div></div></div>`));
      const follow = primaryButton(state.following.includes(name) ? 'Following' : 'Follow', () => {
        state.following = state.following.includes(name)
          ? state.following.filter(s => s !== name)
          : [...state.following, name];
        save();
        nav.refresh();
      });
      if (state.following.includes(name)) {
        const button = follow.querySelector('button');
        button.style.background = 'var(--bg3)';
        button.style.color = 'var(--txt)';
      }
      body.appendChild(follow);
      group(body, {
        header: 'Episodes',
        rows: showEpisodes(name).map(episode => {
          const played = state.played[episode.id] || 0;
          return {
            labelHTML: `<div>${esc(episode.title)}</div>
              <div class="sub">${esc(relativeDay(episode.at))} · ${esc(clockDuration(episode.seconds))}${played ? ` · ${Math.round((played / episode.seconds) * 100)}% played` : ''}</div>`,
            onClick: () => nav.push(episodeView(episode)),
          };
        }),
      });
    },
  };
}

function episodeView(episode) {
  return {
    title: episode.show,
    shortTitle: 'Podcasts',
    build(body, nav, view) {
      const state = PC();
      let position = state.played[episode.id] || 0;
      let playing = false;

      body.appendChild(h(`<div style="text-align:center;padding:8px 24px 4px">
        <div style="width:190px;height:190px;margin:0 auto 14px;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.4);
          background-image:url('${artURI(`pod:${episode.show}`, { w: 400, h: 400, kind: 'album' })}');background-size:cover"></div>
        <div style="font-size:18px;font-weight:700;line-height:1.25">${esc(episode.title)}</div>
        <div style="color:var(--txt2);font-size:13px;margin-top:4px">${esc(episode.show)} · ${esc(relativeDay(episode.at))}</div></div>`));

      const progress = el('div');
      progress.style.cssText = 'padding:14px 24px 0';
      const controls = el('div');
      controls.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:26px;padding:16px 0 6px';
      body.append(progress, controls);

      const paint = () => {
        progress.innerHTML = `<div style="height:4px;border-radius:2px;background:var(--bg3)">
            <div style="height:100%;width:${((position / episode.seconds) * 100).toFixed(1)}%;background:#bf5af2;border-radius:2px"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--txt2);margin-top:6px">
            <span>${esc(clockDuration(position))}</span><span>−${esc(clockDuration(Math.max(0, episode.seconds - position)))}</span></div>`;
        controls.innerHTML = '';
        const button = (label, size, onClick) => {
          const element = el('button', '', label);
          element.style.cssText = `color:var(--txt);display:grid;place-items:center;width:${size}px;height:${size}px`;
          element.onclick = onClick;
          return element;
        };
        controls.append(
          button('−15', 44, () => { position = Math.max(0, position - 15); commit(); }),
          (() => {
            const play = el('button', '', playing ? '❚❚' : '▶');
            play.style.cssText = `width:66px;height:66px;border-radius:50%;background:#bf5af2;color:#fff;font-size:22px`;
            play.onclick = () => { playing = !playing; paint(); };
            return play;
          })(),
          button('+30', 44, () => { position = Math.min(episode.seconds, position + 30); commit(); }),
        );
      };
      const commit = () => { state.played[episode.id] = position; save(); paint(); };
      paint();

      view._tick = setInterval(() => {
        if (!body.isConnected) { clearInterval(view._tick); return; }
        if (!playing) return;
        position = Math.min(episode.seconds, position + 1);
        if (position >= episode.seconds) { playing = false; toast('Episode finished'); }
        commit();
      }, 1000);
      view.onPop = () => { clearInterval(view._tick); save(); };

      group(body, {
        rows: [
          { label: 'Add to Queue', icon: SF.plusCircle, iconBg: '#bf5af2', onClick: () => {
            if (!state.queue.includes(episode.id)) state.queue.push(episode.id);
            save();
            toast('Added to queue');
          } },
          { label: 'Mark as Played', icon: SF.star, iconBg: '#30d158', onClick: () => { position = episode.seconds; commit(); toast('Marked as played'); } },
          { label: 'Share Episode', icon: SF.share, iconBg: '#0a84ff', onClick: () => toast('Sharing is simulated') },
        ],
      });
      body.appendChild(h(`<div style="padding:6px 20px 30px;color:var(--txt2);font-size:14px;line-height:1.55">
        ${esc(episode.notes)}</div>`));
    },
  };
}

/* ============================================================= FREEFORM === */

function FF() {
  return slice('freeform', () => ({
    boards: [
      { id: 1, name: 'Network diagram', at: Date.now() - 2 * 36e5, items: [] },
      { id: 2, name: 'Escalation flow', at: Date.now() - 3 * 864e5, items: [] },
    ],
  }));
}

const FF_COLOURS = ['#ffd60a', '#ff9f0a', '#ff6482', '#bf5af2', '#5ac8fa', '#30d158'];

defineApp({
  id: 'freeform',
  name: 'Freeform',
  bg: 'linear-gradient(180deg,#fff,#e8e8ed)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#0a84ff">
    ${sf('<rect x="3" y="4" width="18" height="16" rx="3.4"/><path d="M7.5 15c1.4-4 3-6 4.6-4s2.6 2 4.4-1"/>', { size: 30 })}</div>`,
  mount(win, inst) {
    FF();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(freeformListView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function freeformListView() {
  return {
    title: 'Boards',
    largeTitle: true,
    right: [{ html: SF.plusCircle, onClick: nav => {
      const board = { id: Date.now(), name: 'Untitled', at: Date.now(), items: [] };
      FF().boards.unshift(board);
      save();
      nav.push(freeformBoardView(board));
    } }],
    build(body, nav) {
      const boards = FF().boards;
      if (!boards.length) { body.appendChild(emptyState(SF.compose, 'No Boards', 'Tap + to start one.')); return; }
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:8px 16px';
      boards.forEach(board => {
        const tile = el('div');
        tile.style.cssText = 'cursor:pointer';
        tile.innerHTML = `<div style="aspect-ratio:3/4;border-radius:12px;background:#fff;border:.5px solid var(--sep);
            position:relative;overflow:hidden">
            ${board.items.slice(0, 6).map(item => `<div style="position:absolute;left:${item.x * 0.9}%;top:${item.y * 0.9}%;
              width:28%;height:20%;border-radius:3px;background:${item.colour};opacity:.9"></div>`).join('')}
            ${board.items.length ? '' : '<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--txt3);font-size:12px">Empty</div>'}</div>
          <div style="margin-top:7px;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(board.name)}</div>
          <div style="font-size:12px;color:var(--txt2)">${esc(relativeDay(board.at))} · ${board.items.length} item${board.items.length === 1 ? '' : 's'}</div>`;
        tile.onclick = () => nav.push(freeformBoardView(board));
        tile.oncontextmenu = event => {
          event.preventDefault();
          actionSheet(board.name, [
            { text: 'Rename', onClick: () => sheet(box => {
              box.appendChild(h('<div style="font-size:20px;font-weight:700;margin-bottom:10px">Rename Board</div>'));
              const field = el('div', 'compose-field');
              const input = el('input');
              input.value = board.name;
              field.appendChild(input);
              box.appendChild(field);
              box.appendChild(primaryButton('Save', () => {
                board.name = input.value.trim() || board.name;
                save();
                closeOverlay();
                nav.refresh();
              }));
            }) },
            { text: 'Delete Board', style: 'red', onClick: () => {
              FF().boards = FF().boards.filter(b => b.id !== board.id);
              save();
              nav.refresh();
            } },
          ]);
        };
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      body.appendChild(h(`<div class="grp-f">Boards are a simple sticky-note canvas: tap the canvas to place a note,
        drag notes to move them, tap a note to edit it.</div>`));
    },
  };
}

function freeformBoardView(board) {
  return {
    title: board.name,
    shortTitle: 'Boards',
    right: [{ html: SF.sliders, onClick: nav => actionSheet(board.name, [
      { text: 'Clear Board', style: 'red', onClick: () => { board.items = []; save(); nav.refresh(); } },
    ]) }],
    build(body, nav) {
      body.appendChild(h(`<div style="padding:4px 20px 8px;color:var(--txt2);font-size:13px">
        Tap anywhere on the canvas to add a note. Drag to rearrange.</div>`));
      const canvas = el('div');
      canvas.style.cssText = `position:relative;margin:0 12px 16px;height:60vh;border-radius:14px;
        background:#fff;border:.5px solid var(--sep);overflow:hidden;
        background-image:radial-gradient(rgba(0,0,0,.09) 1px,transparent 1px);background-size:18px 18px`;
      body.appendChild(canvas);

      const paint = () => {
        canvas.querySelectorAll('.ff-note').forEach(node => node.remove());
        board.items.forEach(item => {
          const note = el('div', 'ff-note');
          note.style.cssText = `position:absolute;left:${item.x}%;top:${item.y}%;width:110px;min-height:76px;
            background:${item.colour};border-radius:4px;padding:9px 10px;font-size:13px;line-height:1.35;color:#2c2418;
            box-shadow:0 4px 10px rgba(0,0,0,.18);cursor:grab;word-break:break-word`;
          note.textContent = item.text;
          canvas.appendChild(note);

          /* Pointer drag, so it works with a mouse and with touch. */
          note.onpointerdown = event => {
            event.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            let moved = false;
            note.setPointerCapture(event.pointerId);
            const move = moveEvent => {
              moved = true;
              item.x = Math.max(0, Math.min(84, ((moveEvent.clientX - rect.left) / rect.width) * 100 - 6));
              item.y = Math.max(0, Math.min(84, ((moveEvent.clientY - rect.top) / rect.height) * 100 - 5));
              note.style.left = `${item.x}%`;
              note.style.top = `${item.y}%`;
            };
            const up = () => {
              note.removeEventListener('pointermove', move);
              note.removeEventListener('pointerup', up);
              if (moved) { board.at = Date.now(); save(); }
              else editNote(item);
            };
            note.addEventListener('pointermove', move);
            note.addEventListener('pointerup', up);
          };
        });
      };

      const editNote = item => sheet(box => {
        box.appendChild(h('<div style="font-size:20px;font-weight:700;margin-bottom:10px">Note</div>'));
        const area = el('textarea');
        area.value = item.text;
        area.style.cssText = 'width:100%;min-height:96px;background:var(--bg3);border-radius:12px;padding:12px;color:var(--txt);font-size:16px;resize:none';
        box.appendChild(area);
        const swatches = el('div');
        swatches.style.cssText = 'display:flex;gap:10px;margin:12px 0';
        FF_COLOURS.forEach(colour => {
          const dot = el('button');
          dot.style.cssText = `width:34px;height:34px;border-radius:50%;background:${colour};
            border:${colour === item.colour ? '3px solid var(--txt)' : 'none'}`;
          dot.onclick = () => { item.colour = colour; save(); closeOverlay(); paint(); };
          swatches.appendChild(dot);
        });
        box.appendChild(swatches);
        const buttons = el('div');
        buttons.style.cssText = 'display:flex;gap:10px';
        const remove = el('button', 'btn-primary', 'Delete');
        remove.style.background = 'var(--sysred)';
        remove.onclick = () => {
          board.items = board.items.filter(i => i !== item);
          save();
          closeOverlay();
          paint();
        };
        const done = el('button', 'btn-primary', 'Save');
        done.onclick = () => { item.text = area.value; board.at = Date.now(); save(); closeOverlay(); paint(); };
        buttons.append(remove, done);
        box.appendChild(buttons);
        setTimeout(() => area.focus(), 320);
      });

      canvas.onclick = event => {
        if (event.target !== canvas) return;
        const rect = canvas.getBoundingClientRect();
        const item = {
          x: Math.max(0, Math.min(84, ((event.clientX - rect.left) / rect.width) * 100 - 6)),
          y: Math.max(0, Math.min(84, ((event.clientY - rect.top) / rect.height) * 100 - 5)),
          text: 'New note',
          colour: FF_COLOURS[board.items.length % FF_COLOURS.length],
        };
        board.items.push(item);
        board.at = Date.now();
        save();
        paint();
        editNote(item);
      };
      paint();
    },
    onPop() { save(); },
  };
}
