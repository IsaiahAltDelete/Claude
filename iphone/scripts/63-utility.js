/* ===========================================================================
   Utility apps.

   Weather, Calculator and Notes replace the thin originals; Compass, Translate
   and Stocks are new. Everything is deterministic and local — forecasts and
   price series come out of the seeded PRNG, so the same city always reads the
   same way and nothing depends on a network round trip.
   =========================================================================== */

/* ============================================================== WEATHER === */

/* Base climate per city: [name, region, tzOffsetHours, summerHigh, humidity]. */
const WX_CITIES = [
  ['Orlando', 'Florida', -3, 91, 68],
  ['New York', 'New York', 0, 82, 60],
  ['Chicago', 'Illinois', -1, 79, 58],
  ['Denver', 'Colorado', -2, 84, 32],
  ['San Francisco', 'California', -3, 67, 72],
  ['Seattle', 'Washington', -3, 71, 70],
  ['Phoenix', 'Arizona', -3, 104, 20],
  ['Anchorage', 'Alaska', -4, 62, 64],
  ['Honolulu', 'Hawaii', -5, 86, 66],
  ['Mexico City', 'Mexico', -1, 76, 54],
  ['Toronto', 'Canada', 0, 78, 62],
  ['London', 'United Kingdom', 5, 70, 74],
  ['Paris', 'France', 6, 76, 68],
  ['Berlin', 'Germany', 6, 74, 66],
  ['Madrid', 'Spain', 6, 89, 38],
  ['Rome', 'Italy', 6, 88, 60],
  ['Reykjavík', 'Iceland', 4, 55, 78],
  ['Moscow', 'Russia', 8, 73, 62],
  ['Dubai', 'United Arab Emirates', 9, 105, 55],
  ['Mumbai', 'India', 9.5, 88, 82],
  ['Singapore', 'Singapore', 13, 89, 84],
  ['Hong Kong', 'Hong Kong', 13, 88, 78],
  ['Tokyo', 'Japan', 14, 87, 72],
  ['Seoul', 'South Korea', 14, 85, 70],
  ['Sydney', 'Australia', 15, 79, 64],
  ['Auckland', 'New Zealand', 17, 70, 76],
  ['Cape Town', 'South Africa', 7, 72, 66],
  ['Nairobi', 'Kenya', 8, 77, 58],
  ['Cairo', 'Egypt', 7, 98, 34],
  ['Buenos Aires', 'Argentina', 2, 82, 66],
  ['São Paulo', 'Brazil', 1, 79, 74],
  ['Lima', 'Peru', 0, 74, 80],
];

const WX_CONDITIONS = [
  { id: 'clear', label: 'Clear', night: 'Clear', warm: 8 },
  { id: 'sunny', label: 'Sunny', night: 'Clear', warm: 6 },
  { id: 'partly', label: 'Partly Cloudy', night: 'Partly Cloudy', warm: 2 },
  { id: 'cloudy', label: 'Cloudy', night: 'Cloudy', warm: -2 },
  { id: 'overcast', label: 'Overcast', night: 'Overcast', warm: -4 },
  { id: 'rain', label: 'Rain', night: 'Rain', warm: -6 },
  { id: 'showers', label: 'Showers', night: 'Showers', warm: -5 },
  { id: 'storm', label: 'Thunderstorms', night: 'Thunderstorms', warm: -7 },
];

/** Layered SVG weather glyph — sized in px so it drops into any row. */
function wxGlyph(id, size = 30, night = false) {
  const sun = night
    ? `<path d="M20 13.5A8.6 8.6 0 0110.5 4a8.6 8.6 0 100 19 8.6 8.6 0 009.5-9.5z" fill="#ffd60a"/>`
    : `<circle cx="12" cy="12" r="5.2" fill="#ffd60a"/>
       <g stroke="#ffd60a" stroke-width="1.9" stroke-linecap="round">
         <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19"/></g>`;
  const cloud = (fill, tx = 0, ty = 0, scale = 1) =>
    `<path transform="translate(${tx} ${ty}) scale(${scale})" fill="${fill}"
      d="M7.4 19a4.4 4.4 0 01-.4-8.8 5.6 5.6 0 0110.9-1.3A4.1 4.1 0 0118 19z"/>`;
  const drops = colour => `<g fill="${colour}">
      <path d="M8.4 18.6l-1.3 3.2M12 18.6l-1.3 3.6M15.6 18.6l-1.3 3.2" stroke="${colour}" stroke-width="1.8" stroke-linecap="round"/></g>`;
  let inner;
  if (id === 'clear' || id === 'sunny') inner = sun;
  else if (id === 'partly') inner = `<g transform="translate(-2 -3) scale(.8)">${sun}</g>${cloud('#d8dbe0', 2, 2, .92)}`;
  else if (id === 'cloudy') inner = `${cloud('#b9bdc4', -3, 0, .78)}${cloud('#e4e7eb', 3, 2, .86)}`;
  else if (id === 'overcast') inner = cloud('#a7abb2', 0, 1, 1);
  else if (id === 'rain' || id === 'showers') inner = `${cloud('#c3c7ce', 0, -2, .92)}${drops('#5ac8fa')}`;
  else inner = `${cloud('#9aa0a8', 0, -2, .92)}
      <path d="M12.6 12.6l-3.4 5.2h2.6l-1.4 4.4 4.6-6h-2.6l1.4-3.6z" fill="#ffd60a"/>`;
  return `<svg viewBox="0 0 24 26" style="width:${size}px;height:${size * 1.08}px;display:block;overflow:visible">${inner}</svg>`;
}

function WX() {
  return slice('wx', () => ({ cities: ['Orlando', 'New York', 'London', 'Tokyo'], unit: 'F', page: 0 }));
}

const wxCity = name => WX_CITIES.find(c => c[0] === name) || WX_CITIES[0];

/** Convert for display. Data is generated in °F; °C is derived. */
function wxTemp(f) {
  return WX().unit === 'C' ? Math.round((f - 32) * 5 / 9) : Math.round(f);
}

/**
 * Deterministic 10-day forecast. Seeded by city and by the calendar day, so
 * the numbers hold still while you browse but move on as the days pass.
 */
function wxForecast(name) {
  const [, , tz, high, humid] = wxCity(name);
  const dayIndex = Math.floor(Date.now() / 864e5);
  const random = rng(`${name}:${dayIndex}`);
  const season = Math.cos(((new Date().getMonth() + 0.5) / 12) * 2 * Math.PI) * 0.5 + 0.5; // 1 = mid-winter
  const seasonalHigh = high - season * (high > 95 ? 22 : 26);

  const days = Array.from({ length: 10 }, (_, index) => {
    const condition = WX_CONDITIONS[Math.floor(random() * WX_CONDITIONS.length)];
    const dayHigh = seasonalHigh + condition.warm + (random() * 6 - 3);
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      date,
      condition,
      high: dayHigh,
      low: dayHigh - (8 + random() * 9),
      rain: /rain|storm|showers/.test(condition.id) ? Math.round(30 + random() * 60) : Math.round(random() * 18),
    };
  });

  const localNow = new Date(Date.now() + tz * 3600e3);
  const hour = localNow.getHours();
  const today = days[0];
  // Temperature follows a daily curve peaking around 15:00.
  const curve = h2 => 0.5 - Math.cos(((h2 - 3 + 24) % 24) / 24 * 2 * Math.PI) * 0.5;
  const at = h2 => today.low + (today.high - today.low) * curve(h2);

  const hours = Array.from({ length: 24 }, (_, index) => {
    const h2 = (hour + index) % 24;
    const random2 = rng(`${name}:${dayIndex}:${h2}`);
    const dayOffset = Math.floor((hour + index) / 24);
    const source = days[Math.min(dayOffset, 9)];
    return {
      hour: h2,
      first: index === 0,
      night: h2 < 6 || h2 >= 20,
      temp: (dayOffset ? source.low + (source.high - source.low) * curve(h2) : at(h2)) + (random2() * 2 - 1),
      condition: random2() < 0.72 ? source.condition : WX_CONDITIONS[Math.floor(random2() * WX_CONDITIONS.length)],
    };
  });

  const sunrise = 6 + Math.round(season * 90) / 60;
  const sunset = 20 - Math.round(season * 150) / 60;
  return {
    name,
    region: wxCity(name)[1],
    tz,
    localNow,
    now: hours[0],
    days,
    hours,
    humidity: Math.round(humid + random() * 8 - 4),
    wind: Math.round(3 + random() * 16),
    gust: Math.round(12 + random() * 18),
    windDir: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(random() * 8)],
    uv: Math.max(0, Math.min(11, Math.round((1 - season) * 9 + random() * 3 - (hours[0].night ? 9 : 0)))),
    visibility: (4 + random() * 6).toFixed(1),
    pressure: (29.6 + random() * 0.8).toFixed(2),
    dew: Math.round(hours[0].temp - (100 - humid) / 5),
    sunrise: `${Math.floor(sunrise)}:${String(Math.round((sunrise % 1) * 60)).padStart(2, '0')} AM`,
    sunset: `${Math.floor(sunset) - 12}:${String(Math.round((sunset % 1) * 60)).padStart(2, '0')} PM`,
  };
}

/** Sky gradient that tracks local time and conditions. */
function wxSky(forecast) {
  const hour = forecast.localNow.getHours();
  const stormy = /rain|storm|showers|overcast/.test(forecast.now.condition.id);
  if (hour < 6 || hour >= 20) return 'linear-gradient(180deg,#1c2545,#05070f)';
  if (hour < 8) return 'linear-gradient(180deg,#e88f5a,#3d4b78 55%,#131b33)';
  if (hour >= 18) return 'linear-gradient(180deg,#d9703f,#4a3f6e 55%,#141731)';
  if (stormy) return 'linear-gradient(180deg,#6a7688,#2c3444)';
  return 'linear-gradient(180deg,#3a7bd5,#5ac8fa 45%,#0d1b3e)';
}

const wxHourLabel = hour => (hour % 12 || 12) + (hour < 12 ? 'AM' : 'PM');

defineApp({
  id: 'weather',
  name: 'Weather',
  bg: 'linear-gradient(180deg,#5ac8fa,#0a63e8)',
  glyph: `<div style="display:grid;place-items:center;height:100%">${wxGlyph('partly', 34)}</div>`,
  darkStatus: true,
  mount(win, inst) {
    const wrap = el('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden';
    const scroller = el('div', 'wx');
    scroller.style.cssText = 'position:relative;flex:1;inset:auto;padding:62px 16px 14px';
    const bar = el('div');
    bar.style.cssText = `flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:10px 22px 28px;color:#fff;border-top:.5px solid rgba(255,255,255,.16)`;
    wrap.append(scroller, bar);
    win.appendChild(wrap);

    inst.render = () => {
      const state = WX();
      state.page = Math.min(state.page, state.cities.length - 1);
      const forecast = wxForecast(state.cities[state.page]);
      win.style.background = wxSky(forecast);
      scroller.scrollTop = 0;
      scroller.innerHTML = '';
      buildWeatherPage(scroller, forecast, inst);

      bar.innerHTML = '';
      const map = el('button', '', SF.map);
      map.style.cssText = 'color:#fff;opacity:.9;display:grid;place-items:center';
      map.onclick = () => openApp('maps');
      const dots = el('div');
      dots.style.cssText = 'display:flex;gap:8px;align-items:center;flex:1;justify-content:center';
      state.cities.forEach((city, index) => {
        const dot = el('button');
        dot.title = city;
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:#fff;
          opacity:${index === state.page ? 1 : 0.42}`;
        dot.onclick = () => { state.page = index; save(); inst.render(); };
        dots.appendChild(dot);
      });
      const list = el('button', '', sf('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>', { w: 2, size: 21 }));
      list.style.cssText = 'color:#fff;opacity:.9;display:grid;place-items:center';
      list.onclick = () => weatherCityList(inst);
      bar.append(map, dots, list);
    };
    inst.render();
  },
  onShow(inst) { inst.render && inst.render(); },
});

function buildWeatherPage(body, forecast, inst) {
  const unit = () => (WX().unit === 'C' ? '°' : '°');
  body.appendChild(h(`<div>
    <div style="font-size:34px;font-weight:400;letter-spacing:-.2px">${esc(forecast.name)}</div>
    <div style="font-size:96px;font-weight:200;line-height:1.05;margin-left:14px">${wxTemp(forecast.now.temp)}${unit()}</div>
    <div style="font-size:20px;opacity:.92;margin-top:-4px">${esc(forecast.now.night ? forecast.now.condition.night : forecast.now.condition.label)}</div>
    <div style="opacity:.86;font-size:19px">H:${wxTemp(forecast.days[0].high)}° L:${wxTemp(forecast.days[0].low)}°</div>
    <div style="opacity:.6;font-size:13px;margin-top:6px">${esc(forecast.region)} · ${timeStr(forecast.localNow)} local</div>
  </div>`));

  /* Hourly */
  const hourly = el('div', 'wx-card');
  hourly.appendChild(h(`<div style="font-size:12px;opacity:.75;margin-bottom:10px;letter-spacing:.4px">
    ${esc(forecast.now.night ? 'Overnight' : 'Hourly')} forecast — ${esc(forecast.days[0].condition.label.toLowerCase())} through the day`.toUpperCase() + '</div>'));
  const hours = el('div', 'wx-hours');
  forecast.hours.slice(0, 24).forEach(entry => {
    hours.appendChild(h(`<div style="text-align:center;flex:none;min-width:44px">
      <div style="font-size:14px;opacity:.85">${entry.first ? 'Now' : esc(wxHourLabel(entry.hour))}</div>
      <div style="display:grid;place-items:center;margin:7px 0">${wxGlyph(entry.condition.id, 24, entry.night)}</div>
      <div style="font-size:17px;font-weight:500">${wxTemp(entry.temp)}°</div></div>`));
  });
  hourly.appendChild(hours);
  body.appendChild(hourly);

  /* Ten day, with range bars scaled across the whole period. */
  const lows = Math.min(...forecast.days.map(d => d.low));
  const highs = Math.max(...forecast.days.map(d => d.high));
  const span = highs - lows || 1;
  const ten = el('div', 'wx-card');
  ten.appendChild(h('<div style="font-size:12px;opacity:.75;margin-bottom:6px;letter-spacing:.4px">10-DAY FORECAST</div>'));
  forecast.days.forEach((day, index) => {
    const left = ((day.low - lows) / span) * 100;
    const width = ((day.high - day.low) / span) * 100;
    const row = h(`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;
      border-bottom:${index < 9 ? '.5px solid rgba(255,255,255,.16)' : 'none'}">
      <div style="width:44px;font-size:17px">${index ? esc(shortDay(day.date)) : 'Today'}</div>
      <div style="width:30px;display:grid;place-items:center">${wxGlyph(day.condition.id, 22)}</div>
      <div style="width:34px;font-size:11px;opacity:.75;text-align:center">${day.rain > 24 ? `${day.rain}%` : ''}</div>
      <div style="width:34px;text-align:right;opacity:.7;font-size:17px">${wxTemp(day.low)}°</div>
      <div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.22);position:relative">
        <div style="position:absolute;left:${left.toFixed(1)}%;width:${Math.max(6, width).toFixed(1)}%;top:0;bottom:0;
          border-radius:3px;background:linear-gradient(90deg,#5ac8fa,#ffd60a,#ff9f0a)"></div></div>
      <div style="width:34px;text-align:right;font-size:17px">${wxTemp(day.high)}°</div></div>`);
    row.style.cursor = 'pointer';
    row.onclick = () => island(wxGlyph(day.condition.id, 18), '#0a84ff', forecast.name,
      `${index ? shortDate(day.date) : 'Today'} · ${day.condition.label} · ${wxTemp(day.high)}°/${wxTemp(day.low)}°`);
    ten.appendChild(row);
  });
  body.appendChild(ten);

  /* Detail tiles */
  const tiles = [
    ['UV Index', String(forecast.uv), forecast.uv > 7 ? 'Very High' : forecast.uv > 5 ? 'High' : forecast.uv > 2 ? 'Moderate' : 'Low'],
    ['Sunset', forecast.sunset, `Sunrise: ${forecast.sunrise}`],
    ['Wind', `${forecast.wind} mph`, `${forecast.windDir} · gusts ${forecast.gust} mph`],
    ['Rainfall', `${forecast.days[0].rain > 24 ? (forecast.days[0].rain / 100).toFixed(2) : '0.00'}"`, 'In last 24h'],
    ['Feels Like', `${wxTemp(forecast.now.temp + (forecast.humidity > 65 ? 4 : -1))}°`, forecast.humidity > 65 ? 'Humidity is making it feel warmer' : 'Similar to the actual temperature'],
    ['Humidity', `${forecast.humidity}%`, `Dew point: ${wxTemp(forecast.dew)}°`],
    ['Visibility', `${forecast.visibility} mi`, forecast.visibility > 8 ? 'Perfectly clear view' : 'Slight haze'],
    ['Pressure', `${forecast.pressure} inHg`, 'Steady'],
  ];
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px';
  tiles.forEach(([label, value, sub]) => {
    grid.appendChild(h(`<div class="wx-card" style="margin:0">
      <div style="font-size:12px;opacity:.75;letter-spacing:.4px">${esc(label.toUpperCase())}</div>
      <div style="font-size:27px;font-weight:500;margin:4px 0 2px">${esc(value)}</div>
      <div style="font-size:12px;opacity:.8;line-height:1.35">${esc(sub)}</div></div>`));
  });
  body.appendChild(grid);
  body.appendChild(h(`<div style="opacity:.55;font-size:12px;padding:20px 4px 40px;line-height:1.5">
    Simulated forecast data, generated on device. Tap the list button to add or remove cities.</div>`));
  inst.at = forecast.name;
}

function weatherCityList(inst) {
  const state = WX();
  sheet(box => {
    box.style.padding = '0';
    const head = el('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 18px 6px';
    head.innerHTML = '<div style="font-size:26px;font-weight:700">Weather</div>';
    const unitToggle = segmented(['°F', '°C'], `°${state.unit}`, choice => {
      state.unit = choice.slice(1); save(); refresh(); inst.render();
    });
    unitToggle.style.width = '96px';
    head.appendChild(unitToggle);
    box.appendChild(head);

    const search = el('div');
    box.appendChild(search);
    const list = el('div');
    list.style.cssText = 'max-height:52vh;overflow-y:auto;padding-bottom:14px';
    box.appendChild(list);

    let query = '';
    search.appendChild(searchField('Search for a city', value => { query = value; refresh(); }));

    function refresh() {
      list.innerHTML = '';
      if (query.trim()) {
        const hits = WX_CITIES.filter(c => (`${c[0]} ${c[1]}`).toLowerCase().includes(query.trim().toLowerCase()));
        if (!hits.length) {
          list.appendChild(emptyState(SF.magnifier, 'No Results', `Nothing matches “${query.trim()}”.`));
          return;
        }
        group(list, {
          rows: hits.map(city => ({
            label: city[0],
            sub: city[1],
            value: state.cities.includes(city[0]) ? 'Added' : '',
            onClick: () => {
              if (!state.cities.includes(city[0])) {
                state.cities.push(city[0]);
                state.page = state.cities.length - 1;
                save();
                toast(`${city[0]} added`);
              } else {
                state.page = state.cities.indexOf(city[0]);
              }
              closeOverlay();
              inst.render();
            },
          })),
        });
        return;
      }

      state.cities.forEach((name, index) => {
        const forecast = wxForecast(name);
        const row = h(`<div style="margin:8px 16px;border-radius:18px;padding:14px 16px;color:#fff;
            background:${wxSky(forecast)};display:flex;align-items:flex-start;gap:10px;cursor:pointer">
          <div style="flex:1;min-width:0">
            <div style="font-size:22px;font-weight:500">${esc(name)}</div>
            <div style="font-size:13px;opacity:.85">${esc(timeStr(forecast.localNow))}</div>
            <div style="font-size:13px;opacity:.9;margin-top:16px">${esc(forecast.now.night ? forecast.now.condition.night : forecast.now.condition.label)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:36px;font-weight:200">${wxTemp(forecast.now.temp)}°</div>
            <div style="font-size:12px;opacity:.85;margin-top:14px">H:${wxTemp(forecast.days[0].high)}° L:${wxTemp(forecast.days[0].low)}°</div>
          </div></div>`);
        row.onclick = () => { state.page = index; save(); closeOverlay(); inst.render(); };
        if (state.cities.length > 1) {
          const remove = el('button', '', '×');
          remove.style.cssText = `position:absolute;top:6px;right:8px;width:24px;height:24px;border-radius:50%;
            background:rgba(0,0,0,.34);color:#fff;font-size:16px;line-height:1`;
          remove.onclick = event => {
            event.stopPropagation();
            state.cities.splice(index, 1);
            state.page = 0;
            save();
            refresh();
            inst.render();
          };
          row.style.position = 'relative';
          row.appendChild(remove);
        }
        list.appendChild(row);
      });
    }
    refresh();
  }, { full: true });
}

/* =========================================================== CALCULATOR === */

function CALC() {
  return slice('calcTape', () => ({ tape: [] }));
}

defineApp({
  id: 'calculator',
  name: 'Calculator',
  bg: 'linear-gradient(180deg,#3a3a3c,#1c1c1e)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">${sf('<rect x="4" y="2.6" width="16" height="18.8" rx="3.4"/><rect x="7" y="5.6" width="10" height="3.4" rx="1.2"/><path d="M8.4 13h.02M12 13h.02M15.6 13h.02M8.4 17h.02M12 17h.02M15.6 17h.02" stroke-width="2.6"/>', { size: 34 })}</div>`,
  darkStatus: true,
  mount(win, inst) {
    win.style.background = '#000';
    const root = el('div', 'calc');
    root.style.paddingTop = '52px';

    /* Mode bar. Its own classes, because `.calc button` is a blanket rule for
       76px orange-and-grey keypad buttons and it swallows anything else placed
       inside .calc — the segmented control came out as two giant grey pills. */
    const modes = el('div', 'calc-bar');
    const tapeButton = el('button', 'calc-tape', SF.history);
    tapeButton.title = 'Calculation history';
    const modeSeg = segmented(['Basic', 'Scientific'], CALC().mode || 'Basic', choice => {
      CALC().mode = choice; save(); build();
    });
    modeSeg.classList.add('calc-modes');
    modes.append(tapeButton, modeSeg);

    const out = el('div', 'out', '0');
    const expression = el('div', 'calc-expr');
    const keys = el('div', 'keys');
    root.append(modes, expression, out, keys);
    win.appendChild(root);

    let current = '0';
    let stored = null;
    let operator = null;
    let fresh = true;
    let memory = 0;

    const trim = value => {
      if (!isFinite(value)) return 'Error';
      const rounded = Math.round(value * 1e10) / 1e10;
      const text = String(rounded);
      return text.length > 12 ? rounded.toPrecision(9).replace(/\.?0+e/, 'e') : text;
    };
    const show = () => {
      out.textContent = current.length > 9 ? trim(parseFloat(current)) : current;
      /* Scientific mode gives half the height to a second keypad, so the
         display starts smaller and steps down from there. */
      const ceiling = CALC().mode === 'Scientific' ? 46 : 80;
      const digits = out.textContent.length;
      const scale = digits > 9 ? 0.6 : digits > 7 ? 0.78 : 1;
      out.style.fontSize = `${Math.round(ceiling * scale)}px`;
      expression.textContent = stored != null && operator
        ? `${stored} ${operator}${fresh ? '' : ` ${current}`}`
        : '';
    };
    const apply = () => {
      const a = parseFloat(stored);
      const b = parseFloat(current);
      const value = operator === '+' ? a + b
        : operator === '−' ? a - b
          : operator === '×' ? a * b
            : operator === '÷' ? a / b
              : operator === 'xʸ' ? a ** b
                : operator === 'ʸ√x' ? a ** (1 / b)
                  : b;
      const text = trim(value);
      CALC().tape.unshift({ line: `${stored} ${operator} ${current}`, value: text, at: Date.now() });
      CALC().tape = CALC().tape.slice(0, 60);
      save();
      return text;
    };
    const unary = (label, fn) => {
      const value = trim(fn(parseFloat(current)));
      CALC().tape.unshift({ line: `${label}(${current})`, value, at: Date.now() });
      CALC().tape = CALC().tape.slice(0, 60);
      save();
      current = value;
      fresh = true;
    };

    const BASIC = [['AC', 'fn'], ['+/−', 'fn'], ['%', 'fn'], ['÷', 'op'],
      ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'],
      ['1'], ['2'], ['3'], ['+', 'op'], ['0', 'zero'], ['.'], ['=', 'op']];
    const SCIENTIFIC = [
      ['(', 'fn'], [')', 'fn'], ['mc', 'fn'], ['m+', 'fn'], ['m−', 'fn'], ['mr', 'fn'],
      ['2ⁿᵈ', 'fn'], ['x²', 'fn'], ['x³', 'fn'], ['xʸ', 'op'], ['eˣ', 'fn'], ['10ˣ', 'fn'],
      ['¹/x', 'fn'], ['²√x', 'fn'], ['³√x', 'fn'], ['ʸ√x', 'op'], ['ln', 'fn'], ['log₁₀', 'fn'],
      ['x!', 'fn'], ['sin', 'fn'], ['cos', 'fn'], ['tan', 'fn'], ['e', 'fn'], ['EE', 'fn'],
      ['Rad', 'fn'], ['sinh', 'fn'], ['cosh', 'fn'], ['tanh', 'fn'], ['π', 'fn'], ['Rand', 'fn'],
    ];

    let degrees = true;
    let pending = [];   // open-paren stack: [stored, operator]

    function press(key) {
      if (/^[0-9]$/.test(key)) { current = (fresh || current === '0') ? key : current + key; fresh = false; }
      else if (key === '.') { if (fresh) { current = '0.'; fresh = false; } else if (!current.includes('.')) current += '.'; }
      else if (key === 'AC') { current = '0'; stored = null; operator = null; pending = []; fresh = true; }
      else if (key === '+/−') current = trim(parseFloat(current) * -1);
      else if (key === '%') current = trim(parseFloat(current) / 100);
      else if (key === '=') {
        while (pending.length) { const [a, op] = pending.pop(); stored = a; operator = op; current = apply(); }
        if (operator) { current = apply(); operator = null; stored = null; }
        fresh = true;
      } else if (key === '(') { pending.push([stored, operator]); stored = null; operator = null; current = '0'; fresh = true; }
      else if (key === ')') {
        if (operator) { current = apply(); operator = null; stored = null; }
        const frame = pending.pop();
        if (frame) { stored = frame[0]; operator = frame[1]; fresh = false; }
      } else if (['+', '−', '×', '÷', 'xʸ', 'ʸ√x'].includes(key)) {
        if (operator && !fresh) current = apply();
        stored = current; operator = key; fresh = true;
      } else if (key === 'mc') { memory = 0; toast('Memory cleared'); }
      else if (key === 'm+') { memory += parseFloat(current); toast(`Memory ${trim(memory)}`); }
      else if (key === 'm−') { memory -= parseFloat(current); toast(`Memory ${trim(memory)}`); }
      else if (key === 'mr') { current = trim(memory); fresh = true; }
      else if (key === 'Rad' || key === 'Deg') { degrees = !degrees; build(); return; }
      else if (key === 'π') { current = trim(Math.PI); fresh = true; }
      else if (key === 'e') { current = trim(Math.E); fresh = true; }
      else if (key === 'Rand') { current = trim(rng(`${CALC().tape.length}:${current}`)()); fresh = true; }
      else if (key === 'EE') { if (!current.includes('e')) { current += 'e'; fresh = false; } }
      else if (key === 'x²') unary('sqr', x => x * x);
      else if (key === 'x³') unary('cube', x => x ** 3);
      else if (key === 'eˣ') unary('exp', Math.exp);
      else if (key === '10ˣ') unary('10^', x => 10 ** x);
      else if (key === '¹/x') unary('1/', x => 1 / x);
      else if (key === '²√x') unary('√', Math.sqrt);
      else if (key === '³√x') unary('∛', Math.cbrt);
      else if (key === 'ln') unary('ln', Math.log);
      else if (key === 'log₁₀') unary('log', Math.log10);
      else if (key === 'x!') unary('fact', x => { let out2 = 1; for (let i = 2; i <= Math.min(170, Math.round(x)); i += 1) out2 *= i; return out2; });
      else if (['sin', 'cos', 'tan'].includes(key)) {
        const fn = { sin: Math.sin, cos: Math.cos, tan: Math.tan }[key];
        unary(key, x => fn(degrees ? x * Math.PI / 180 : x));
      } else if (['sinh', 'cosh', 'tanh'].includes(key)) {
        unary(key, { sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh }[key]);
      } else if (key === '2ⁿᵈ') { toast('Second function set is not simulated'); }
      show();
    }

    /*
     * Two grids, not one. The scientific pad is six columns and the standard
     * pad is four, and flowing the four-column block into a six-column grid was
     * what scrambled the number keys — 9 and × ended up on the same row as 4, 5
     * and 6. Keeping them separate means the digits stay exactly where muscle
     * memory expects them in both modes.
     */
    function build() {
      const scientific = CALC().mode === 'Scientific';
      keys.innerHTML = '';
      // On the root, so the display can shrink to make room for two pads.
      root.classList.toggle('sci', scientific);

      const pad = (entries, columns, compact) => {
        const grid = el('div', 'pad' + (compact ? ' pad-sci' : ''));
        grid.style.gridTemplateColumns = `repeat(${columns},1fr)`;
        entries.forEach(([key, cls]) => {
          const label = key === 'Rad' ? (degrees ? 'Rad' : 'Deg') : key;
          const button = el('button', cls || '', esc(label));
          if (compact) {
            // Long labels like log₁₀ and ʸ√x need to step down a size or two.
            button.style.fontSize = label.length > 3 ? '12px' : label.length > 1 ? '14px' : '19px';
          }
          button.onclick = () => press(key);
          grid.appendChild(button);
        });
        return grid;
      };

      if (scientific) keys.appendChild(pad(SCIENTIFIC, 6, true));
      keys.appendChild(pad(BASIC, 4, false));
      show();
    }

    tapeButton.onclick = () => calculatorTape(() => { current = '0'; fresh = true; show(); });
    build();
    inst.press = press;
  },
});

function calculatorTape(onClear) {
  sheet(box => {
    box.appendChild(h('<div style="font-size:22px;font-weight:700;margin-bottom:4px">Calculation History</div>'));
    const tape = CALC().tape;
    if (!tape.length) {
      box.appendChild(emptyState(SF.history, 'No History', 'Completed calculations are recorded here.'));
      return;
    }
    const list = el('div');
    list.style.cssText = 'max-height:46vh;overflow-y:auto;margin:6px -4px';
    tape.forEach(entry => {
      const row = h(`<div style="padding:11px 6px;border-bottom:.5px solid var(--sep);cursor:pointer">
        <div style="font-size:13px;color:var(--txt2)">${esc(entry.line)}</div>
        <div style="font-size:22px;font-weight:500">${esc(entry.value)}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">${esc(timeStr(new Date(entry.at)))}</div></div>`);
      row.onclick = () => {
        navigator.clipboard && navigator.clipboard.writeText(entry.value).catch(() => {});
        toast('Result copied');
      };
      list.appendChild(row);
    });
    box.appendChild(list);
    const clear = el('button', 'btn-primary', 'Clear History');
    clear.style.cssText += ';background:var(--sysred);margin-top:10px';
    clear.onclick = () => { CALC().tape = []; save(); closeOverlay(); onClear(); toast('History cleared'); };
    box.appendChild(clear);
  });
}

/* ================================================================ NOTES === */

function NT() {
  return slice('notes2', () => ({
    folders: [
      { id: 'notes', name: 'Notes', system: true },
      { id: 'ideas', name: 'Ideas' },
      { id: 'support', name: 'Support Cases' },
    ],
    items: [
      {
        id: 1, folder: 'notes', pinned: true, at: Date.now() - 36e5,
        body: 'Streaming plan\n\nKeep: Spectrum TV (free with service), Max, Netflix\nRotate: Peacock during football, Paramount+ for CBS\nCancel after the season ends.',
      },
      {
        id: 2, folder: 'support', at: Date.now() - 2 * 864e5,
        body: 'Wi-Fi troubleshooting order\n\n☑ Toggle Airplane Mode\n☑ Forget the network and rejoin\n☐ Reset Network Settings\n☐ Check the router for a captive portal\n☐ Escalate to the ISP',
      },
      {
        id: 3, folder: 'ideas', at: Date.now() - 5 * 864e5,
        body: 'Weekend\n\nFarmers market before 9, then the coast road. Bring the film camera.',
      },
    ],
    trash: [],
  }));
}

const noteTitle = note => (note.body.split('\n')[0] || '').trim() || 'New Note';
const notePreview = note => note.body.split('\n').slice(1).join(' ').replace(/[☑☐]/g, '').trim() || 'No additional text';
const notesIn = folder => NT().items.filter(n => n.folder === folder).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at);

defineApp({
  id: 'notes',
  name: 'Notes',
  bg: 'linear-gradient(180deg,#fff2b8,#ffd60a)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#8a6a00">${sf('<path d="M5 4.6h14v10.2L14.2 20H5z"/><path d="M19 14.6h-4.8V20"/><path d="M8.4 9h7.2M8.4 12.4h5"/>', { size: 32 })}</div>`,
  mount(win, inst) {
    NT();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(notesFoldersView());
  },
});

function notesFoldersView() {
  return {
    title: 'Folders',
    largeTitle: true,
    right: [{ html: SF.folder, onClick: nav => newFolderSheet(nav) }],
    build(body, nav) {
      let query = '';
      const results = el('div');
      body.appendChild(searchField('Search all notes', value => { query = value; renderResults(); }));
      body.appendChild(results);
      const rest = el('div');
      body.appendChild(rest);

      function renderResults() {
        results.innerHTML = '';
        rest.style.display = query.trim() ? 'none' : '';
        if (!query.trim()) return;
        const needle = query.trim().toLowerCase();
        const hits = NT().items.filter(n => n.body.toLowerCase().includes(needle));
        if (!hits.length) {
          results.appendChild(emptyState(SF.magnifier, 'No Results', `No notes contain “${query.trim()}”.`));
          return;
        }
        group(results, {
          header: `${hits.length} note${hits.length === 1 ? '' : 's'}`,
          rows: hits.map(note => ({
            label: noteTitle(note),
            sub: `${relativeDay(note.at)} · ${NT().folders.find(f => f.id === note.folder)?.name || 'Notes'}`,
            onClick: () => nav.push(noteEditorView(note)),
          })),
        });
      }

      group(rest, {
        header: 'iCloud',
        rows: NT().folders.map(folder => ({
          icon: SF.folder,
          iconBg: '#ffd60a',
          label: folder.name,
          value: String(notesIn(folder.id).length),
          onClick: () => nav.push(notesListView2(folder)),
        })).concat(NT().trash.length ? [{
          icon: SF.trash,
          iconBg: '#8e8e93',
          label: 'Recently Deleted',
          value: String(NT().trash.length),
          onClick: () => nav.push(notesTrashView()),
        }] : []),
      });
      rest.appendChild(h(`<div class="grp-f">Notes are stored in this browser only. Deleting a note moves it to
        Recently Deleted for 30 days.</div>`));
    },
  };
}

function newFolderSheet(nav) {
  sheet(box => {
    box.appendChild(h('<div style="font-size:20px;font-weight:700;margin-bottom:10px">New Folder</div>'));
    const field = el('div', 'compose-field');
    const input = el('input');
    input.placeholder = 'Name';
    field.appendChild(input);
    box.appendChild(field);
    box.appendChild(primaryButton('Create', () => {
      const name = input.value.trim();
      if (!name) { toast('Enter a name'); return; }
      NT().folders.push({ id: `f${Date.now()}`, name });
      save();
      closeOverlay();
      nav.refresh();
    }));
    setTimeout(() => input.focus(), 320);
  });
}

function notesListView2(folder) {
  return {
    title: folder.name,
    shortTitle: 'Folders',
    largeTitle: true,
    right: [{ html: SF.compose, onClick: nav => {
      const note = { id: Date.now(), folder: folder.id, body: '', at: Date.now() };
      NT().items.unshift(note);
      save();
      nav.push(noteEditorView(note));
    } }],
    build(body, nav) {
      const notes = notesIn(folder.id);
      if (!notes.length) {
        body.appendChild(emptyState(SF.note, 'No Notes', 'Tap the compose button to write one.'));
        return;
      }
      const pinned = notes.filter(n => n.pinned);
      const others = notes.filter(n => !n.pinned);
      const rowFor = note => {
        const row = makeRow({
          labelHTML: `<span style="font-weight:600">${esc(noteTitle(note))}</span>`,
          sub: `${relativeDay(note.at)}  ${notePreview(note).slice(0, 60)}`,
          onClick: () => nav.push(noteEditorView(note)),
        });
        row.oncontextmenu = event => { event.preventDefault(); noteActions(note, nav); };
        const more = el('button', '', '⋯');
        more.style.cssText = 'color:var(--txt2);font-size:18px;padding:0 6px';
        more.onclick = event => { event.stopPropagation(); noteActions(note, nav); };
        row.insertBefore(more, row.querySelector('.chev'));
        return row;
      };
      if (pinned.length) group(body, { header: 'Pinned', rows: pinned.map(rowFor) });
      group(body, { header: pinned.length ? `${others.length} Notes` : `${notes.length} Notes`, rows: others.map(rowFor) });
    },
  };
}

function noteActions(note, nav) {
  actionSheet(noteTitle(note), [
    { text: note.pinned ? 'Unpin Note' : 'Pin Note', onClick: () => { note.pinned = !note.pinned; save(); nav.refresh(); } },
    { text: 'Move to Folder…', onClick: () => moveNoteSheet(note, nav) },
    { text: 'Duplicate', onClick: () => {
      NT().items.unshift({ ...note, id: Date.now(), pinned: false, at: Date.now() });
      save();
      nav.refresh();
    } },
    { text: 'Delete', style: 'red', onClick: () => { deleteNote(note); nav.refresh(); } },
  ]);
}

function moveNoteSheet(note, nav) {
  actionSheet('Move to Folder', NT().folders.filter(f => f.id !== note.folder).map(folder => ({
    text: folder.name,
    onClick: () => { note.folder = folder.id; save(); nav.refresh(); toast(`Moved to ${folder.name}`); },
  })));
}

function deleteNote(note) {
  NT().items = NT().items.filter(n => n.id !== note.id);
  NT().trash.unshift({ ...note, deletedAt: Date.now() });
  save();
  toast('Note deleted');
}

function notesTrashView() {
  return {
    title: 'Recently Deleted',
    shortTitle: 'Folders',
    largeTitle: true,
    build(body, nav) {
      if (!NT().trash.length) {
        body.appendChild(emptyState(SF.trash, 'Nothing Deleted', 'Deleted notes appear here for 30 days.'));
        return;
      }
      group(body, {
        rows: NT().trash.map(note => ({
          label: noteTitle(note),
          sub: `Deleted ${relativeDay(note.deletedAt)}`,
          onClick: () => actionSheet(noteTitle(note), [
            { text: 'Recover', onClick: () => {
              NT().trash = NT().trash.filter(n => n.id !== note.id);
              NT().items.unshift({ ...note, at: Date.now() });
              save();
              nav.refresh();
              toast('Note recovered');
            } },
            { text: 'Delete Permanently', style: 'red', onClick: () => {
              NT().trash = NT().trash.filter(n => n.id !== note.id);
              save();
              nav.refresh();
            } },
          ]),
        })),
      });
      const empty = el('button', 'btn-primary', 'Delete All');
      empty.style.cssText += ';background:var(--sysred);margin:16px';
      empty.onclick = () => alertBox({
        title: 'Delete All Notes?',
        message: 'This cannot be undone.',
        buttons: [{ text: 'Cancel' }, { text: 'Delete All', style: 'red', onClick: () => { NT().trash = []; save(); nav.pop(); } }],
      });
      body.appendChild(empty);
    },
  };
}

function noteEditorView(note) {
  return {
    title: '',
    backLabel: NT().folders.find(f => f.id === note.folder)?.name || 'Notes',
    right: [
      { html: SF.trash, onClick: nav => { deleteNote(note); nav.pop(); } },
      { html: '<b>Done</b>', onClick: nav => nav.pop() },
    ],
    build(body) {
      const meta = el('div');
      meta.style.cssText = 'text-align:center;font-size:12px;color:var(--txt3);padding:4px 0 2px';
      meta.textContent = `${relativeDay(note.at)} at ${timeStr(new Date(note.at))}`;
      body.appendChild(meta);

      const area = el('textarea', 'note-editor');
      area.value = note.body;
      area.placeholder = 'Start typing…';
      area.style.minHeight = '54vh';
      area.oninput = () => { note.body = area.value; note.at = Date.now(); save(); };
      body.appendChild(area);

      /* Formatting bar: checklists, bullets and a heading, all plain text so
         the note stays readable everywhere. */
      const bar = el('div');
      bar.style.cssText = `position:sticky;bottom:0;display:flex;gap:6px;padding:8px 12px;background:var(--group);
        border-top:.5px solid var(--sep);flex-wrap:wrap`;
      const insert = (prefix, label) => {
        const button = el('button', '', label);
        button.style.cssText = `flex:1;min-width:56px;background:var(--bg3);color:var(--txt);border-radius:9px;
          padding:9px 6px;font-size:13px`;
        button.onclick = () => {
          const start = area.value.lastIndexOf('\n', Math.max(0, area.selectionStart - 1)) + 1;
          area.value = `${area.value.slice(0, start)}${prefix}${area.value.slice(start)}`;
          note.body = area.value;
          note.at = Date.now();
          save();
          area.focus();
          area.setSelectionRange(area.value.length, area.value.length);
        };
        return button;
      };
      bar.append(
        insert('☐ ', '☐ Checklist'),
        insert('• ', '• Bullet'),
        insert('— ', '— Divider'),
      );
      const toggle = el('button', '', 'Toggle ☐/☑');
      toggle.style.cssText = `flex:1;min-width:56px;background:var(--bg3);color:var(--txt);border-radius:9px;
        padding:9px 6px;font-size:13px`;
      toggle.onclick = () => {
        const lineStart = area.value.lastIndexOf('\n', Math.max(0, area.selectionStart - 1)) + 1;
        const lineEnd = area.value.indexOf('\n', lineStart) === -1 ? area.value.length : area.value.indexOf('\n', lineStart);
        const line = area.value.slice(lineStart, lineEnd);
        if (!/^[☐☑]/.test(line)) { toast('Put the cursor on a checklist line'); return; }
        const flipped = line.startsWith('☐') ? line.replace('☐', '☑') : line.replace('☑', '☐');
        area.value = area.value.slice(0, lineStart) + flipped + area.value.slice(lineEnd);
        note.body = area.value;
        save();
      };
      bar.appendChild(toggle);
      body.appendChild(bar);
      setTimeout(() => area.focus(), 340);
    },
    onPop() { save(); },
  };
}

/* ============================================================== COMPASS === */

defineApp({
  id: 'compass',
  name: 'Compass',
  bg: 'linear-gradient(180deg,#2c2c2e,#0a0a0c)',
  darkStatus: true,
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">${sf('<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-1.9 5.3-5.3 1.9 1.9-5.3z" fill="currentColor" stroke="none"/>', { size: 34 })}</div>`,
  mount(win, inst) {
    win.style.background = 'radial-gradient(circle at 50% 34%,#2c2c2e,#000 70%)';
    const wrap = el('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;color:#fff;padding:64px 20px 30px;overflow-y:auto';
    wrap.innerHTML = `
      <div id="cpDial" style="position:relative;width:min(300px,86vw);aspect-ratio:1;flex:none"></div>
      <div id="cpRead" style="font-size:44px;font-weight:200;margin-top:14px;letter-spacing:1px"></div>
      <div id="cpPlace" style="color:rgba(235,235,245,.6);font-size:14px;text-align:center;line-height:1.5;margin-top:6px"></div>
      <div id="cpLevel" style="margin-top:18px;width:100%;max-width:320px"></div>`;
    win.appendChild(wrap);

    const dial = $('#cpDial', wrap);
    const readout = $('#cpRead', wrap);
    const place = $('#cpPlace', wrap);
    const level = $('#cpLevel', wrap);

    /* Static rose, rotated as a whole; the needle stays put like the real app. */
    const ticks = Array.from({ length: 72 }, (_, index) => {
      const major = index % 6 === 0;
      const cardinal = index % 18 === 0;
      return `<line x1="100" y1="${cardinal ? 12 : major ? 14 : 16}" x2="100" y2="${major ? 24 : 21}"
        stroke="${cardinal ? '#fff' : major ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.3)'}"
        stroke-width="${cardinal ? 2.4 : major ? 1.6 : 1}" transform="rotate(${index * 5} 100 100)"/>`;
    }).join('');
    const labels = [['N', 0, '#ff453a'], ['E', 90], ['S', 180], ['W', 270]].map(([text, angle, colour]) =>
      `<g transform="rotate(${angle} 100 100)"><text x="100" y="42" text-anchor="middle"
        font-size="17" font-weight="600" fill="${colour || '#fff'}"
        transform="rotate(${-angle} 100 42)">${text}</text></g>`).join('');
    const degreeLabels = [30, 60, 120, 150, 210, 240, 300, 330].map(angle =>
      `<g transform="rotate(${angle} 100 100)"><text x="100" y="40" text-anchor="middle" font-size="11"
        fill="rgba(235,235,245,.55)" transform="rotate(${-angle} 100 40)">${angle}</text></g>`).join('');

    dial.innerHTML = `
      <svg viewBox="0 0 200 200" style="position:absolute;inset:0;width:100%;height:100%">
        <circle cx="100" cy="100" r="96" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.1)"/>
        <g id="cpRose">${ticks}${labels}${degreeLabels}
          <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,.1)"/>
          <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(255,255,255,.08)"/>
        </g>
        <path d="M100 6 l7 15 h-14z" fill="#ff453a"/>
        <line x1="100" y1="100" x2="100" y2="100" stroke="none"/>
        <circle cx="100" cy="100" r="3" fill="#fff"/>
      </svg>`;
    const rose = $('#cpRose', dial);

    let heading = 34;
    let target = 34;
    let tilt = { x: 0, y: 0 };
    let usingSensor = false;

    const cardinalOf = degrees => {
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return names[Math.round(degrees / 45) % 8];
    };

    function draw() {
      rose.setAttribute('transform', `rotate(${-heading} 100 100)`);
      readout.textContent = `${Math.round(heading)}° ${cardinalOf(heading)}`;
      place.innerHTML = `Orlando, Florida<br>28°32'18" N, 81°22'44" W · 82 ft elevation
        <br><span style="color:rgba(235,235,245,.3);font-size:12px">${usingSensor ? 'Live device orientation' : 'Simulated heading — no magnetometer available'}</span>`;

      const bubbleX = Math.max(-1, Math.min(1, tilt.x / 30));
      const bubbleY = Math.max(-1, Math.min(1, tilt.y / 30));
      const flat = Math.abs(bubbleX) < 0.06 && Math.abs(bubbleY) < 0.06;
      level.innerHTML = `
        <div style="font-size:11px;letter-spacing:.5px;color:rgba(235,235,245,.4);margin-bottom:8px;text-align:center">LEVEL</div>
        <div style="position:relative;height:120px;border-radius:16px;background:rgba(255,255,255,.06);
            border:.5px solid rgba(255,255,255,.12);overflow:hidden">
          <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.16)"></div>
          <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(255,255,255,.16)"></div>
          <div style="position:absolute;left:${(50 + bubbleX * 40).toFixed(1)}%;top:${(50 + bubbleY * 40).toFixed(1)}%;
            width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
            background:${flat ? 'rgba(48,209,88,.85)' : 'rgba(255,255,255,.28)'};
            border:1px solid rgba(255,255,255,.4);transition:left .12s linear,top .12s linear,background .2s"></div>
          <div style="position:absolute;inset:auto 0 8px;text-align:center;font-size:13px;color:rgba(235,235,245,.6)">
            ${flat ? 'Level' : `${Math.round(Math.hypot(tilt.x, tilt.y))}° off level`}</div>
        </div>`;
    }

    /* Real sensors when the browser offers them, a gentle drift otherwise, so
       the dial is never dead. */
    const onOrientation = event => {
      if (event.alpha == null && event.beta == null) return;
      usingSensor = true;
      if (event.alpha != null) target = (360 - event.alpha) % 360;
      tilt = { x: event.gamma || 0, y: event.beta || 0 };
    };
    window.addEventListener('deviceorientation', onOrientation);

    /* One interval for the life of the app. It stops itself if the window is
       ever torn down, and idles while the app is in the background. */
    let step = 0;
    inst.timer = setInterval(() => {
      if (!win.isConnected) {
        clearInterval(inst.timer);
        window.removeEventListener('deviceorientation', onOrientation);
        return;
      }
      if (win.style.display === 'none') return;
      step += 1;
      if (!usingSensor) {
        target = (34 + Math.sin(step / 22) * 26 + Math.sin(step / 7) * 3 + 360) % 360;
        tilt = { x: Math.sin(step / 15) * 7, y: Math.cos(step / 19) * 5 };
      }
      // Shortest-path easing so the needle never spins the long way round 0°.
      let delta = ((target - heading + 540) % 360) - 180;
      heading = (heading + delta * 0.16 + 360) % 360;
      draw();
    }, 60);
    draw();

    /* Tapping the dial locks a bearing, like holding a course in the real app. */
    dial.onclick = () => {
      island(SF.compass, '#ff453a', 'Compass', `Bearing locked at ${Math.round(heading)}° ${cardinalOf(heading)}`);
    };
  },
});

/* ============================================================ TRANSLATE === */

/*
 * On-device phrasebooks. Real Translate needs a downloaded language pack and
 * only handles what it has; this mirrors that honestly rather than inventing
 * translations it cannot make.
 */
const TR_LANGUAGES = [
  { code: 'en', name: 'English (US)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese (BR)' },
  { code: 'ja', name: 'Japanese' },
];

const TR_PHRASES = [
  ['hello', { es: 'hola', fr: 'bonjour', de: 'hallo', it: 'ciao', pt: 'olá', ja: 'こんにちは' }],
  ['good morning', { es: 'buenos días', fr: 'bonjour', de: 'guten Morgen', it: 'buongiorno', pt: 'bom dia', ja: 'おはようございます' }],
  ['good night', { es: 'buenas noches', fr: 'bonne nuit', de: 'gute Nacht', it: 'buonanotte', pt: 'boa noite', ja: 'おやすみなさい' }],
  ['thank you', { es: 'gracias', fr: 'merci', de: 'danke', it: 'grazie', pt: 'obrigado', ja: 'ありがとう' }],
  ['please', { es: 'por favor', fr: 's’il vous plaît', de: 'bitte', it: 'per favore', pt: 'por favor', ja: 'お願いします' }],
  ['excuse me', { es: 'disculpe', fr: 'excusez-moi', de: 'entschuldigung', it: 'mi scusi', pt: 'com licença', ja: 'すみません' }],
  ['yes', { es: 'sí', fr: 'oui', de: 'ja', it: 'sì', pt: 'sim', ja: 'はい' }],
  ['no', { es: 'no', fr: 'non', de: 'nein', it: 'no', pt: 'não', ja: 'いいえ' }],
  ['how are you', { es: '¿cómo estás?', fr: 'comment allez-vous ?', de: 'wie geht es dir?', it: 'come stai?', pt: 'como vai?', ja: 'お元気ですか' }],
  ['my name is', { es: 'me llamo', fr: 'je m’appelle', de: 'ich heiße', it: 'mi chiamo', pt: 'meu nome é', ja: '私の名前は' }],
  ['i do not understand', { es: 'no entiendo', fr: 'je ne comprends pas', de: 'ich verstehe nicht', it: 'non capisco', pt: 'não entendo', ja: 'わかりません' }],
  ['do you speak english', { es: '¿habla inglés?', fr: 'parlez-vous anglais ?', de: 'sprechen Sie Englisch?', it: 'parla inglese?', pt: 'você fala inglês?', ja: '英語を話せますか' }],
  ['where is the bathroom', { es: '¿dónde está el baño?', fr: 'où sont les toilettes ?', de: 'wo ist die Toilette?', it: 'dov’è il bagno?', pt: 'onde é o banheiro?', ja: 'トイレはどこですか' }],
  ['how much does it cost', { es: '¿cuánto cuesta?', fr: 'combien ça coûte ?', de: 'wie viel kostet das?', it: 'quanto costa?', pt: 'quanto custa?', ja: 'いくらですか' }],
  ['i need help', { es: 'necesito ayuda', fr: 'j’ai besoin d’aide', de: 'ich brauche Hilfe', it: 'ho bisogno di aiuto', pt: 'preciso de ajuda', ja: '助けが必要です' }],
  ['the wifi is not working', { es: 'el wifi no funciona', fr: 'le wifi ne fonctionne pas', de: 'das WLAN funktioniert nicht', it: 'il wifi non funziona', pt: 'o wifi não está funcionando', ja: 'Wi-Fiが動きません' }],
  ['what is the password', { es: '¿cuál es la contraseña?', fr: 'quel est le mot de passe ?', de: 'wie lautet das Passwort?', it: 'qual è la password?', pt: 'qual é a senha?', ja: 'パスワードは何ですか' }],
  ['my phone is broken', { es: 'mi teléfono está roto', fr: 'mon téléphone est cassé', de: 'mein Telefon ist kaputt', it: 'il mio telefono è rotto', pt: 'meu telefone está quebrado', ja: '電話が壊れています' }],
  ['call an ambulance', { es: 'llame a una ambulancia', fr: 'appelez une ambulance', de: 'rufen Sie einen Krankenwagen', it: 'chiami un’ambulanza', pt: 'chame uma ambulância', ja: '救急車を呼んでください' }],
  ['where is the airport', { es: '¿dónde está el aeropuerto?', fr: 'où est l’aéroport ?', de: 'wo ist der Flughafen?', it: 'dov’è l’aeroporto?', pt: 'onde é o aeroporto?', ja: '空港はどこですか' }],
  ['one moment', { es: 'un momento', fr: 'un instant', de: 'einen Moment', it: 'un momento', pt: 'um momento', ja: '少し待ってください' }],
  ['good bye', { es: 'adiós', fr: 'au revoir', de: 'auf Wiedersehen', it: 'arrivederci', pt: 'tchau', ja: 'さようなら' }],
  ['water', { es: 'agua', fr: 'eau', de: 'Wasser', it: 'acqua', pt: 'água', ja: '水' }],
  ['coffee', { es: 'café', fr: 'café', de: 'Kaffee', it: 'caffè', pt: 'café', ja: 'コーヒー' }],
  ['the check please', { es: 'la cuenta, por favor', fr: 'l’addition, s’il vous plaît', de: 'die Rechnung, bitte', it: 'il conto, per favore', pt: 'a conta, por favor', ja: 'お会計をお願いします' }],
  ['today', { es: 'hoy', fr: 'aujourd’hui', de: 'heute', it: 'oggi', pt: 'hoje', ja: '今日' }],
  ['tomorrow', { es: 'mañana', fr: 'demain', de: 'morgen', it: 'domani', pt: 'amanhã', ja: '明日' }],
  ['thank you very much', { es: 'muchas gracias', fr: 'merci beaucoup', de: 'vielen Dank', it: 'grazie mille', pt: 'muito obrigado', ja: '本当にありがとう' }],
];

function TR() {
  return slice('translate', () => ({
    from: 'en', to: 'es', downloaded: ['es', 'fr'], history: [], favourites: [],
  }));
}

const trName = code => TR_LANGUAGES.find(l => l.code === code)?.name || code;

/** Look up a phrase. Returns null when the pack cannot handle it. */
function trLookup(text, from, to) {
  const needle = text.trim().toLowerCase().replace(/[?.!¡¿]+$/g, '');
  if (!needle) return null;
  if (from === to) return text.trim();
  const forward = TR_PHRASES.find(([key]) => key === needle);
  if (from === 'en' && forward) return forward[1][to] || null;
  if (to === 'en') {
    const back = TR_PHRASES.find(([, map]) => Object.values(map).some(v => v.toLowerCase().replace(/[?.!¡¿]+$/g, '') === needle));
    if (back) return back[0];
  }
  // Word-by-word as a last resort, only if every word is known.
  const words = needle.split(/\s+/);
  if (words.length > 1 && from === 'en') {
    const parts = words.map(word => TR_PHRASES.find(([key]) => key === word)?.[1][to]);
    if (parts.every(Boolean)) return parts.join(' ');
  }
  return null;
}

defineApp({
  id: 'translate',
  name: 'Translate',
  bg: 'linear-gradient(180deg,#5ac8fa,#0a63e8)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff;font-size:26px;font-weight:600">文</div>`,
  mount(win, inst) {
    TR();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(translateView());
  },
});

function translateView() {
  const tabs = ['Translation', 'Camera', 'Conversation'];
  return {
    title: 'Translate',
    largeTitle: true,
    right: [{ html: SF.gear, onClick: nav => nav.push(translateLanguagesView()) }],
    build(body, nav) {
      const state = TR();
      let tab = state.tab || tabs[0];
      const seg = segmented(tabs, tab, choice => { state.tab = choice; save(); nav.refresh(); });
      const segWrap = el('div');
      segWrap.style.padding = '0 16px 8px';
      segWrap.appendChild(seg);
      body.appendChild(segWrap);

      if (tab === 'Camera') {
        body.appendChild(emptyState(SF.camera, 'Point at Text',
          'Live camera translation needs a real camera feed, so it is not simulated here. Type into the Translation tab instead.'));
        body.appendChild(primaryButton('Open Camera', () => openApp('camera')));
        return;
      }

      /* Language selector */
      const picker = el('div');
      picker.style.cssText = `display:flex;align-items:center;gap:8px;margin:0 16px 12px;padding:10px 12px;
        border-radius:14px;background:var(--group)`;
      const sideButton = (code, key) => {
        const button = el('button', '', `<div style="font-size:15px;font-weight:600">${esc(trName(code))}</div>
          <div style="font-size:11px;color:var(--txt3)">${state.downloaded.includes(code) || code === 'en' ? 'On device' : 'Not downloaded'}</div>`);
        button.style.cssText = 'flex:1;min-width:0;text-align:left;color:var(--txt)';
        button.onclick = () => actionSheet(key === 'from' ? 'Translate From' : 'Translate To',
          TR_LANGUAGES.map(language => ({
            text: language.name + (state.downloaded.includes(language.code) || language.code === 'en' ? '' : ' (not downloaded)'),
            onClick: () => { state[key] = language.code; save(); nav.refresh(); },
          })));
        return button;
      };
      const swap = el('button', '', '⇄');
      swap.style.cssText = 'width:38px;height:38px;border-radius:50%;background:var(--bg3);color:var(--sysblue);font-size:18px;flex:none';
      swap.onclick = () => { const from = state.from; state.from = state.to; state.to = from; save(); nav.refresh(); };
      picker.append(sideButton(state.from, 'from'), swap, sideButton(state.to, 'to'));
      body.appendChild(picker);

      if (tab === 'Conversation') {
        body.appendChild(h(`<div style="margin:0 16px 10px;font-size:13px;color:var(--txt2);line-height:1.5">
          Conversation mode alternates languages automatically. Type a line and it is translated into the other
          language, then the sides swap.</div>`));
      }

      /* Input */
      const input = el('textarea');
      input.placeholder = `Enter text in ${trName(state.from)}`;
      input.style.cssText = `width:calc(100% - 32px);margin:0 16px;min-height:96px;background:var(--group);
        border-radius:14px;padding:14px;font-size:20px;color:var(--txt);resize:none;line-height:1.35`;
      body.appendChild(input);

      const result = el('div');
      body.appendChild(result);

      const translate = () => {
        const text = input.value.trim();
        result.innerHTML = '';
        if (!text) { toast('Enter something to translate'); return; }
        if (state.to !== 'en' && !state.downloaded.includes(state.to)) {
          result.appendChild(h(`<div style="margin:14px 16px;padding:14px;border-radius:14px;background:var(--group)">
            <div style="font-weight:600;margin-bottom:4px">${esc(trName(state.to))} is not downloaded</div>
            <div style="font-size:14px;color:var(--txt2);line-height:1.45">On-device translation needs the language pack.
              Download it in the settings button at the top right.</div></div>`));
          return;
        }
        const output = trLookup(text, state.from, state.to);
        if (!output) {
          result.appendChild(h(`<div style="margin:14px 16px;padding:14px;border-radius:14px;background:var(--group)">
            <div style="font-weight:600;margin-bottom:4px">No on-device translation</div>
            <div style="font-size:14px;color:var(--txt2);line-height:1.45">The offline pack covers common phrases only.
              Try “hello”, “thank you”, “where is the bathroom” or “the wifi is not working”.</div></div>`));
          return;
        }
        state.history.unshift({ text, output, from: state.from, to: state.to, at: Date.now() });
        state.history = state.history.slice(0, 40);
        save();

        const card2 = el('div');
        card2.style.cssText = 'margin:14px 16px;padding:16px;border-radius:14px;background:var(--group)';
        card2.innerHTML = `<div style="font-size:12px;color:var(--txt3);margin-bottom:6px">${esc(trName(state.to)).toUpperCase()}</div>
          <div style="font-size:26px;line-height:1.3">${esc(output)}</div>`;
        const tools = el('div');
        tools.style.cssText = 'display:flex;gap:16px;margin-top:14px;color:var(--sysblue)';
        const tool = (label, onClick) => { const b = el('button', '', label); b.style.color = 'var(--sysblue)'; b.style.fontSize = '14px'; b.onclick = onClick; return b; };
        tools.append(
          tool('Play', () => island(SF.speaker, '#0a84ff', 'Translate', `Speaking in ${trName(state.to)}`)),
          tool('Copy', () => { navigator.clipboard && navigator.clipboard.writeText(output).catch(() => {}); toast('Copied'); }),
          tool(state.favourites.some(f => f.output === output) ? 'Favourited' : 'Favourite', () => {
            if (!state.favourites.some(f => f.output === output)) state.favourites.unshift({ text, output, from: state.from, to: state.to });
            save();
            nav.refresh();
            toast('Added to favourites');
          }),
        );
        card2.appendChild(tools);
        result.appendChild(card2);

        if (tab === 'Conversation') {
          const from = state.from;
          state.from = state.to;
          state.to = from;
          save();
          setTimeout(() => nav.refresh(), 900);
        }
      };

      const go = primaryButton('Translate', translate);
      body.appendChild(go);
      input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); translate(); } };

      /* Phrasebook, favourites, history */
      const suggestions = TR_PHRASES.slice(0, 8).map(([key]) => key);
      body.appendChild(cardHeader('Try'));
      const chips = el('div');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:0 16px';
      suggestions.forEach(phrase => {
        const chip = el('button', '', esc(phrase));
        chip.style.cssText = 'background:var(--bg3);color:var(--txt);border-radius:16px;padding:7px 13px;font-size:13px';
        chip.onclick = () => { input.value = phrase; translate(); };
        chips.appendChild(chip);
      });
      body.appendChild(chips);

      if (state.favourites.length) {
        group(body, {
          header: 'Favourites',
          rows: state.favourites.map(entry => ({
            labelHTML: `<div>${esc(entry.output)}</div><div class="sub">${esc(entry.text)} · ${esc(trName(entry.from))} → ${esc(trName(entry.to))}</div>`,
            onClick: () => { input.value = entry.text; state.from = entry.from; state.to = entry.to; save(); nav.refresh(); },
          })),
        });
      }
      if (state.history.length) {
        group(body, {
          header: 'Recent',
          rows: state.history.slice(0, 8).map(entry => ({
            labelHTML: `<div>${esc(entry.output)}</div><div class="sub">${esc(entry.text)}</div>`,
            onClick: () => { input.value = entry.text; translate(); },
          })),
        });
        const clear = makeRow({ label: 'Clear History', cls: 'center', onClick: () => { state.history = []; save(); nav.refresh(); } });
        clear.style.justifyContent = 'center';
        clear.style.color = 'var(--sysred)';
        const wrap = el('div', 'grp');
        wrap.appendChild(clear);
        body.appendChild(wrap);
      }
      body.appendChild(el('div', '', '<div style="height:30px"></div>'));
    },
  };
}

function translateLanguagesView() {
  return {
    title: 'Downloaded Languages',
    shortTitle: 'Translate',
    build(body, nav) {
      const state = TR();
      group(body, {
        header: 'On device',
        footer: 'Downloaded languages work with no network connection. English is always available.',
        rows: TR_LANGUAGES.filter(l => l.code !== 'en').map(language => ({
          label: language.name,
          sub: state.downloaded.includes(language.code) ? 'Downloaded · 41 MB' : 'Not downloaded',
          rightHTML: state.downloaded.includes(language.code)
            ? '<span style="color:var(--sysblue);font-size:14px">Remove</span>'
            : '<span style="color:var(--sysblue);font-size:14px">Download</span>',
          chevron: false,
          onClick: () => {
            if (state.downloaded.includes(language.code)) {
              state.downloaded = state.downloaded.filter(code => code !== language.code);
              toast(`${language.name} removed`);
            } else {
              state.downloaded.push(language.code);
              island('文', '#0a84ff', 'Translate', `${language.name} downloaded`);
            }
            save();
            nav.refresh();
          },
        })),
      });
      group(body, {
        rows: [{
          label: 'On-Device Mode',
          sub: 'Translate without a network connection',
          toggle: () => state.onDevice !== false,
          onToggle: value => { state.onDevice = value; save(); },
        }],
      });
    },
  };
}

/* =============================================================== STOCKS === */

const STOCK_LIST = [
  ['AAPL', 'Apple Inc.', 224, 'Technology'],
  ['MSFT', 'Microsoft Corporation', 428, 'Technology'],
  ['GOOGL', 'Alphabet Inc.', 176, 'Communication Services'],
  ['AMZN', 'Amazon.com, Inc.', 186, 'Consumer Cyclical'],
  ['NVDA', 'NVIDIA Corporation', 121, 'Semiconductors'],
  ['TSLA', 'Tesla, Inc.', 248, 'Automotive'],
  ['META', 'Meta Platforms, Inc.', 512, 'Communication Services'],
  ['NFLX', 'Netflix, Inc.', 682, 'Entertainment'],
  ['DIS', 'The Walt Disney Company', 94, 'Entertainment'],
  ['CHTR', 'Charter Communications', 342, 'Telecom'],
  ['T', 'AT&T Inc.', 19, 'Telecom'],
  ['VZ', 'Verizon Communications', 41, 'Telecom'],
  ['CMCSA', 'Comcast Corporation', 39, 'Telecom'],
  ['^DJI', 'Dow Jones Industrial Average', 40800, 'Index'],
  ['^GSPC', 'S&P 500', 5540, 'Index'],
  ['^IXIC', 'NASDAQ Composite', 17600, 'Index'],
  ['BTC-USD', 'Bitcoin USD', 61200, 'Cryptocurrency'],
];

const STOCK_RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '2Y'];

function ST() {
  return slice('stocks', () => ({
    watch: ['AAPL', 'MSFT', 'NVDA', 'TSLA', '^DJI', 'BTC-USD'],
    range: '1D',
  }));
}

const stockInfo = symbol => STOCK_LIST.find(s => s[0] === symbol) || ['?', 'Unknown', 100, ''];

/**
 * Deterministic price series. A random walk seeded by symbol and day, so the
 * chart and the quote always agree and hold still between renders.
 */
function stockSeries(symbol, range = '1D') {
  const [, , base] = stockInfo(symbol);
  const points = { '1D': 78, '1W': 35, '1M': 30, '3M': 45, '6M': 52, '1Y': 52, '2Y': 60 }[range] || 40;
  const drift = { '1D': 0.004, '1W': 0.012, '1M': 0.03, '3M': 0.06, '6M': 0.09, '1Y': 0.14, '2Y': 0.2 }[range];
  const day = Math.floor(Date.now() / 864e5);
  const random = rng(`${symbol}:${day}:${range}`);
  let value = base * (1 - drift * (random() * 1.3 - 0.4));
  const values = [];
  for (let index = 0; index < points; index += 1) {
    value *= 1 + (random() - 0.485) * drift * 0.9;
    values.push(value);
  }
  // Anchor the last point of every range to one shared "current" price.
  const todayRandom = rng(`${symbol}:${day}:now`);
  const current = base * (1 + (todayRandom() - 0.5) * 0.06);
  const scale = current / values[values.length - 1];
  return values.map(v => v * scale);
}

function stockQuote(symbol) {
  const series = stockSeries(symbol, '1D');
  const current = series[series.length - 1];
  const open = series[0];
  return {
    symbol,
    name: stockInfo(symbol)[1],
    price: current,
    change: current - open,
    percent: ((current - open) / open) * 100,
    series,
  };
}

const stockPrice = value => (value >= 1000
  ? value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  : value.toFixed(2));

defineApp({
  id: 'stocks',
  name: 'Stocks',
  bg: '#0a0a0c',
  darkStatus: true,
  glyph: `<div style="display:grid;place-items:center;height:100%">
    <svg viewBox="0 0 32 32" style="width:32px;height:32px">
      <path d="M3 24l6-7 5 4 6-9 4 3 5-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M25 3h5v5" fill="none" stroke="#30d158" stroke-width="2.4" stroke-linecap="round"/></svg></div>`,
  mount(win, inst) {
    ST();
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot(stocksListView());
  },
});

function stocksListView() {
  return {
    title: 'Stocks',
    largeTitle: true,
    right: [{ html: SF.plusCircle, onClick: nav => addStockSheet(nav) }],
    build(body, nav) {
      const state = ST();
      body.appendChild(h(`<div style="padding:0 20px 10px;color:var(--txt2);font-size:13px">
        ${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))} ·
        simulated market data</div>`));

      const list = el('div', 'grp');
      list.style.margin = '0 12px';
      state.watch.forEach(symbol => {
        const quote = stockQuote(symbol);
        const up = quote.change >= 0;
        const row = el('div', 'row');
        row.style.alignItems = 'center';
        row.innerHTML = `
          <div style="flex:1;min-width:0">
            <div style="font-size:17px;font-weight:600">${esc(symbol)}</div>
            <div style="font-size:13px;color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(quote.name)}</div>
          </div>
          <div style="width:76px;flex:none;padding:0 8px">${lineSVG(quote.series, { colour: up ? '#30d158' : '#ff453a', w: 76, h: 34, fill: false })}</div>
          <div style="text-align:right;flex:none;min-width:92px">
            <div style="font-size:17px;font-weight:500">${esc(stockPrice(quote.price))}</div>
            <div style="display:inline-block;margin-top:3px;font-size:13px;font-weight:600;color:#fff;
              background:${up ? '#30d158' : '#ff453a'};border-radius:6px;padding:2px 6px;min-width:64px;text-align:center">
              ${up ? '+' : ''}${quote.percent.toFixed(2)}%</div>
          </div>`;
        row.onclick = () => nav.push(stockDetailView(symbol));
        row.oncontextmenu = event => {
          event.preventDefault();
          actionSheet(symbol, [{
            text: 'Remove from Watchlist',
            style: 'red',
            onClick: () => { state.watch = state.watch.filter(s => s !== symbol); save(); nav.refresh(); },
          }]);
        };
        list.appendChild(row);
      });
      body.appendChild(list);

      /* Business news, generated from the day's movers. */
      body.appendChild(cardHeader('Business News'));
      const movers = state.watch.map(stockQuote).sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent)).slice(0, 4);
      movers.forEach((quote, index) => {
        const up = quote.change >= 0;
        const headline = [
          `${quote.name} ${up ? 'climbs' : 'slips'} ${Math.abs(quote.percent).toFixed(1)}% as traders weigh guidance`,
          `Analysts revisit ${quote.symbol} after ${up ? 'a strong' : 'a soft'} session`,
          `${quote.symbol} ${up ? 'leads' : 'lags'} the tape in midday trading`,
          `What ${quote.name}’s move means for the sector`,
        ][index % 4];
        const item = h(`<div style="margin:10px 16px;padding:14px;border-radius:14px;background:var(--group);cursor:pointer">
          <div style="font-size:12px;color:var(--txt3);margin-bottom:5px">SIMULATED WIRE · ${esc(timeStr(new Date(Date.now() - index * 42e5)))}</div>
          <div style="font-size:16px;font-weight:600;line-height:1.35">${esc(headline)}</div>
          <div style="margin-top:8px;font-size:13px;color:var(--txt2)">${esc(quote.symbol)} ${up ? '+' : ''}${quote.percent.toFixed(2)}%</div></div>`);
        item.onclick = () => nav.push(stockDetailView(quote.symbol));
        body.appendChild(item);
      });
      body.appendChild(h('<div style="height:26px"></div>'));
    },
  };
}

function addStockSheet(nav) {
  sheet(box => {
    box.style.padding = '0';
    box.appendChild(h('<div style="font-size:22px;font-weight:700;padding:16px 18px 2px">Add to Watchlist</div>'));
    const results = el('div');
    results.style.cssText = 'max-height:52vh;overflow-y:auto;padding-bottom:16px';
    let query = '';
    box.appendChild(searchField('Search symbol or company', value => { query = value; refresh(); }));
    box.appendChild(results);

    function refresh() {
      const state = ST();
      const needle = query.trim().toLowerCase();
      const hits = STOCK_LIST.filter(([symbol, name]) => !needle || `${symbol} ${name}`.toLowerCase().includes(needle));
      results.innerHTML = '';
      if (!hits.length) {
        results.appendChild(emptyState(SF.magnifier, 'No Symbols', 'This simulator ships a fixed catalogue of tickers.'));
        return;
      }
      group(results, {
        rows: hits.map(([symbol, name, , sector]) => ({
          label: symbol,
          sub: `${name} · ${sector}`,
          value: state.watch.includes(symbol) ? 'Added' : '',
          onClick: () => {
            if (state.watch.includes(symbol)) { toast('Already in your watchlist'); return; }
            state.watch.push(symbol);
            save();
            closeOverlay();
            nav.refresh();
            toast(`${symbol} added`);
          },
        })),
      });
    }
    refresh();
  }, { full: true });
}

function stockDetailView(symbol) {
  const info = stockInfo(symbol);
  return {
    title: symbol,
    shortTitle: 'Stocks',
    build(body, nav) {
      const state = ST();
      const quote = stockQuote(symbol);
      const series = stockSeries(symbol, state.range);
      const rangeChange = series[series.length - 1] - series[0];
      const up = rangeChange >= 0;
      const colour = up ? '#30d158' : '#ff453a';

      body.appendChild(h(`<div style="padding:4px 20px 10px">
        <div style="font-size:26px;font-weight:700">${esc(symbol)}</div>
        <div style="font-size:14px;color:var(--txt2)">${esc(info[1])} · ${esc(info[3])}</div>
        <div style="display:flex;align-items:flex-end;gap:12px;margin-top:12px">
          <div style="font-size:42px;font-weight:300;line-height:1">${esc(stockPrice(quote.price))}</div>
          <div style="color:${colour};font-size:16px;font-weight:600;padding-bottom:5px">
            ${up ? '+' : ''}${rangeChange.toFixed(2)} (${up ? '+' : ''}${((rangeChange / series[0]) * 100).toFixed(2)}%)</div>
        </div>
        <div style="font-size:12px;color:var(--txt3);margin-top:4px">At close · simulated data, generated on device</div>
      </div>`));

      const chart = el('div');
      chart.style.cssText = 'padding:6px 12px 0';
      chart.innerHTML = lineSVG(series, { colour, w: 340, h: 160 });
      body.appendChild(chart);

      const ranges = el('div');
      ranges.style.cssText = 'display:flex;gap:4px;padding:10px 12px 4px';
      STOCK_RANGES.forEach(range => {
        const button = el('button', '', range);
        const on = state.range === range;
        button.style.cssText = `flex:1;padding:7px 0;border-radius:8px;font-size:13px;font-weight:600;
          color:${on ? '#fff' : 'var(--txt2)'};background:${on ? colour : 'transparent'}`;
        button.onclick = () => { state.range = range; save(); nav.refresh(); };
        ranges.appendChild(button);
      });
      body.appendChild(ranges);

      const low = Math.min(...series);
      const high = Math.max(...series);
      const stats = [
        ['Open', stockPrice(series[0])],
        ['High', stockPrice(high)],
        ['Low', stockPrice(low)],
        ['Vol', `${(rng(`${symbol}:vol`)() * 80 + 9).toFixed(1)}M`],
        ['P/E', info[3] === 'Index' || info[3] === 'Cryptocurrency' ? '—' : (rng(`${symbol}:pe`)() * 40 + 9).toFixed(2)],
        ['Mkt Cap', info[3] === 'Index' ? '—' : `${(rng(`${symbol}:cap`)() * 2.6 + 0.2).toFixed(2)}T`],
        ['52W H', stockPrice(high * 1.14)],
        ['52W L', stockPrice(low * 0.82)],
      ];
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:1px 0;margin:14px 16px;background:var(--group);border-radius:14px;overflow:hidden';
      stats.forEach(([label, value]) => {
        grid.appendChild(h(`<div style="padding:12px 14px;display:flex;justify-content:space-between;
          border-bottom:.5px solid var(--sep)">
          <span style="color:var(--txt2);font-size:14px">${esc(label)}</span>
          <span style="font-size:14px;font-weight:600">${esc(value)}</span></div>`));
      });
      body.appendChild(grid);

      group(body, {
        rows: [
          { label: 'Add to a Note', icon: SF.note, iconBg: '#ffd60a', onClick: () => {
            NT().items.unshift({
              id: Date.now(),
              folder: 'notes',
              at: Date.now(),
              body: `${symbol} — ${info[1]}\n\n${stockPrice(quote.price)} (${up ? '+' : ''}${quote.percent.toFixed(2)}%) on ${new Date().toLocaleDateString()}`,
            });
            save();
            island(SF.note, '#ffd60a', 'Notes', `${symbol} saved to Notes`);
          } },
          state.watch.includes(symbol)
            ? { label: 'Remove from Watchlist', cls: 'center', chevron: false, onClick: () => {
              state.watch = state.watch.filter(s => s !== symbol);
              save();
              nav.pop();
            } }
            : { label: 'Add to Watchlist', cls: 'center', chevron: false, onClick: () => {
              state.watch.push(symbol);
              save();
              nav.refresh();
            } },
        ],
      });
      body.appendChild(h('<div style="height:30px"></div>'));
    },
  };
}
