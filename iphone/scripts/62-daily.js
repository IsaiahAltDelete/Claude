/* ===========================================================================
   Calendar, Reminders, Contacts, Files and Voice Memos.

   All five are new apps. Each keeps its own slice of persisted state, so
   anything added survives a reload and an Erase All Content puts it back.
   =========================================================================== */

/* ----------------------------------------------------------------- Calendar */

const CALENDARS = [
  { id: 'home', name: 'Home', colour: '#30d158' },
  { id: 'work', name: 'Work', colour: '#0a84ff' },
  { id: 'family', name: 'Family', colour: '#ff9f0a' },
  { id: 'birthdays', name: 'Birthdays', colour: '#bf5af2' },
];

function CAL() {
  return slice('calendar', () => {
    const midnight = new Date().setHours(0, 0, 0, 0);
    const make = (offset, hour, minute, title, cal, minutes = 60, place = '') =>
      ({ id: `e${offset}-${hour}-${minute}`, at: midnight + offset * 864e5 + hour * 36e5 + minute * 6e4, title, cal, minutes, place });
    return {
      hidden: [],
      events: [
        make(0, 9, 15, 'Tier 2 stand-up', 'work', 15, 'Bench room'),
        make(0, 11, 0, 'Bench triage', 'work', 60),
        make(0, 18, 30, 'Grocery run', 'home', 45),
        make(1, 8, 0, 'Dentist', 'home', 60, '4 Palm Ave'),
        make(1, 14, 0, 'Escalation review', 'work', 45),
        make(2, 17, 0, "Milo's recital", 'family', 90, 'School hall'),
        make(3, 10, 30, 'Team retro', 'work', 60),
        make(4, 22, 0, 'Change window', 'work', 90),
        make(6, 12, 0, 'Lunch with Dana', 'home', 60, 'Cafe Welcome'),
        make(9, 0, 0, "Dana's birthday", 'birthdays', 1440),
      ],
    };
  });
}

const calColour = id => (CALENDARS.find(c => c.id === id) || CALENDARS[0]).colour;
const visibleEvents = () => CAL().events.filter(event => !CAL().hidden.includes(event.cal));
const eventsOn = date => visibleEvents()
  .filter(event => new Date(event.at).toDateString() === date.toDateString())
  .sort((a, b) => a.at - b.at);

defineApp({
  id: 'calendar',
  name: 'Calendar',
  bg: '#fff',
  glyph: `<svg viewBox="0 0 100 100" style="width:100%;height:100%">
    <rect width="100" height="100" rx="23" fill="#fff"/>
    <text x="50" y="34" font-family="-apple-system,sans-serif" font-size="17" font-weight="600" fill="#ff453a" text-anchor="middle">${new Date().toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</text>
    <text x="50" y="82" font-family="-apple-system,sans-serif" font-size="46" font-weight="300" fill="#1c1c1e" text-anchor="middle">${new Date().getDate()}</text></svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(calendarMonthView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function calendarMonthView() {
  const store = slice('calendarView', () => ({ offset: 0 }));
  return {
    title: 'Calendar',
    shortTitle: 'Calendar',
    left: [{ text: 'Today', cls: 'blue', onClick: nav => { store.offset = 0; save(); nav.refresh(); } }],
    right: [
      { html: SF.magnifier, onClick: nav => nav.push(calendarSearchView()) },
      { html: SF.plusCircle, onClick: nav => addEventSheet(nav) },
    ],
    build(body, nav) {
      const today = new Date();
      const cursor = new Date(today.getFullYear(), today.getMonth() + store.offset, 1);

      const header = el('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 20px 4px';
      header.appendChild(h(`<div style="font-size:22px;font-weight:700">
        ${esc(cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</div>`));
      const arrows = el('div');
      arrows.style.cssText = 'display:flex;gap:18px;color:var(--sysblue)';
      [['‹', -1], ['›', 1]].forEach(([label, delta]) => {
        const button = el('button', '', label);
        button.style.cssText = 'font-size:26px;line-height:1';
        button.onclick = () => { store.offset += delta; save(); nav.refresh(); };
        arrows.appendChild(button);
      });
      header.appendChild(arrows);
      body.appendChild(header);

      body.appendChild(h(`<div style="display:grid;grid-template-columns:repeat(7,1fr);padding:8px 12px 4px;
        font-size:11px;color:var(--txt3);text-align:center">
        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div>${d}</div>`).join('')}</div>`));

      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);padding:0 12px;gap:2px 0';
      const firstDay = cursor.getDay();
      const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      for (let i = 0; i < firstDay; i += 1) grid.appendChild(el('div'));

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
        const isToday = date.toDateString() === today.toDateString();
        const dayEvents = eventsOn(date);
        const cell = el('div');
        cell.style.cssText = 'display:grid;justify-items:center;gap:3px;padding:6px 0 4px;cursor:default';
        cell.appendChild(h(`<div style="width:32px;height:32px;border-radius:50%;display:grid;place-items:center;
          font-size:17px;${isToday ? 'background:#ff453a;color:#fff;font-weight:600' : ''}">${day}</div>`));
        const dots = el('div');
        dots.style.cssText = 'display:flex;gap:2px;height:5px';
        [...new Set(dayEvents.map(e => e.cal))].slice(0, 3).forEach(cal => {
          dots.appendChild(h(`<span style="width:5px;height:5px;border-radius:50%;background:${calColour(cal)}"></span>`));
        });
        cell.appendChild(dots);
        cell.onclick = () => nav.push(calendarDayView(date));
        grid.appendChild(cell);
      }
      body.appendChild(grid);

      /* Upcoming list under the grid, as iOS does. */
      const upcoming = visibleEvents().filter(event => event.at >= Date.now() - 36e5).sort((a, b) => a.at - b.at).slice(0, 8);
      body.appendChild(cardHeader('Upcoming'));
      if (!upcoming.length) {
        body.appendChild(emptyState(SF.gear, 'No Upcoming Events', 'Tap + to add one.'));
      } else {
        group(body, { rows: upcoming.map(event => eventRow(event, nav)) });
      }

      body.appendChild(cardHeader('Calendars'));
      group(body, { rows: CALENDARS.map(cal => ({
        labelHTML: `<span style="display:inline-flex;align-items:center;gap:9px">
          <span style="width:11px;height:11px;border-radius:50%;background:${cal.colour}"></span>${esc(cal.name)}</span>`,
        toggle: () => !CAL().hidden.includes(cal.id),
        onToggle: value => {
          const store2 = CAL();
          store2.hidden = value ? store2.hidden.filter(id => id !== cal.id) : [...store2.hidden, cal.id];
          save();
          nav.refresh();
        },
      })) });
    },
  };
}

function eventRow(event, nav) {
  const date = new Date(event.at);
  const allDay = event.minutes >= 1440;
  return {
    labelHTML: `<span style="display:inline-flex;align-items:center;gap:9px">
      <span style="width:4px;height:26px;border-radius:2px;background:${calColour(event.cal)}"></span>
      <span>${esc(event.title)}</span></span>`,
    sub: `${relativeDay(date)}${allDay ? ' · all day' : ` · ${timeStr(date)}`}${event.place ? ` · ${event.place}` : ''}`,
    onClick: () => nav.push(eventDetailView(event)),
  };
}

function calendarDayView(date) {
  return {
    title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    shortTitle: shortDate(date),
    right: [{ html: SF.plusCircle, onClick: nav => addEventSheet(nav, date) }],
    build(body, nav) {
      const dayEvents = eventsOn(date);
      if (!dayEvents.length) {
        body.appendChild(emptyState(SF.gear, 'No Events', 'Nothing scheduled for this day.'));
        return;
      }
      /* Hour rail so the day reads like a timeline. */
      const startHour = Math.max(0, Math.min(...dayEvents.map(e => new Date(e.at).getHours())) - 1);
      const endHour = Math.min(24, Math.max(...dayEvents.map(e => new Date(e.at).getHours())) + 2);
      const rail = el('div');
      rail.style.cssText = 'padding:8px 16px 20px';
      for (let hour = startHour; hour < endHour; hour += 1) {
        const row = el('div');
        row.style.cssText = 'display:grid;grid-template-columns:56px 1fr;gap:10px;min-height:52px;border-top:.5px solid var(--sep);padding-top:4px';
        row.appendChild(h(`<div style="font-size:11px;color:var(--txt3)">
          ${hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</div>`));
        const slot = el('div');
        dayEvents.filter(event => new Date(event.at).getHours() === hour).forEach(event => {
          const chip = el('div');
          chip.style.cssText = `background:${calColour(event.cal)}22;border-left:3px solid ${calColour(event.cal)};
            border-radius:6px;padding:6px 9px;margin-bottom:4px`;
          chip.innerHTML = `<div style="font-size:14px;font-weight:500">${esc(event.title)}</div>
            <div style="font-size:12px;color:var(--txt3)">${timeStr(new Date(event.at))} · ${event.minutes} min${event.place ? ` · ${esc(event.place)}` : ''}</div>`;
          chip.onclick = () => nav.push(eventDetailView(event));
          slot.appendChild(chip);
        });
        row.appendChild(slot);
        rail.appendChild(row);
      }
      body.appendChild(rail);
    },
  };
}

function eventDetailView(event) {
  return {
    title: 'Event',
    shortTitle: 'Event',
    build(body, nav) {
      const date = new Date(event.at);
      body.appendChild(h(`<div style="padding:16px 20px 4px">
        <div style="font-size:24px;font-weight:700">${esc(event.title)}</div>
        <div style="color:var(--txt3);margin-top:4px">${esc(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div></div>`));
      group(body, { rows: [
        { label: 'Starts', value: event.minutes >= 1440 ? 'All day' : timeStr(date) },
        { label: 'Duration', value: event.minutes >= 1440 ? '1 day' : `${event.minutes} min` },
        { label: 'Calendar',
          labelHTML: `<span style="display:inline-flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${calColour(event.cal)}"></span>Calendar</span>`,
          value: (CALENDARS.find(c => c.id === event.cal) || {}).name },
        ...(event.place ? [{ label: 'Location', value: event.place, onClick: () => openApp('maps') }] : []),
        { label: 'Alert', value: '15 minutes before' },
      ] });
      group(body, { rows: [
        { label: 'Delete Event', cls: 'red center', chevron: false, onClick: () => {
          alertBox({
            title: 'Delete Event?',
            message: `“${event.title}” will be removed.`,
            buttons: [
              { text: 'Cancel' },
              { text: 'Delete', style: 'red', onClick: () => {
                const store = CAL();
                store.events = store.events.filter(candidate => candidate.id !== event.id);
                save();
                toast('Event deleted');
                nav.pop();
              } },
            ],
          });
        } },
      ] });
    },
  };
}

function addEventSheet(nav, when) {
  sheet(box => {
    box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 4px">New Event</div>'));
    const wrap = el('div');
    wrap.style.padding = '0 16px 20px';

    const field = (label, value, type) => {
      const holder = el('div', 'compose-field');
      holder.appendChild(h(`<div style="font-size:12px;color:var(--txt3);margin-bottom:3px">${esc(label)}</div>`));
      const input = el('input');
      if (type) input.type = type;
      input.value = value || '';
      input.style.cssText = 'width:100%;border:0;outline:0;background:transparent;color:var(--txt);font-size:16px';
      holder.appendChild(input);
      wrap.appendChild(holder);
      return input;
    };

    const base = when || new Date();
    const titleIn = field('Title', '');
    const placeIn = field('Location', '');
    const dateIn = field('Date', new Date(base.getTime() - base.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), 'date');
    const timeIn = field('Starts', '09:00', 'time');

    const picker = el('div');
    picker.style.cssText = 'display:flex;gap:8px;margin:10px 0 4px;flex-wrap:wrap';
    let chosen = 'work';
    CALENDARS.forEach(cal => {
      const chip = el('button', '', esc(cal.name));
      chip.style.cssText = `padding:6px 12px;border-radius:999px;font-size:13px;
        background:${cal.id === chosen ? cal.colour : 'var(--bg3)'};color:${cal.id === chosen ? '#fff' : 'var(--txt)'}`;
      chip.onclick = () => {
        chosen = cal.id;
        $$('button', picker).forEach((b, i) => {
          b.style.background = CALENDARS[i].id === chosen ? CALENDARS[i].colour : 'var(--bg3)';
          b.style.color = CALENDARS[i].id === chosen ? '#fff' : 'var(--txt)';
        });
      };
      picker.appendChild(chip);
    });
    wrap.appendChild(picker);

    const error = el('div');
    error.style.cssText = 'color:var(--sysred);font-size:13px;min-height:18px;padding:2px 2px 0';
    wrap.appendChild(error);

    const add = el('button', 'btn-primary', 'Add Event');
    add.onclick = () => {
      const title = titleIn.value.trim();
      if (!title) { error.textContent = 'Give the event a title.'; return; }
      if (!dateIn.value) { error.textContent = 'Choose a date.'; return; }
      const [hour, minute] = (timeIn.value || '09:00').split(':').map(Number);
      const day = new Date(`${dateIn.value}T00:00:00`);
      day.setHours(hour, minute, 0, 0);
      CAL().events.push({
        id: `e${Date.now()}`,
        at: day.getTime(),
        title,
        cal: chosen,
        minutes: 60,
        place: placeIn.value.trim(),
      });
      save();
      closeOverlay();
      toast('Event added');
      nav.refresh();
    };
    wrap.appendChild(add);
    box.appendChild(wrap);
    setTimeout(() => titleIn.focus(), 120);
  });
}

function calendarSearchView() {
  return {
    title: 'Search',
    shortTitle: 'Search',
    build(body, nav) {
      const results = el('div');
      const paint = query => {
        results.innerHTML = '';
        const matches = visibleEvents()
          .filter(event => `${event.title} ${event.place || ''}`.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => a.at - b.at);
        if (!query.trim()) { results.appendChild(cardHeader(`${visibleEvents().length} events`)); }
        if (!matches.length) {
          results.appendChild(emptyState(SF.magnifier, 'No Events Found', ''));
          return;
        }
        group(results, { rows: matches.map(event => eventRow(event, nav)) });
      };
      body.appendChild(searchField('Search events', paint));
      body.appendChild(results);
      paint('');
    },
  };
}

/* ---------------------------------------------------------------- Reminders */

function REM() {
  return slice('reminders', () => ({
    lists: [
      { id: 'support', name: 'Support', colour: '#0a84ff' },
      { id: 'personal', name: 'Personal', colour: '#30d158' },
      { id: 'shopping', name: 'Shopping', colour: '#ff9f0a' },
    ],
    items: [
      { id: 'r1', list: 'support', text: 'Call back ticket 4821', done: false, flagged: true, due: Date.now() + 36e5 },
      { id: 'r2', list: 'support', text: 'Attach diagnostics to escalation', done: false, flagged: false, due: Date.now() + 9e6 },
      { id: 'r3', list: 'support', text: 'Update the Wi-Fi runbook', done: false, flagged: false, due: null },
      { id: 'r4', list: 'personal', text: 'Renew parking permit', done: false, flagged: false, due: Date.now() + 3 * 864e5 },
      { id: 'r5', list: 'personal', text: 'Book dentist', done: true, flagged: false, due: null },
      { id: 'r6', list: 'shopping', text: 'Milk', done: false, flagged: false, due: null },
      { id: 'r7', list: 'shopping', text: 'Coffee beans', done: false, flagged: false, due: null },
    ],
    next: 8,
  }));
}

defineApp({
  id: 'reminders',
  name: 'Reminders',
  bg: '#fff',
  glyph: `<svg viewBox="0 0 100 100" style="width:100%;height:100%">
    <rect width="100" height="100" rx="23" fill="#fff"/>
    ${[['#ff9f0a', 32], ['#ff453a', 52], ['#0a84ff', 72]].map(([c, y]) =>
      `<circle cx="28" cy="${y}" r="6.5" fill="${c}"/><rect x="42" y="${y - 3.5}" width="34" height="7" rx="3.5" fill="#c7c7cc"/>`).join('')}</svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(remindersHomeView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function remindersHomeView() {
  return {
    title: 'Reminders',
    largeTitle: true,
    shortTitle: 'Lists',
    right: [{ html: SF.plusCircle, onClick: nav => addReminderSheet(nav) }],
    build(body, nav) {
      const store = REM();
      const open = store.items.filter(item => !item.done);
      const smart = [
        ['Today', '#0a84ff', SF.gear, open.filter(item => item.due && item.due < new Date().setHours(23, 59, 59))],
        ['Scheduled', '#ff453a', SF.bell, open.filter(item => item.due)],
        ['Flagged', '#ff9f0a', SF.flag, open.filter(item => item.flagged)],
        ['All', '#8e8e93', SF.inbox, open],
      ];

      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 16px 8px';
      smart.forEach(([label, colour, glyph, items]) => {
        const tile = el('div');
        tile.style.cssText = 'background:var(--group);border-radius:12px;padding:12px';
        tile.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between">
          <span style="width:28px;height:28px;border-radius:50%;background:${colour};color:#fff;display:grid;place-items:center">${glyph}</span>
          <span style="font-size:20px;font-weight:700">${items.length}</span></div>
          <div style="margin-top:6px;font-size:14px;font-weight:600;color:var(--txt3)">${label}</div>`;
        tile.onclick = () => nav.push(reminderListView(label, () => items));
        grid.appendChild(tile);
      });
      body.appendChild(grid);

      body.appendChild(cardHeader('My Lists'));
      group(body, { rows: store.lists.map(list => ({
        labelHTML: `<span style="display:inline-flex;align-items:center;gap:10px">
          <span style="width:24px;height:24px;border-radius:50%;background:${list.colour};color:#fff;
          display:inline-grid;place-items:center;font-size:12px">☰</span>${esc(list.name)}</span>`,
        value: String(store.items.filter(item => item.list === list.id && !item.done).length),
        onClick: () => nav.push(reminderListView(list.name, () => REM().items.filter(item => item.list === list.id), list.id)),
      })) });

      body.appendChild(primaryButton('Add List', () => {
        sheet(box => {
          box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 8px">New List</div>'));
          const holder = el('div');
          holder.style.padding = '0 16px 20px';
          const input = el('input');
          input.placeholder = 'List name';
          input.style.cssText = 'width:100%;height:44px;border:0;outline:0;border-radius:10px;background:var(--bg3);color:var(--txt);padding:0 12px;font-size:16px';
          holder.appendChild(input);
          const button = el('button', 'btn-primary', 'Create');
          button.style.marginTop = '14px';
          button.onclick = () => {
            const name = input.value.trim();
            if (!name) return;
            REM().lists.push({ id: `l${Date.now()}`, name, colour: PALETTES[REM().lists.length % PALETTES.length][0] });
            save();
            closeOverlay();
            nav.refresh();
          };
          holder.appendChild(button);
          box.appendChild(holder);
          setTimeout(() => input.focus(), 120);
        });
      }));
    },
  };
}

function reminderListView(title, getItems, listId) {
  return {
    title,
    shortTitle: title,
    right: [{ html: SF.plusCircle, onClick: nav => addReminderSheet(nav, listId) }],
    build(body, nav) {
      const items = getItems();
      if (!items.length) {
        body.appendChild(emptyState(SF.inbox, 'No Reminders', 'Tap + to add one.'));
        return;
      }
      const list = el('div', 'grp');
      list.style.margin = '10px 16px';
      items.forEach(item => {
        const row = el('div', 'row');
        const circle = el('div');
        circle.style.cssText = `width:22px;height:22px;border-radius:50%;flex:none;
          border:1.8px solid ${item.done ? 'var(--sysblue)' : 'var(--txt3)'};
          background:${item.done ? 'var(--sysblue)' : 'transparent'};display:grid;place-items:center;color:#fff;font-size:12px`;
        circle.textContent = item.done ? '✓' : '';
        circle.onclick = event => {
          event.stopPropagation();
          item.done = !item.done;
          save();
          nav.refresh();
        };
        row.appendChild(circle);
        const label = el('div', 'lbl');
        label.innerHTML = `<div style="${item.done ? 'color:var(--txt3);text-decoration:line-through' : ''}">${esc(item.text)}</div>` +
          (item.due ? `<div class="sub">${esc(relativeDay(new Date(item.due)))} · ${esc(timeStr(new Date(item.due)))}</div>` : '');
        row.appendChild(label);
        if (item.flagged) row.appendChild(h('<div style="color:var(--sysorange)">⚑</div>'));
        const del = el('button', '', SF.trash);
        del.style.cssText = 'color:var(--sysred);opacity:.6';
        del.onclick = event => {
          event.stopPropagation();
          const store = REM();
          store.items = store.items.filter(candidate => candidate.id !== item.id);
          save();
          nav.refresh();
        };
        row.appendChild(del);
        list.appendChild(row);
      });
      body.appendChild(list);
    },
  };
}

function addReminderSheet(nav, listId) {
  sheet(box => {
    box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 8px">New Reminder</div>'));
    const wrap = el('div');
    wrap.style.padding = '0 16px 20px';
    const input = el('input');
    input.placeholder = 'Reminder';
    input.style.cssText = 'width:100%;height:44px;border:0;outline:0;border-radius:10px;background:var(--bg3);color:var(--txt);padding:0 12px;font-size:16px';
    wrap.appendChild(input);

    const store = REM();
    let chosen = listId || store.lists[0].id;
    let flagged = false;
    const chips = el('div');
    chips.style.cssText = 'display:flex;gap:8px;margin:12px 0;flex-wrap:wrap';
    store.lists.forEach(list => {
      const chip = el('button', '', esc(list.name));
      const paint = () => {
        chip.style.cssText = `padding:6px 12px;border-radius:999px;font-size:13px;
          background:${list.id === chosen ? list.colour : 'var(--bg3)'};color:${list.id === chosen ? '#fff' : 'var(--txt)'}`;
      };
      chip.onclick = () => { chosen = list.id; $$('button', chips).forEach((b, i) => { void b; void i; }); [...chips.children].forEach((c, i) => {
        const l = store.lists[i];
        c.style.background = l.id === chosen ? l.colour : 'var(--bg3)';
        c.style.color = l.id === chosen ? '#fff' : 'var(--txt)';
      }); };
      paint();
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);

    const flag = el('button', '', '⚑ Flag');
    flag.style.cssText = 'padding:6px 12px;border-radius:999px;font-size:13px;background:var(--bg3);color:var(--txt)';
    flag.onclick = () => {
      flagged = !flagged;
      flag.style.background = flagged ? 'var(--sysorange)' : 'var(--bg3)';
      flag.style.color = flagged ? '#fff' : 'var(--txt)';
    };
    wrap.appendChild(flag);

    const button = el('button', 'btn-primary', 'Add');
    button.style.marginTop = '14px';
    button.onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      store.items.push({ id: `r${store.next += 1}`, list: chosen, text, done: false, flagged, due: null });
      save();
      closeOverlay();
      toast('Reminder added');
      nav.refresh();
    };
    wrap.appendChild(button);
    box.appendChild(wrap);
    setTimeout(() => input.focus(), 120);
  });
}

/* ----------------------------------------------------------------- Contacts */

function CON() {
  return slice('contacts', () => ({
    people: [
      { id: 'c1', first: 'Dana', last: 'Whitfield', phone: '+1 (407) 555-0148', email: 'dana@support.example', org: 'Support Desk', fav: true },
      { id: 'c2', first: 'Service', last: 'Desk', phone: '+1 (407) 555-0100', email: 'servicedesk@support.example', org: 'Shared mailbox', fav: true },
      { id: 'c3', first: 'Milo', last: 'Rivera', phone: '+1 (407) 555-0193', email: 'milo.rivera@icloud.example', org: 'Family', fav: false },
      { id: 'c4', first: 'Bench', last: 'Tools', phone: '+1 (800) 555-0111', email: 'news@benchtools.example', org: 'Vendor', fav: false },
      { id: 'c5', first: 'Ada', last: 'Lovelace', phone: '+1 (407) 555-0177', email: 'ada@analytical.example', org: 'Engineering', fav: false },
      { id: 'c6', first: 'Grace', last: 'Hopper', phone: '+1 (407) 555-0166', email: 'grace@navy.example', org: 'Engineering', fav: false },
      { id: 'c7', first: 'Facilities', last: '', phone: '+1 (407) 555-0122', email: 'facilities@support.example', org: 'Building', fav: false },
    ],
    next: 8,
  }));
}

const personName = person => `${person.first} ${person.last}`.trim();

defineApp({
  id: 'contacts',
  name: 'Contacts',
  bg: 'linear-gradient(180deg,#fbfbfd,#e6e6ea)',
  glyph: `<svg viewBox="0 0 100 100" style="width:100%;height:100%">
    <rect width="100" height="100" rx="23" fill="#f2f2f7"/>
    <rect x="18" y="14" width="64" height="72" rx="8" fill="#fff"/>
    <rect x="18" y="14" width="8" height="72" fill="#c9a227"/>
    <circle cx="54" cy="43" r="12" fill="#aeaeb2"/>
    <path d="M34 74c3-13 10-19 20-19s17 6 20 19z" fill="#aeaeb2"/></svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(contactsListView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function contactsListView() {
  return {
    title: 'Contacts',
    largeTitle: true,
    shortTitle: 'Contacts',
    right: [{ html: SF.plusCircle, onClick: nav => addContactSheet(nav) }],
    build(body, nav) {
      let query = '';
      const listHost = el('div');

      const paint = () => {
        listHost.innerHTML = '';
        const people = CON().people
          .filter(person => `${personName(person)} ${person.org}`.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => personName(a).localeCompare(personName(b)));

        const favourites = people.filter(person => person.fav);
        if (favourites.length && !query) {
          listHost.appendChild(cardHeader('Favourites'));
          group(listHost, { rows: favourites.map(person => contactRow(person, nav)) });
        }

        if (!people.length) {
          listHost.appendChild(emptyState(SF.person, 'No Contacts', `Nothing matched “${query}”.`));
          return;
        }

        const sections = new Map();
        people.forEach(person => {
          const letter = (person.last || person.first || '#')[0].toUpperCase();
          if (!sections.has(letter)) sections.set(letter, []);
          sections.get(letter).push(person);
        });
        [...sections.entries()].sort().forEach(([letter, group2]) => {
          listHost.appendChild(h(`<div class="grp-h">${letter}</div>`));
          group(listHost, { rows: group2.map(person => contactRow(person, nav)) });
        });
      };

      body.appendChild(searchField('Search', value => { query = value; paint(); }));
      body.appendChild(listHost);
      paint();
    },
  };
}

function contactRow(person, nav) {
  return {
    labelHTML: `<span style="display:inline-flex;align-items:center;gap:10px">
      <span style="width:30px;height:30px;border-radius:50%;background:var(--bg3);color:var(--txt2);
        display:inline-grid;place-items:center;font-size:12px;font-weight:600">${esc((person.first[0] || '') + (person.last[0] || ''))}</span>
      <span>${esc(person.first)} <b>${esc(person.last)}</b></span></span>`,
    onClick: () => nav.push(personCardView(person)),
  };
}

function personCardView(person) {
  return {
    title: '',
    backLabel: 'Contacts',
    shortTitle: personName(person),
    right: [{ text: 'Edit', cls: 'blue', onClick: () => toast('Editing is simulated') }],
    build(body, nav) {
      body.appendChild(h(`<div style="text-align:center;padding:10px 20px 18px">
        <div style="width:96px;height:96px;border-radius:50%;margin:0 auto 12px;background:var(--bg3);
          display:grid;place-items:center;font-size:34px;font-weight:600;color:var(--txt2)">
          ${esc((person.first[0] || '') + (person.last[0] || ''))}</div>
        <div style="font-size:24px;font-weight:600">${esc(personName(person))}</div>
        <div style="color:var(--txt3);font-size:14px;margin-top:2px">${esc(person.org)}</div></div>`));

      const actions = el('div');
      actions.style.cssText = 'display:flex;gap:10px;padding:0 16px 14px';
      [['message', SF.msgGlyph, 'messages'], ['call', SF.phoneGlyph, 'phone'], ['video', SF.camera, 'facetime'], ['mail', SF.envelope, 'mail']]
        .forEach(([label, glyph, app]) => {
          const button = el('button');
          button.style.cssText = `flex:1;background:var(--group);border-radius:12px;padding:10px 0;color:var(--sysblue);
            display:grid;justify-items:center;gap:3px;font-size:11px`;
          button.innerHTML = `${glyph}<div>${label}</div>`;
          button.onclick = () => { if (Apps[app]) openApp(app); else toast(`${label} is simulated`); };
          actions.appendChild(button);
        });
      body.appendChild(actions);

      group(body, { rows: [
        { label: 'mobile', value: person.phone, onClick: () => openApp('phone') },
        { label: 'email', value: person.email, onClick: () => openApp('mail') },
        { label: 'company', value: person.org },
      ] });

      group(body, { rows: [
        { label: person.fav ? 'Remove from Favourites' : 'Add to Favourites', cls: 'blue center', chevron: false,
          onClick: () => { person.fav = !person.fav; save(); toast(person.fav ? 'Added to Favourites' : 'Removed'); nav.refresh(); } },
        { label: 'Share Contact', cls: 'blue center', chevron: false, onClick: () => toast('Share sheet is simulated') },
        { label: 'Delete Contact', cls: 'red center', chevron: false, onClick: () => {
          alertBox({
            title: 'Delete Contact?',
            message: `${personName(person)} will be removed from this iPhone.`,
            buttons: [
              { text: 'Cancel' },
              { text: 'Delete', style: 'red', onClick: () => {
                const store = CON();
                store.people = store.people.filter(candidate => candidate.id !== person.id);
                save();
                toast('Contact deleted');
                nav.pop();
              } },
            ],
          });
        } },
      ] });
    },
  };
}

function addContactSheet(nav) {
  sheet(box => {
    box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 8px">New Contact</div>'));
    const wrap = el('div');
    wrap.style.padding = '0 16px 20px';
    const inputs = {};
    [['first', 'First name'], ['last', 'Last name'], ['phone', 'Phone'], ['email', 'Email'], ['org', 'Company']]
      .forEach(([key, placeholder]) => {
        const input = el('input');
        input.placeholder = placeholder;
        input.style.cssText = 'width:100%;height:42px;border:0;outline:0;border-radius:10px;background:var(--bg3);color:var(--txt);padding:0 12px;font-size:16px;margin-bottom:8px';
        inputs[key] = input;
        wrap.appendChild(input);
      });
    const error = el('div');
    error.style.cssText = 'color:var(--sysred);font-size:13px;min-height:18px';
    wrap.appendChild(error);
    const button = el('button', 'btn-primary', 'Done');
    button.onclick = () => {
      const first = inputs.first.value.trim();
      if (!first) { error.textContent = 'Enter at least a first name.'; return; }
      const store = CON();
      store.people.push({
        id: `c${store.next += 1}`,
        first,
        last: inputs.last.value.trim(),
        phone: inputs.phone.value.trim() || '+1 (555) 555-0100',
        email: inputs.email.value.trim() || 'unknown@example.com',
        org: inputs.org.value.trim() || 'No company',
        fav: false,
      });
      save();
      closeOverlay();
      toast('Contact added');
      nav.refresh();
    };
    wrap.appendChild(button);
    box.appendChild(wrap);
    setTimeout(() => inputs.first.focus(), 120);
  });
}

/* -------------------------------------------------------------------- Files */

function FILES() {
  return slice('files', () => ({
    nodes: [
      { id: 'icloud', name: 'iCloud Drive', kind: 'root', parent: null },
      { id: 'onphone', name: 'On My iPhone', kind: 'root', parent: null },
      { id: 'f-docs', name: 'Documents', kind: 'folder', parent: 'icloud' },
      { id: 'f-desk', name: 'Desktop', kind: 'folder', parent: 'icloud' },
      { id: 'f-shared', name: 'Shared', kind: 'folder', parent: 'icloud' },
      { id: 'f-downloads', name: 'Downloads', kind: 'folder', parent: 'onphone' },
      { id: 'f-pages', name: 'Pages', kind: 'folder', parent: 'onphone' },
      { id: 'd1', name: 'Wi-Fi Runbook.pdf', kind: 'pdf', parent: 'f-docs', size: 964512, at: Date.now() - 864e5 },
      { id: 'd2', name: 'Escalation 4821.txt', kind: 'txt', parent: 'f-docs', size: 22300, at: Date.now() - 3 * 864e5 },
      { id: 'd3', name: 'August Rota.pdf', kind: 'pdf', parent: 'f-docs', size: 421000, at: Date.now() - 6 * 864e5 },
      { id: 'd4', name: 'Bench Photo.jpg', kind: 'img', parent: 'f-desk', size: 2411724, at: Date.now() - 2 * 864e5 },
      { id: 'd5', name: 'Notes export.txt', kind: 'txt', parent: 'f-desk', size: 8100, at: Date.now() - 9 * 864e5 },
      { id: 'd6', name: 'Team Resources', kind: 'folder', parent: 'f-shared' },
      { id: 'd7', name: 'Checklist.pdf', kind: 'pdf', parent: 'f-downloads', size: 839680, at: Date.now() - 5 * 864e5 },
      { id: 'd8', name: 'Invoice.pdf', kind: 'pdf', parent: 'f-downloads', size: 120400, at: Date.now() - 12 * 864e5 },
    ],
  }));
}

const fileKids = parent => FILES().nodes.filter(node => node.parent === parent);
const FILE_TINT = { folder: '#0a84ff', pdf: '#ff453a', txt: '#8e8e93', img: '#bf5af2' };

function fileSize(bytes) {
  if (!bytes) return '';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${index ? Math.round(value * 10) / 10 : Math.round(value)} ${units[index]}`;
}

defineApp({
  id: 'files',
  name: 'Files',
  bg: 'linear-gradient(180deg,#f7f7fa,#e4e4e9)',
  glyph: `<svg viewBox="0 0 100 100" style="width:100%;height:100%">
    <rect width="100" height="100" rx="23" fill="#f2f2f7"/>
    <path d="M18 34a5 5 0 015-5h17l6 7h31a5 5 0 015 5v33a5 5 0 01-5 5H23a5 5 0 01-5-5z" fill="#4aa3f0"/>
    <path d="M18 46h64v23a5 5 0 01-5 5H23a5 5 0 01-5-5z" fill="#7cc0f7"/></svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(filesBrowseView());
  },
  onShow(inst) { inst.nav.refresh(); },
});

function filesBrowseView() {
  return {
    title: 'Browse',
    largeTitle: true,
    shortTitle: 'Browse',
    build(body, nav) {
      let query = '';
      const host = el('div');

      const paint = () => {
        host.innerHTML = '';
        if (query.trim()) {
          const matches = FILES().nodes.filter(node =>
            node.kind !== 'root' && node.name.toLowerCase().includes(query.toLowerCase()));
          host.appendChild(cardHeader(`${matches.length} results`));
          if (!matches.length) { host.appendChild(emptyState(SF.magnifier, 'No Results', '')); return; }
          group(host, { rows: matches.map(node => fileRow(node, nav)) });
          return;
        }

        host.appendChild(cardHeader('Locations'));
        group(host, { rows: fileKids(null).map(root => ({
          icon: root.id === 'icloud' ? SF.cloud : SF.grid,
          iconBg: 'var(--sysblue)',
          label: root.name,
          value: String(fileKids(root.id).length),
          onClick: () => nav.push(filesFolderView(root)),
        })) });

        host.appendChild(cardHeader('Recents'));
        const recents = FILES().nodes.filter(node => node.at).sort((a, b) => b.at - a.at).slice(0, 5);
        group(host, { rows: recents.map(node => fileRow(node, nav)) });

        host.appendChild(cardHeader('Storage'));
        card(host, box => {
          box.appendChild(h('<div style="font-size:13px;color:var(--txt3);margin-bottom:8px">iCloud Drive — 41.2 GB of 200 GB used</div>'));
          box.appendChild(h(`<div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--bg3)">
            <i style="width:12%;background:#0a84ff"></i><i style="width:6%;background:#bf5af2"></i><i style="width:3%;background:#ff9f0a"></i></div>`));
        });
      };

      body.appendChild(searchField('Search', value => { query = value; paint(); }));
      body.appendChild(host);
      paint();
    },
  };
}

function fileRow(node, nav) {
  const glyph = node.kind === 'folder' ? SF.grid : node.kind === 'img' ? SF.photo : SF.note;
  return {
    icon: glyph,
    iconBg: FILE_TINT[node.kind] || '#8e8e93',
    label: node.name,
    sub: node.kind === 'folder' ? `${fileKids(node.id).length} items` : `${fileSize(node.size)} · ${relativeDay(new Date(node.at || Date.now()))}`,
    onClick: () => (node.kind === 'folder' ? nav.push(filesFolderView(node)) : nav.push(fileDetailView(node))),
  };
}

function filesFolderView(folder) {
  return {
    title: folder.name,
    shortTitle: folder.name,
    right: [{ html: SF.plusCircle, onClick: nav => {
      sheet(box => {
        box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 8px">New Folder</div>'));
        const wrap = el('div');
        wrap.style.padding = '0 16px 20px';
        const input = el('input');
        input.value = 'untitled folder';
        input.style.cssText = 'width:100%;height:42px;border:0;outline:0;border-radius:10px;background:var(--bg3);color:var(--txt);padding:0 12px;font-size:16px';
        wrap.appendChild(input);
        const button = el('button', 'btn-primary', 'Create');
        button.style.marginTop = '12px';
        button.onclick = () => {
          const name = input.value.trim();
          if (!name) return;
          FILES().nodes.push({ id: `n${Date.now()}`, name, kind: 'folder', parent: folder.id });
          save();
          closeOverlay();
          nav.refresh();
        };
        wrap.appendChild(button);
        box.appendChild(wrap);
        setTimeout(() => { input.focus(); input.select(); }, 120);
      });
    } }],
    build(body, nav) {
      const kids = fileKids(folder.id);
      if (!kids.length) {
        body.appendChild(emptyState(SF.grid, 'Folder Is Empty', 'Tap + to create a folder.'));
        return;
      }
      group(body, { rows: kids.map(node => fileRow(node, nav)) });
      body.appendChild(h(`<div class="grp-f">${kids.length} items</div>`));
    },
  };
}

function fileDetailView(node) {
  return {
    title: node.name,
    shortTitle: 'File',
    right: [{ html: SF.share, onClick: () => toast('Share sheet is simulated') }],
    build(body, nav) {
      const preview = el('div');
      preview.style.cssText = 'margin:14px 16px;border-radius:14px;overflow:hidden;background:var(--group);min-height:240px;display:grid;place-items:center';
      if (node.kind === 'img') {
        preview.style.background = `url("${artURI(node.name, { w: 600, h: 500 })}") center/cover`;
      } else if (node.kind === 'txt') {
        preview.style.cssText += ';padding:16px;align-items:start';
        preview.appendChild(h(`<pre style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.6;color:var(--txt2)">Escalation 4821 — captive portal loop

Customer joins "Cafe Welcome", receives the sign-in page,
accepts the terms and then loses the connection.

Reproduced on the bench iPhone. Renewing the lease
recovers it. Attaching diagnostics.</pre>`));
      } else {
        preview.appendChild(h(`<div style="text-align:center;color:var(--txt3)">
          <div style="font-size:44px;color:${FILE_TINT[node.kind]}">${SF.note}</div>
          <div style="margin-top:8px;font-size:13px">${esc(node.kind.toUpperCase())} preview</div></div>`));
      }
      body.appendChild(preview);

      group(body, { rows: [
        { label: 'Kind', value: node.kind === 'pdf' ? 'PDF Document' : node.kind === 'txt' ? 'Plain Text' : 'Image' },
        { label: 'Size', value: fileSize(node.size) },
        { label: 'Modified', value: new Date(node.at || Date.now()).toLocaleString() },
      ] });
      group(body, { rows: [
        { label: 'Delete', cls: 'red center', chevron: false, onClick: () => {
          const store = FILES();
          store.nodes = store.nodes.filter(candidate => candidate.id !== node.id);
          save();
          toast('Moved to Recently Deleted');
          nav.pop();
        } },
      ] });
    },
  };
}

/* -------------------------------------------------------------- Voice Memos */

function VM2() {
  return slice('voicememos', () => ({
    memos: [
      { id: 'v1', name: 'Bench triage notes', at: Date.now() - 36e5, seconds: 74 },
      { id: 'v2', name: 'Customer callback', at: Date.now() - 2 * 864e5, seconds: 38 },
      { id: 'v3', name: 'Runbook draft', at: Date.now() - 6 * 864e5, seconds: 152 },
    ],
    next: 4,
  }));
}

defineApp({
  id: 'voicememos',
  name: 'Voice Memos',
  bg: 'linear-gradient(180deg,#fff,#f0f0f4)',
  glyph: `<svg viewBox="0 0 100 100" style="width:100%;height:100%">
    <rect width="100" height="100" rx="23" fill="#f2f2f7"/>
    ${[26, 36, 46, 56, 66, 76].map((x, i) => {
      const heights = [18, 34, 52, 40, 26, 14];
      return `<rect x="${x}" y="${50 - heights[i] / 2}" width="5" height="${heights[i]}" rx="2.5" fill="#ff453a"/>`;
    }).join('')}</svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(voiceMemosView(inst));
  },
  onShow(inst) { inst.nav.refresh(); },
  onHide(inst) { clearInterval(inst.recTimer); clearInterval(inst.playTimer); },
});

function voiceMemosView(inst) {
  return {
    title: 'All Recordings',
    largeTitle: true,
    shortTitle: 'Recordings',
    build(body, nav) {
      const store = VM2();

      if (!store.memos.length) {
        body.appendChild(emptyState(SF.speaker, 'No Recordings', 'Tap the record button to start.'));
      } else {
        group(body, { rows: store.memos.slice().sort((a, b) => b.at - a.at).map(memo => ({
          label: memo.name,
          sub: `${relativeDay(new Date(memo.at))} · ${clockDuration(memo.seconds)}`,
          onClick: () => nav.push(memoDetailView(memo, inst)),
        })) });
      }

      /* Recorder pinned under the list. */
      const dock = el('div');
      dock.style.cssText = `margin:22px 0 10px;padding:18px 0 10px;border-top:.5px solid var(--sep);
        display:grid;justify-items:center;gap:10px`;
      const readout = el('div');
      readout.style.cssText = 'font-size:15px;font-variant-numeric:tabular-nums;color:var(--txt3)';
      readout.textContent = '00:00';
      dock.appendChild(readout);

      const wave = el('div');
      wave.style.cssText = 'display:flex;align-items:center;gap:3px;height:40px';
      const bars = [];
      for (let i = 0; i < 34; i += 1) {
        const bar = el('div');
        bar.style.cssText = 'width:3px;height:4px;border-radius:2px;background:var(--sysred);opacity:.35;transition:height .12s';
        bars.push(bar);
        wave.appendChild(bar);
      }
      dock.appendChild(wave);

      const button = el('button');
      const paintButton = () => {
        button.style.cssText = `width:66px;height:66px;border-radius:50%;border:4px solid var(--sep);
          display:grid;place-items:center`;
        button.innerHTML = inst.recording
          ? '<span style="width:24px;height:24px;border-radius:4px;background:#ff453a"></span>'
          : '<span style="width:50px;height:50px;border-radius:50%;background:#ff453a"></span>';
      };
      paintButton();

      button.onclick = () => {
        if (inst.recording) {
          clearInterval(inst.recTimer);
          const seconds = inst.recSeconds || 1;
          inst.recording = false;
          const store2 = VM2();
          store2.memos.unshift({
            id: `v${store2.next += 1}`,
            name: `New Recording ${store2.next - 1}`,
            at: Date.now(),
            seconds,
          });
          save();
          toast(`Saved · ${clockDuration(seconds)}`);
          nav.refresh();
          return;
        }
        inst.recording = true;
        inst.recSeconds = 0;
        paintButton();
        island('●', '#ff453a', 'Voice Memos', 'Recording', 2000);
        inst.recTimer = setInterval(() => {
          inst.recSeconds += 1;
          readout.textContent = `${String(Math.floor(inst.recSeconds / 60)).padStart(2, '0')}:${String(inst.recSeconds % 60).padStart(2, '0')}`;
          const random = rng(inst.recSeconds);
          bars.forEach(bar => {
            bar.style.height = `${4 + random() * 34}px`;
            bar.style.opacity = '.9';
          });
        }, 1000);
      };
      dock.appendChild(button);
      dock.appendChild(h('<div style="font-size:12px;color:var(--txt3)">Audio capture is simulated</div>'));
      body.appendChild(dock);
    },
  };
}

function memoDetailView(memo, inst) {
  return {
    title: memo.name,
    shortTitle: 'Memo',
    build(body, nav) {
      body.appendChild(h(`<div style="text-align:center;padding:18px 20px 6px">
        <div style="font-size:20px;font-weight:600">${esc(memo.name)}</div>
        <div style="color:var(--txt3);font-size:13px;margin-top:3px">
          ${esc(new Date(memo.at).toLocaleString())}</div></div>`));

      const wave = el('div');
      wave.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:2px;height:76px;padding:0 16px';
      const random = rng(memo.id);
      const bars = [];
      for (let i = 0; i < 56; i += 1) {
        const bar = el('div');
        const height = 6 + random() * 60;
        bar.style.cssText = `width:3px;height:${height}px;border-radius:2px;background:var(--txt3);opacity:.4`;
        bars.push(bar);
        wave.appendChild(bar);
      }
      body.appendChild(wave);

      const scrub = el('div');
      scrub.style.cssText = 'display:flex;justify-content:space-between;padding:2px 20px;font-size:12px;color:var(--txt3);font-variant-numeric:tabular-nums';
      const elapsed = el('span');
      elapsed.textContent = '0:00';
      scrub.appendChild(elapsed);
      scrub.appendChild(h(`<span>${clockDuration(memo.seconds)}</span>`));
      body.appendChild(scrub);

      let position = 0;
      const controls = el('div');
      controls.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:34px;padding:18px 0';
      const play = el('button', '', '▶');
      play.style.cssText = 'font-size:30px;color:var(--txt)';
      play.onclick = () => {
        if (inst.playTimer) {
          clearInterval(inst.playTimer);
          inst.playTimer = null;
          play.textContent = '▶';
          return;
        }
        play.textContent = '❚❚';
        inst.playTimer = setInterval(() => {
          position += 1;
          if (position >= memo.seconds) {
            clearInterval(inst.playTimer);
            inst.playTimer = null;
            play.textContent = '▶';
            position = 0;
          }
          elapsed.textContent = clockDuration(position);
          const reached = Math.floor((position / memo.seconds) * bars.length);
          bars.forEach((bar, index) => {
            bar.style.background = index <= reached ? 'var(--sysblue)' : 'var(--txt3)';
            bar.style.opacity = index <= reached ? '1' : '.4';
          });
        }, 1000);
      };
      controls.appendChild(h('<button style="font-size:20px;color:var(--txt2)">⏮ 15</button>'));
      controls.appendChild(play);
      controls.appendChild(h('<button style="font-size:20px;color:var(--txt2)">15 ⏭</button>'));
      body.appendChild(controls);

      group(body, { rows: [
        { label: 'Rename', cls: 'blue center', chevron: false, onClick: () => {
          sheet(box => {
            box.appendChild(h('<div style="text-align:center;font-weight:600;padding:14px 0 8px">Rename</div>'));
            const wrap = el('div');
            wrap.style.padding = '0 16px 20px';
            const input = el('input');
            input.value = memo.name;
            input.style.cssText = 'width:100%;height:42px;border:0;outline:0;border-radius:10px;background:var(--bg3);color:var(--txt);padding:0 12px;font-size:16px';
            wrap.appendChild(input);
            const button = el('button', 'btn-primary', 'Save');
            button.style.marginTop = '12px';
            button.onclick = () => {
              const name = input.value.trim();
              if (!name) return;
              memo.name = name;
              save();
              closeOverlay();
              nav.refresh();
            };
            wrap.appendChild(button);
            box.appendChild(wrap);
            setTimeout(() => { input.focus(); input.select(); }, 120);
          });
        } },
        { label: 'Delete', cls: 'red center', chevron: false, onClick: () => {
          clearInterval(inst.playTimer);
          inst.playTimer = null;
          const store = VM2();
          store.memos = store.memos.filter(candidate => candidate.id !== memo.id);
          save();
          toast('Recording deleted');
          nav.pop();
        } },
      ] });
    },
    onPop() { clearInterval(inst.playTimer); inst.playTimer = null; },
  };
}
