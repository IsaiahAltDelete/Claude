/* ===========================================================================
   Safari.

   Each window owns its own tab set; each tab owns its own history stack. Pages
   come from a closed catalogue of built-in simulated sites — nothing is ever
   fetched from the network — and every page reacts to the simulated Wi-Fi
   state so offline, captive-portal and DNS problems are reproducible.
   =========================================================================== */

(function (Mac) {
  'use strict';

  const { esc, glyph, UI } = Mac;

  const SITES = {
    'support.apple.local': { title: 'Apple Support', color: '#2f7cf6' },
    'network.test': { title: 'Network Test', color: '#0f9d58' },
    'training.local': { title: 'Support Training', color: '#6c5ce7' },
    'status.local': { title: 'Service Status', color: '#ef8b2c' },
    'kb.local': { title: 'Knowledge Base', color: '#0aa3c2' },
    'kb.local/wifi': { title: 'Wi-Fi troubleshooting', color: '#0aa3c2' },
    'kb.local/startup': { title: 'Startup key combinations', color: '#0aa3c2' },
    'kb.local/nvram': { title: 'Reset NVRAM and SMC', color: '#0aa3c2' },
    'unsafe.test': { title: 'Deceptive Website Warning', color: '#e0455f' },
    'portal.local': { title: 'Wi-Fi Sign In', color: '#5b79a7' },
    'downloads.local': { title: 'Downloads', color: '#8e98a5' },
  };

  const Browser = Mac.Browser = {
    newTab(win, url = 'start', { activate = true } = {}) {
      const tab = { id: Mac.uid('tab'), url, stack: [url], index: 0, loading: false, title: this.titleFor(url), bypass: false };
      win.state.tabs.push(tab);
      if (activate) win.state.activeTab = tab.id;
      return tab;
    },

    tab(win) {
      if (!win.state.tabs.length) this.newTab(win);
      return win.state.tabs.find(tab => tab.id === win.state.activeTab) || win.state.tabs[0];
    },

    closeTab(win, id) {
      const index = win.state.tabs.findIndex(tab => tab.id === id);
      if (index < 0) return;
      win.state.tabs.splice(index, 1);
      if (!win.state.tabs.length) {
        Mac.wm.close(win.id);
        return;
      }
      if (win.state.activeTab === id) {
        win.state.activeTab = win.state.tabs[Math.max(0, index - 1)].id;
      }
      Mac.wm.render(win);
    },

    /** Resolve typed input to one of the built-in destinations. */
    normalize(input) {
      const value = String(input || '').trim();
      if (!value) return 'start';
      const lower = value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (SITES[lower]) return lower;
      if (['history', 'bookmarks', 'downloads', 'settings', 'start'].includes(lower)) return lower;
      if (/^[\w.-]+\.[a-z]{2,}$/i.test(lower)) {
        // A plausible hostname that this simulator does not host.
        return `unreachable:${lower}`;
      }
      return `search:${value}`;
    },

    navigate(win, input, { replace = false, bypass = false } = {}) {
      const tab = this.tab(win);
      let url = this.normalize(input);
      const wifi = Mac.state.wifi;

      if (!wifi.enabled || !wifi.current) {
        if (!['start', 'history', 'bookmarks', 'downloads', 'settings'].includes(url)) {
          url = `offline:${url.replace(/^offline:/, '')}`;
        }
      } else if (wifi.captive && !['portal.local', 'start', 'history', 'bookmarks', 'downloads', 'settings'].includes(url)) {
        url = 'portal.local';
      }

      if (replace) tab.stack[tab.index] = url;
      else {
        tab.stack = tab.stack.slice(0, tab.index + 1);
        tab.stack.push(url);
        tab.index = tab.stack.length - 1;
      }
      tab.url = url;
      tab.title = this.titleFor(url);
      tab.loading = true;
      if (bypass) tab.bypass = true;
      Mac.wm.render(win);

      clearTimeout(tab.timer);
      tab.timer = setTimeout(() => {
        if (!win.state.tabs.includes(tab)) return;
        tab.loading = false;
        tab.title = this.titleFor(tab.url);
        if (!Mac.state.browser.private && !tab.url.startsWith('offline:')) {
          Mac.state.browser.history.unshift({ title: tab.title, url: tab.url, at: Date.now() });
          Mac.state.browser.history = Mac.state.browser.history.slice(0, 60);
          Mac.save();
        }
        Mac.wm.render(win);
      }, 620);
    },

    go(win, delta) {
      const tab = this.tab(win);
      const next = tab.index + delta;
      if (next < 0 || next >= tab.stack.length) return;
      tab.index = next;
      tab.url = tab.stack[next];
      tab.title = this.titleFor(tab.url);
      Mac.wm.render(win);
    },

    stop(win) {
      const tab = this.tab(win);
      clearTimeout(tab.timer);
      tab.loading = false;
      Mac.wm.render(win);
    },

    titleFor(url) {
      if (url === 'start') return 'Start Page';
      if (url === 'history') return 'History';
      if (url === 'bookmarks') return 'Bookmarks';
      if (url === 'downloads') return 'Downloads';
      if (url === 'settings') return 'Safari Settings';
      if (url.startsWith('offline:')) return 'You are not connected to the internet';
      if (url.startsWith('unreachable:')) return 'Cannot find the server';
      if (url.startsWith('search:')) return `${url.slice(7)} — Search`;
      return SITES[url]?.title || 'Safari';
    },

    favicon(url) {
      const site = SITES[url];
      const color = site?.color || '#8e98a5';
      const letter = (site?.title || url.replace(/^\w+:/, '') || 'S')[0].toUpperCase();
      return `<span class="favicon" style="background:${color}">${esc(letter)}</span>`;
    },

    download(name, size) {
      Mac.state.browser.downloads.unshift({ id: Mac.uid('dl'), name, size, at: Date.now() });
      Mac.FS.createFile('dir-downloads', name, { ext: name.split('.').pop(), size });
      Mac.save();
      Mac.Notify.show('Safari', `“${name}” was downloaded to Downloads.`, { app: 'safari' });
      Mac.wm.refresh('finder');
    },

    /* ------------------------------------------------------------ rendering */

    render(win) {
      const tab = this.tab(win);
      const wifi = Mac.state.wifi;
      const secure = wifi.enabled && wifi.current && !wifi.captive && !tab.url.startsWith('offline:') && !tab.url.startsWith('unreachable:');

      return `<div class="browser">
        <div class="tab-strip">
          ${win.state.tabs.map(candidate => `<button class="browser-tab ${candidate.id === tab.id ? 'on' : ''} ${Mac.state.browser.private ? 'private' : ''}"
            data-browser-tab="${candidate.id}">
            ${this.favicon(candidate.url)}<span>${esc(candidate.title)}</span>
            <i class="tab-x" data-close-tab="${candidate.id}" role="button" aria-label="Close tab">${glyph('close', { size: 9 })}</i></button>`).join('')}
          <button class="tool-btn" data-command="browser-new-tab" aria-label="New tab">${glyph('plus')}</button>
        </div>
        <div class="browser-bar">
          <button class="tool-btn" data-command="browser-back" ${tab.index <= 0 ? 'disabled' : ''} aria-label="Back">${glyph('back')}</button>
          <button class="tool-btn" data-command="browser-forward" ${tab.index >= tab.stack.length - 1 ? 'disabled' : ''} aria-label="Forward">${glyph('forward')}</button>
          <button class="tool-btn" data-command="browser-reload" aria-label="${tab.loading ? 'Stop' : 'Reload'}">${glyph(tab.loading ? 'close' : 'refresh')}</button>
          <form class="address-field" data-address-form>
            ${glyph(secure ? 'lock' : 'warning', { cls: secure ? 'secure' : 'insecure' })}
            <input value="${esc(tab.url === 'start' ? '' : tab.url.replace(/^(offline|unreachable|search):/, ''))}"
              placeholder="Search or enter website name" aria-label="Address and search" spellcheck="false">
          </form>
          <button class="tool-btn ${Mac.state.browser.private ? 'on' : ''}" data-command="browser-private" aria-label="Private Browsing">${glyph('eye-off')}</button>
          <button class="tool-btn" data-command="browser-share" aria-label="Share">${glyph('share')}</button>
          <button class="tool-btn" data-command="browse" data-arg="bookmarks" aria-label="Bookmarks">${glyph('bookmark')}</button>
        </div>
        <main class="browser-view">${tab.loading ? '<div class="load-bar"></div>' : ''}${this.page(win, tab)}</main>
      </div>`;
    },

    page(win, tab) {
      const url = tab.url;
      const wifi = Mac.state.wifi;

      if (tab.loading) {
        return `<div class="web-page start-page"><h1 style="margin-top:16vh">Loading…</h1>
          <p class="muted">Contacting ${esc(url.replace(/^\w+:/, '')) || 'the simulated network'}.</p></div>`;
      }

      if (url === 'start') return this.startPage();

      if (url.startsWith('offline:')) {
        return `<div class="error-page"><div>
          <div class="error-art">${glyph('wifi-off', { size: 54 })}</div>
          <h1>You are not connected to the internet</h1>
          <p>Safari cannot open the page because this Mac is not connected to a network. Turn on Wi-Fi, choose a network, then try again.</p>
          <div class="error-actions">
            <button class="btn primary" data-command="browser-retry">Try Again</button>
            <button class="btn" data-command="wifi-toggle">${wifi.enabled ? 'Choose a Network' : 'Turn On Wi-Fi'}</button>
            <button class="btn" data-command="open-setting" data-arg="Wi-Fi">Open Wi-Fi Settings</button>
            <button class="btn" data-command="run-diagnostics">Run Diagnostics</button>
          </div></div></div>`;
      }

      if (url.startsWith('unreachable:')) {
        return `<div class="error-page"><div>
          <div class="error-art">${glyph('globe', { size: 54 })}</div>
          <h1>Safari can’t find the server</h1>
          <p>Safari cannot open the page because it can’t find the server “${esc(url.slice(12))}”.
             This simulator only hosts a fixed set of practice pages, so real addresses never resolve.</p>
          <div class="error-actions">
            <button class="btn primary" data-command="browse" data-arg="start">Back to Start Page</button>
            <button class="btn" data-command="browse" data-arg="kb.local">Open Knowledge Base</button>
            <button class="btn" data-command="edit-dns">Check DNS Settings</button>
          </div></div></div>`;
      }

      if (url === 'portal.local') return this.portalPage();
      if (url === 'unsafe.test' && !tab.bypass) return this.warningPage();
      if (url === 'history') return this.historyPage();
      if (url === 'bookmarks') return this.bookmarksPage();
      if (url === 'downloads') return this.downloadsPage();
      if (url === 'settings') return this.settingsPage();
      if (url.startsWith('search:')) return this.searchPage(url.slice(7));

      const article = this.articles()[url];
      if (article) return article();

      return `<div class="error-page"><div><h1>Page not available</h1>
        <p>This simulator supports a controlled set of built-in pages and does not provide unrestricted browsing.</p>
        <div class="error-actions"><button class="btn primary" data-command="browse" data-arg="start">Return to Start Page</button></div></div></div>`;
    },

    startPage() {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      const favorites = Mac.state.browser.favorites;
      return `<div class="web-page start-page">
        <h1>Good ${greeting}${Mac.state.browser.private ? ' — Private Browsing' : ''}.</h1>
        <form class="start-search" data-address-form>${glyph('search')}
          <input placeholder="Search or enter website name" aria-label="Search the web" spellcheck="false"></form>
        <div class="favorites-grid">${favorites.map(favorite =>
          `<button class="favorite" data-command="browse" data-arg="${esc(favorite.url)}">
            <i style="background:${favorite.color}">${esc(favorite.title[0])}</i>${esc(favorite.title)}</button>`).join('')}</div>
        <p class="muted" style="font-size:11.5px">Built-in simulated pages only — this browser never reaches the internet.</p></div>`;
    },

    portalPage() {
      return `<div class="web-page" style="background:#eef3f9">
        <div class="web-wrap" style="max-width:460px;margin-top:8vh">
          <div class="web-card" style="background:#fff;text-align:center">
            <div style="width:56px;height:56px;margin:0 auto 12px;border-radius:14px;background:#5b79a7;color:#fff;display:grid;place-items:center">${glyph('wifi', { size: 26 })}</div>
            <h1 style="font-size:23px">Cafe Welcome Wi-Fi</h1>
            <p>Accept the acceptable-use policy to finish joining this simulated public network.</p>
            <button class="check-line" style="justify-content:center;margin:14px 0" data-command="portal-agree" id="portal-agree-line">
              <span class="checkbox ${Mac.session.portalAgreed ? 'on' : ''}" aria-hidden="true">✓</span>
              <span>I agree to the acceptable use policy</span></button>
            <p class="field-error" id="portal-error"></p>
            <div class="error-actions"><button class="btn primary" data-command="portal-connect">Connect to Internet</button>
              <button class="btn" data-command="portal-cancel">Cancel</button></div>
          </div></div></div>`;
    },

    warningPage() {
      return `<div class="error-page" style="background:#fff4f2">
        <div><div class="error-art" style="color:#d93025">${glyph('warning', { size: 54 })}</div>
        <h1>Deceptive website warning</h1>
        <p>This page exists to demonstrate Safari’s fraudulent-site warning. No real website was contacted and nothing was loaded.</p>
        <div class="error-actions"><button class="btn primary" data-command="browse" data-arg="start">Go Back</button>
          <button class="btn" data-command="unsafe-details">Show Details</button></div></div></div>`;
    },

    historyPage() {
      const history = Mac.state.browser.history;
      return `<div class="web-page"><div class="web-wrap"><h1>History</h1>
        ${history.length ? `<div class="group">${history.map(entry =>
          `<button class="row tappable" data-command="browse" data-arg="${esc(entry.url)}">
            <div class="row-text"><strong>${esc(entry.title)}</strong><p>${esc(entry.url)}</p></div>
            <span class="row-value">${new Date(entry.at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></button>`).join('')}</div>
          <button class="btn destructive" data-command="clear-history">Clear History</button>`
          : '<div class="web-card">No browsing history yet.</div>'}</div></div>`;
    },

    bookmarksPage() {
      const { favorites, bookmarks, readingList } = Mac.state.browser;
      return `<div class="web-page"><div class="web-wrap"><h1>Bookmarks</h1>
        <h2>Favourites</h2><div class="group">${favorites.map(item =>
          `<button class="row tappable" data-command="browse" data-arg="${esc(item.url)}">
            <div class="row-text"><strong>${esc(item.title)}</strong><p>${esc(item.url)}</p></div>
            <span class="chevron">${glyph('chevron', { size: 13 })}</span></button>`).join('')}</div>
        <h2>Bookmarks</h2><div class="group">${bookmarks.map(item =>
          `<button class="row tappable" data-command="browse" data-arg="${esc(item.url)}">
            <div class="row-text"><strong>${esc(item.title)}</strong><p>${esc(item.url)}</p></div>
            <span class="chevron">${glyph('chevron', { size: 13 })}</span></button>`).join('')}</div>
        <h2>Reading List</h2>${readingList.length
          ? `<div class="group">${readingList.map(item => `<div class="row"><div class="row-text"><strong>${esc(item.title)}</strong><p>${esc(item.url)}</p></div></div>`).join('')}</div>`
          : '<div class="web-card">Nothing saved for later.</div>'}</div></div>`;
    },

    downloadsPage() {
      const downloads = Mac.state.browser.downloads;
      return `<div class="web-page"><div class="web-wrap"><h1>Downloads</h1>
        ${downloads.length ? `<div class="group">${downloads.map(item =>
          `<div class="row"><div class="row-text"><strong>${esc(item.name)}</strong><p>${Mac.bytes(item.size)} — ${Mac.timeAgo(item.at)} ago</p></div>
            <div class="row-action"><button class="btn" data-command="finder-go-downloads">Show in Finder</button></div></div>`).join('')}</div>`
          : '<div class="web-card">No downloads yet. Support articles in this simulator offer sample files you can download.</div>'}</div></div>`;
    },

    settingsPage() {
      const browser = Mac.state.browser;
      return `<div class="web-page"><div class="web-wrap"><h1>Safari Settings</h1>
        ${UI.group(
          UI.toggle('Private Browsing', 'browser.private', 'Private tabs are not added to History.'),
          UI.toggle('Prevent cross-site tracking', 'browser.preventTracking'),
          UI.toggle('Block pop-up windows', 'browser.blockPopups'),
          UI.toggle('Warn when visiting a fraudulent website', 'browser.warnFraud'),
        )}
        ${UI.group(
          UI.select('Search engine', 'browser.searchEngine', ['Simulated Search', 'Offline Index', 'Knowledge Base']),
          UI.action('Clear History…', 'clear-history', 'Remove every entry from the simulated history.'),
        )}</div></div>`;
    },

    searchPage(query) {
      const q = query.trim();
      const hits = [
        { url: 'support.apple.local', title: `Apple Support — help with “${q}”`, text: 'Official-style support steps contained entirely within this simulator.' },
        { url: 'kb.local/wifi', title: `Knowledge Base — ${q} troubleshooting`, text: 'Step-by-step checks for connectivity, DNS and DHCP problems.' },
        { url: 'network.test', title: 'Check this Mac’s network status', text: 'Live view of the simulated Wi-Fi, address and DNS state.' },
        { url: 'training.local', title: 'Training exercises', text: 'Guided scenarios you can run against this simulator.' },
      ];
      return `<div class="web-page"><div class="web-wrap">
        <p class="web-eyebrow">Simulated search</p><h1>Results for “${esc(q)}”</h1>
        ${hits.map(hit => `<div class="web-card"><h3><button style="color:var(--accent);font:inherit"
          data-command="browse" data-arg="${esc(hit.url)}">${esc(hit.title)}</button></h3>
          <p style="margin:4px 0 0">${esc(hit.text)}</p>
          <p style="margin:6px 0 0;color:#8a8a90;font-size:11.5px">${esc(hit.url)}</p></div>`).join('')}
        <p class="muted" style="margin-top:18px;font-size:11.5px">No query leaves this page. Results are generated locally.</p></div></div>`;
    },

    /* --------------------------------------------------------- article pages */

    articles() {
      const wifi = Mac.state.wifi;
      return {
        'support.apple.local': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">Mac User Guide</p>
          <h1>Get help with your Mac</h1>
          <p>Practise the most common support flows against a Mac that behaves like the real thing — without touching a real machine.</p>
          <div class="web-card"><h3>If you can’t connect to Wi-Fi</h3>
            <ol><li>Open Control Centre and confirm Wi-Fi is on.</li>
              <li>Choose your network and enter the password.</li>
              <li>If the network joins but has no internet, renew the DHCP lease.</li>
              <li>Still failing? Run Network Diagnostics.</li></ol>
            <div class="error-actions"><button class="btn primary" data-command="open-setting" data-arg="Wi-Fi">Open Wi-Fi Settings</button>
              <button class="btn" data-command="run-diagnostics">Run Diagnostics</button></div></div>
          <div class="web-card"><h3>If an app stops responding</h3>
            <p>Choose Force Quit from the Apple menu, select the app, then click Force Quit.</p>
            <div class="error-actions"><button class="btn" data-command="force-quit-dialog">Open Force Quit</button></div></div>
          <div class="web-card"><h3>If you need to start over</h3>
            <p>Erase All Content and Settings restores this simulated Mac and walks you through Setup Assistant again.</p>
            <div class="error-actions"><button class="btn" data-command="open-setting" data-arg="Transfer or Reset">Open Transfer or Reset</button></div></div>
          <div class="web-card"><h3>Download the practice pack</h3>
            <p>A sample PDF you can open in Preview and move between folders.</p>
            <div class="error-actions"><button class="btn" data-command="browser-download" data-arg="Practice Pack.pdf">Download PDF</button></div></div>
          </div></div>`,

        'network.test': () => {
          const online = wifi.enabled && wifi.current && !wifi.captive;
          return `<div class="web-page"><div class="web-wrap">
            <p class="web-eyebrow">Connection check</p>
            <h1>${online ? 'Your internet connection is working' : 'Action required'}</h1>
            <div class="web-card"><dl class="web-kv">
              <dt>Wi-Fi</dt><dd>${wifi.enabled ? 'On' : 'Off'}</dd>
              <dt>Network</dt><dd>${esc(wifi.current || 'Not connected')}</dd>
              <dt>Internet</dt><dd>${online ? 'Reachable' : wifi.captive ? 'Sign-in required' : 'Unavailable'}</dd>
              <dt>IP address</dt><dd>${esc(wifi.current ? wifi.ip : '--')}</dd>
              <dt>Router</dt><dd>${esc(wifi.current ? wifi.router : '--')}</dd>
              <dt>DNS</dt><dd>${esc(wifi.dns.join(', ') || 'None configured')}</dd>
              <dt>Latency</dt><dd>${online ? '18 ms' : '--'}</dd>
            </dl>
            <div class="error-actions"><button class="btn primary" data-command="run-diagnostics">Run Diagnostics</button>
              <button class="btn" data-command="renew-dhcp">Renew DHCP Lease</button>
              <button class="btn" data-command="edit-dns">Edit DNS</button></div></div></div></div>`;
        },

        'status.local': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">Service status</p><h1>Simulated service status</h1>
          <div class="group">
            ${[['Apple ID', 'ok', 'Available'], ['iCloud Drive', 'ok', 'Available'], ['Mail', 'warn', 'Degraded performance'],
               ['App Store', 'ok', 'Available'], ['Software Update', 'ok', 'Available'], ['Find My', 'ok', 'Available']]
              .map(([name, status, label]) => `<div class="row"><div class="row-text"><strong>${name}</strong></div>
                <span class="badge ${status}">${label}</span></div>`).join('')}
          </div>
          <p class="muted">Use this page to practise explaining service-side incidents to a customer.</p></div></div>`,

        'training.local': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">Support lab</p><h1>Troubleshooting exercises</h1>
          <p>Each exercise is fully reversible. Work through them in any order.</p>
          ${[
            ['Recover from an offline Mac', 'Turn Wi-Fi off in Control Centre, reload a page, then bring the connection back.', 'wifi-toggle', 'Toggle Wi-Fi'],
            ['Clear a captive portal', 'Join “Cafe Welcome”, accept the policy, then verify internet on the Network Test page.', 'open-setting', 'Open Wi-Fi Settings'],
            ['Renew a DHCP lease', 'Open Wi-Fi Details and renew the lease, then confirm the new address.', 'renew-dhcp', 'Renew Lease'],
            ['Diagnose from the command line', 'Use ifconfig, ping and networksetup in Terminal.', 'open-app', 'Open Terminal'],
            ['Restore a deleted file', 'Move a file to the Bin, then Put It Back from the Bin window.', 'open-app', 'Open the Bin'],
            ['Rebuild the Mac', 'Erase All Content and Settings, then complete Setup Assistant.', 'factory-reset', 'Erase This Mac'],
          ].map(([title, text, command, label], index) => `<div class="web-card"><h3>Exercise ${index + 1} — ${title}</h3>
            <p>${text}</p><div class="error-actions"><button class="btn" data-command="${command}"
              data-arg="${command === 'open-setting' ? 'Wi-Fi' : command === 'open-app' ? (index === 3 ? 'terminal' : 'trash') : ''}">${label}</button></div></div>`).join('')}
          </div></div>`,

        'kb.local': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">Knowledge base</p><h1>Support articles</h1>
          <div class="group">
            ${[['kb.local/wifi', 'Wi-Fi troubleshooting decision tree', 'Connectivity'],
               ['kb.local/startup', 'Startup key combinations', 'Startup'],
               ['kb.local/nvram', 'Reset NVRAM and the SMC', 'Hardware'],
               ['support.apple.local', 'Mac user guide', 'General']]
              .map(([url, title, tag]) => `<button class="row tappable" data-command="browse" data-arg="${url}">
                <div class="row-text"><strong>${title}</strong><p>${tag}</p></div>
                <span class="chevron">${glyph('chevron', { size: 13 })}</span></button>`).join('')}
          </div></div></div>`,

        'kb.local/wifi': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">KB-1042</p><h1>Wi-Fi troubleshooting decision tree</h1>
          <div class="web-card"><h3>1 — Is Wi-Fi on?</h3><p>Control Centre › Wi-Fi. If the menu bar glyph is dimmed, the radio is off.</p></div>
          <div class="web-card"><h3>2 — Is it associated?</h3><p>System Settings › Wi-Fi shows the joined network. “No Internet” means associated but unrouted.</p></div>
          <div class="web-card"><h3>3 — Does it have an address?</h3><p>Wi-Fi › Details › TCP/IP. A 169.254.x.x address means DHCP failed — renew the lease.</p></div>
          <div class="web-card"><h3>4 — Does DNS resolve?</h3><p>Terminal: <code class="mono">ping network.test</code>. If the address works but names fail, fix DNS.</p></div>
          <div class="web-card"><h3>5 — Escalate</h3><p>Attach the Network Diagnostics report and the Console log for airportd.</p>
            <div class="error-actions"><button class="btn primary" data-command="run-diagnostics">Run Diagnostics</button>
              <button class="btn" data-command="open-app" data-arg="console">Open Console</button></div></div>
          </div></div>`,

        'kb.local/startup': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">KB-2011</p><h1>Startup key combinations</h1>
          <table class="shortcut-table">
            <tr><td>Recovery</td><td>Hold the power button (Apple silicon)</td></tr>
            <tr><td>Safe Mode</td><td>Hold Shift during startup</td></tr>
            <tr><td>Startup Manager</td><td>Hold Option</td></tr>
            <tr><td>Reset NVRAM</td><td>Option-Command-P-R</td></tr>
            <tr><td>Target Disk Mode</td><td>Hold T</td></tr>
          </table>
          <div class="web-card"><p>This simulator implements Recovery and Safe Mode from the Apple menu.</p>
            <div class="error-actions"><button class="btn" data-command="power" data-arg="recovery">Restart in Recovery</button>
              <button class="btn" data-command="power" data-arg="safe">Restart in Safe Mode</button></div></div>
          </div></div>`,

        'kb.local/nvram': () => `<div class="web-page"><div class="web-wrap">
          <p class="web-eyebrow">KB-3007</p><h1>Reset NVRAM and the SMC</h1>
          <p>On Apple silicon Macs, NVRAM is reset automatically during a restart, and there is no separate SMC reset — a full shut down and restart covers both.</p>
          <div class="web-card"><h3>What to try instead</h3>
            <ol><li>Shut down, wait 30 seconds, then power on.</li>
              <li>If the display or ports misbehave, boot into Safe Mode.</li>
              <li>Run Disk Utility First Aid on the startup volume.</li></ol>
            <div class="error-actions"><button class="btn" data-command="open-app" data-arg="disk-utility">Open Disk Utility</button></div></div>
          </div></div>`,
      };
    },
  };

  Mac.registerApp({
    id: 'safari',
    title: 'Safari',
    icon: 'safari',
    category: 'Internet',
    blurb: 'Browse a closed set of simulated support pages.',
    size: [960, 640],
    min: [420, 320],
    initialState() {
      const state = { tabs: [], activeTab: null };
      return state;
    },
    titleFor(win) {
      const tab = win.state.tabs.find(candidate => candidate.id === win.state.activeTab);
      return tab ? tab.title : 'Safari';
    },
    toolbar: () => `<button class="tool-btn" data-command="browser-new-tab" aria-label="New tab">${glyph('plus')}</button>`,
    menus(win) {
      return {
        File: [
          { label: 'New Tab', command: 'browser-new-tab', shortcut: '⌘T' },
          { label: 'Close Tab', command: 'browser-close-tab', shortcut: '⌘W' },
        ],
        History: [
          { label: 'Show All History', command: 'browse', arg: 'history' },
          { label: 'Clear History…', command: 'clear-history' },
        ],
        Bookmarks: [
          { label: 'Show Bookmarks', command: 'browse', arg: 'bookmarks' },
          { label: 'Add Bookmark', command: 'browser-bookmark' },
          { label: 'Show Downloads', command: 'browse', arg: 'downloads' },
        ],
      };
    },
    mount(win) {
      if (!win.state.tabs.length) {
        Browser.newTab(win, win.state.initialUrl || 'start');
        Mac.wm.render(win);
      }
    },
    render: win => Browser.render(win),
  });
}(window.Mac));
