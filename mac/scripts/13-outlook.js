/* ===========================================================================
   Microsoft Outlook.

   A second mail client so support flows that differ between Apple Mail and
   Outlook can be practised side by side: ribbon, folder pane, Focused/Other
   inbox, calendar and People views, and its own account settings sheet.
   =========================================================================== */

(function (Mac) {
  'use strict';

  const { esc, glyph, UI } = Mac;

  const FOLDERS = [
    { id: 'Inbox', glyph: 'inbox' },
    { id: 'Drafts', glyph: 'compose' },
    { id: 'Sent Items', glyph: 'send' },
    { id: 'Deleted Items', glyph: 'trash' },
    { id: 'Junk Email', glyph: 'junk' },
    { id: 'Archive', glyph: 'archive' },
  ];

  const Outlook = Mac.Outlook = {
    data() { return Mac.state.outlook; },

    online() {
      const wifi = Mac.state.wifi;
      return wifi.enabled && Boolean(wifi.current) && !wifi.captive;
    },

    visible() {
      const data = this.data();
      let messages = data.messages.filter(message => message.folder === data.folder);
      if (data.folder === 'Inbox' && data.settings.focusedInbox) {
        messages = messages.filter(message => (data.focused === 'focused' ? message.focused : !message.focused));
      }
      const query = data.search.trim().toLowerCase();
      if (query) {
        messages = messages.filter(message => [message.subject, message.from, message.body]
          .some(field => String(field || '').toLowerCase().includes(query)));
      }
      return messages.sort((a, b) => b.date - a.date);
    },

    selected() {
      const data = this.data();
      return data.messages.find(message => message.id === data.selected) || null;
    },

    count(folder) {
      return this.data().messages.filter(message => message.folder === folder && message.unread).length;
    },

    /* ------------------------------------------------------------ rendering */

    render(win) {
      const data = this.data();
      return `<div class="outlook">
        ${this.ribbon()}
        <div class="outlook-tabs">
          ${[['mail', 'Mail'], ['calendar', 'Calendar'], ['people', 'People'], ['settings', 'Settings']].map(([id, label]) =>
            `<button class="outlook-tab ${data.view === id ? 'on' : ''}" data-outlook-view="${id}">${label}</button>`).join('')}
        </div>
        ${data.view === 'mail' ? this.mailView() : ''}
        ${data.view === 'calendar' ? this.calendarView() : ''}
        ${data.view === 'people' ? this.peopleView() : ''}
        ${data.view === 'settings' ? this.settingsView() : ''}
      </div>`;
    },

    ribbon() {
      const button = (icon, label, command, arg = '', primary = false) =>
        `<button class="ribbon-btn ${primary ? 'primary' : ''}" data-command="${command}" ${arg ? `data-arg="${esc(arg)}"` : ''}>
          ${glyph(icon)}<span>${esc(label)}</span></button>`;
      return `<div class="outlook-ribbon">
        ${button('compose', 'New Mail', 'outlook-action', 'compose', true)}
        <span class="ribbon-sep"></span>
        ${button('trash', 'Delete', 'outlook-action', 'delete')}
        ${button('archive', 'Archive', 'outlook-action', 'archive')}
        ${button('junk', 'Junk', 'outlook-action', 'junk')}
        <span class="ribbon-sep"></span>
        ${button('reply', 'Reply', 'outlook-action', 'reply')}
        ${button('reply-all', 'Reply All', 'outlook-action', 'reply-all')}
        ${button('forward-mail', 'Forward', 'outlook-action', 'forward')}
        <span class="ribbon-sep"></span>
        ${button('flag', 'Flag', 'outlook-action', 'flag')}
        ${button('tag', 'Categorise', 'outlook-action', 'categorise')}
        ${button('refresh', 'Send/Receive', 'outlook-action', 'sync')}
        <span class="spacer"></span>
        ${button('search', 'Find', 'outlook-action', 'find')}
      </div>`;
    },

    mailView() {
      const data = this.data();
      const messages = this.visible();
      const selected = this.selected();

      return `<div class="outlook-body">
        <aside class="sidebar">
          <div class="outlook-account-chip">${UI.avatar(data.account.name, { size: 'small', initials: data.account.initials })}
            <div><strong>${esc(data.account.name)}</strong><small>${esc(data.account.address)}</small></div></div>
          <div class="sidebar-heading">Favourites</div>
          ${FOLDERS.map(folder => {
            const unread = this.count(folder.id);
            return `<button class="side-item ${data.folder === folder.id ? 'on' : ''}" data-outlook-folder="${esc(folder.id)}">
              <span class="side-glyph">${glyph(folder.glyph, { size: 15 })}</span>
              <span class="side-label">${esc(folder.id)}</span>
              ${unread ? `<span class="side-count">${unread}</span>` : ''}</button>`;
          }).join('')}
          <div class="sidebar-heading">Groups</div>
          <button class="side-item" data-command="outlook-action" data-arg="group">
            <span class="side-glyph">${glyph('people', { size: 15 })}</span><span class="side-label">Tier 2 Support</span></button>
        </aside>

        <div class="mail-list-pane">
          <div class="mail-list-head">
            <div class="mail-list-title"><h2>${esc(data.folder)}</h2><span>${Mac.plural(messages.length, 'item')}</span></div>
            <div class="search"><span>${glyph('search')}</span>
              <input data-outlook-search value="${esc(data.search)}" placeholder="Search mail" aria-label="Search Outlook"></div>
          </div>
          ${data.folder === 'Inbox' && data.settings.focusedInbox ? `<div class="outlook-focused">
            <button class="${data.focused === 'focused' ? 'on' : ''}" data-outlook-focus="focused">Focused</button>
            <button class="${data.focused === 'other' ? 'on' : ''}" data-outlook-focus="other">Other</button></div>` : ''}
          <div class="mail-messages">${messages.length ? messages.map(message => this.row(message)).join('')
            : UI.empty('Nothing here', 'This folder has no items.', { icon: 'inbox' })}</div>
        </div>

        <div class="mail-reading">${selected ? this.reader(selected) : UI.empty('Select an item to read',
          'Nothing is selected.', { icon: 'outlook' })}</div>
      </div>`;
    },

    row(message) {
      const data = this.data();
      return `<button class="mail-row ${message.unread ? '' : 'read'} ${data.selected === message.id ? 'on' : ''}"
        data-outlook-message="${message.id}">
        <span class="mail-dot" aria-hidden="true"></span>
        <span class="mail-face" style="background:${Mac.tint(message.from)}">${esc(Mac.initials(message.from))}</span>
        <span class="mail-row-copy">
          <span class="mail-row-top"><strong>${esc(message.from)}</strong>
            ${message.flagged ? `<span class="mail-flag">${glyph('flag', { size: 11 })}</span>` : ''}
            <time>${new Date(message.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></span>
          <span class="mail-subject" style="${message.unread ? 'font-weight:700' : ''}">${esc(message.subject)}</span>
          <span class="mail-preview">${esc(message.preview)}</span></span></button>`;
    },

    reader(message) {
      return `<div class="mail-reader-bar">
          <button class="tool-btn" data-command="outlook-action" data-arg="reply" aria-label="Reply">${glyph('reply')}</button>
          <button class="tool-btn" data-command="outlook-action" data-arg="reply-all" aria-label="Reply All">${glyph('reply-all')}</button>
          <button class="tool-btn" data-command="outlook-action" data-arg="forward" aria-label="Forward">${glyph('forward-mail')}</button>
          <span class="spacer"></span>
          <button class="tool-btn ${message.flagged ? 'on' : ''}" data-command="outlook-action" data-arg="flag" aria-label="Flag">${glyph('flag')}</button>
          <button class="tool-btn" data-command="outlook-action" data-arg="archive" aria-label="Archive">${glyph('archive')}</button>
          <button class="tool-btn" data-command="outlook-action" data-arg="delete" aria-label="Delete">${glyph('trash')}</button>
        </div>
        <div class="mail-content">
          <h1>${esc(message.subject)}</h1>
          <div class="mail-sender">
            <span class="mail-face" style="width:36px;height:36px;background:${Mac.tint(message.from)}">${esc(Mac.initials(message.from))}</span>
            <span class="mail-sender-copy"><strong>${esc(message.from)}</strong><span>${esc(message.email)}</span></span>
            ${message.category ? `<span class="badge info">${esc(message.category)} category</span>` : ''}
          </div>
          ${!this.online() ? '<div class="badge warn" style="margin-top:12px;display:inline-block">Working offline — cached copy</div>' : ''}
          <div class="mail-body">${esc(message.body)}</div>
          ${message.attachment ? `<div class="mail-attachment">${Mac.appIcon('document-pdf')}
            <div class="row-text"><strong>${esc(message.attachment)}</strong><p>1 attachment</p></div>
            <button class="btn" data-command="outlook-action" data-arg="save-attachment">Download</button></div>` : ''}
        </div>`;
    },

    calendarView() {
      const data = this.data();
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      return `<div class="pane-scroll"><div class="pane-pad">
        ${UI.header('Calendar', `Week of ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`,
          '<button class="btn primary" data-command="outlook-action" data-arg="new-event">New Event</button>')}
        <div class="outlook-cal-grid">
          ${names.map(name => `<div class="outlook-cal-head">${name}</div>`).join('')}
          ${names.map((name, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const isToday = date.toDateString() === today.toDateString();
            const events = data.events.filter(event => event.day === index);
            return `<div class="outlook-cal-cell ${isToday ? 'today' : ''}">
              <strong>${date.getDate()}</strong>
              ${events.map(event => `<div class="outlook-event" title="${esc(event.title)}">${esc(event.time)} ${esc(event.title)}</div>`).join('')}</div>`;
          }).join('')}
        </div>
        <div class="section-title">This week</div>
        <div class="group">${data.events.map(event => `<div class="row">
          <div class="row-text"><strong>${esc(event.title)}</strong>
            <p>${names[event.day]} at ${esc(event.time)} — ${event.minutes} minutes</p></div>
          <span class="badge info">Busy</span></div>`).join('')}</div>
      </div></div>`;
    },

    peopleView() {
      const contacts = [
        { name: 'Dana Whitfield', email: 'dana@support.example', role: 'Tier 3 Support' },
        { name: 'Service Desk', email: 'servicedesk@support.example', role: 'Shared mailbox' },
        { name: 'Facilities', email: 'facilities@support.example', role: 'Distribution list' },
        { name: 'HR', email: 'hr@support.example', role: 'Distribution list' },
      ];
      return `<div class="pane-scroll"><div class="pane-pad">
        ${UI.header('People', 'Directory entries synced from the simulated Exchange server.')}
        <div class="group">${contacts.map(contact => `<div class="row">
          ${UI.avatar(contact.name, { size: 'small' })}
          <div class="row-text"><strong>${esc(contact.name)}</strong><p>${esc(contact.email)} — ${esc(contact.role)}</p></div>
          <button class="btn" data-command="outlook-action" data-arg="mail-to:${esc(contact.email)}">New Mail</button></div>`).join('')}</div>
      </div></div>`;
    },

    settingsView() {
      return `<div class="pane-scroll"><div class="pane-pad">
        ${UI.header('Outlook Settings', `Signed in as ${esc(this.data().account.address)}`)}
        <div class="section-title">Reading</div>
        ${UI.group(
          UI.toggle('Focused Inbox', 'outlook.settings.focusedInbox', 'Sort important mail into Focused and everything else into Other.'),
          UI.toggle('Organise by conversation', 'outlook.settings.conversationView'),
          UI.toggle('Request read receipts', 'outlook.settings.readReceipts'),
          UI.toggle('Auto-archive old items', 'outlook.settings.autoArchive'),
        )}
        <div class="section-title">Notifications</div>
        ${UI.group(
          UI.toggle('Show desktop alerts', 'outlook.settings.notifyDesktop'),
          UI.select('Undo send window', 'outlook.settings.sendSoon', ['Off', '5 seconds', '10 seconds', '30 seconds']),
          UI.select('Appearance', 'outlook.settings.darkMode', ['Follow system', 'Always light', 'Always dark']),
        )}
        <div class="section-title">Account</div>
        ${UI.group(
          UI.info('Email address', this.data().account.address),
          UI.info('Server', 'outlook.office365.example'),
          UI.info('Connection', this.online() ? 'Connected' : 'Working offline',
            '', `<span class="badge ${this.online() ? 'ok' : 'bad'}">${this.online() ? 'Online' : 'Offline'}</span>`),
          UI.action('Test Account Settings', 'outlook-action', 'Check the simulated Exchange connection.', '', { arg: 'test' }),
          UI.action('Repair Mailbox', 'outlook-action', 'Rebuild the local cache for this profile.', '', { arg: 'repair' }),
        )}
        <div class="section-title">Signature</div>
        <div class="dialog-field"><textarea data-outlook-signature style="min-height:80px">${esc(this.data().signature)}</textarea></div>
      </div></div>`;
    },

    /* ------------------------------------------------------------- actions */

    action(name) {
      const data = this.data();
      const message = this.selected();

      if (name.startsWith('mail-to:')) { this.compose({ to: name.slice(8) }); return; }

      switch (name) {
        case 'compose': this.compose(); break;
        case 'reply': case 'reply-all':
          if (!message) return this.requireSelection();
          this.compose({ to: message.email, subject: `RE: ${message.subject}`, quote: message });
          break;
        case 'forward':
          if (!message) return this.requireSelection();
          this.compose({ subject: `FW: ${message.subject}`, quote: message });
          break;
        case 'delete':
          if (!message) return this.requireSelection();
          message.folder = message.folder === 'Deleted Items' ? '__gone' : 'Deleted Items';
          if (message.folder === '__gone') data.messages = data.messages.filter(candidate => candidate.id !== message.id);
          data.selected = null;
          break;
        case 'archive':
          if (!message) return this.requireSelection();
          message.folder = 'Archive';
          break;
        case 'junk':
          if (!message) return this.requireSelection();
          message.folder = 'Junk Email';
          Mac.Notify.show('Outlook', `${message.email} was moved to Junk Email.`, { app: 'outlook', transient: true });
          break;
        case 'flag':
          if (!message) return this.requireSelection();
          message.flagged = !message.flagged;
          break;
        case 'categorise':
          if (!message) return this.requireSelection();
          this.categorise(message);
          return;
        case 'save-attachment':
          if (!message?.attachment) return this.requireSelection();
          Mac.Browser.download(message.attachment, 421000);
          break;
        case 'sync': this.sync(); return;
        case 'find':
          Mac.Notify.show('Outlook', 'Use the search field above the message list.', { app: 'outlook', transient: true });
          break;
        case 'test':
          Mac.Dialog.info(this.online() ? 'Account settings are correct' : 'Cannot reach the server',
            this.online()
              ? 'Log on to the incoming mail server (IMAP): completed.<br>Send test message: completed.'
              : 'Outlook cannot connect to outlook.office365.example because this Mac is offline.',
            this.online() ? 'check' : 'warning');
          break;
        case 'repair':
          Mac.Notify.show('Outlook', 'Rebuilding the local cache… this profile will resync when online.', { app: 'outlook' });
          break;
        case 'new-event':
          this.newEvent();
          return;
        case 'group':
          Mac.Dialog.info('Tier 2 Support', 'A simulated Microsoft 365 group with 6 members and a shared calendar.', 'people');
          break;
        default: break;
      }

      Mac.save();
      Mac.wm.refresh('outlook');
      Mac.Shell.renderDock();
    },

    requireSelection() {
      Mac.Notify.show('Outlook', 'Select a message first.', { app: 'outlook', transient: true });
    },

    async sync() {
      if (!this.online()) {
        Mac.Dialog.open({
          title: 'Outlook is working offline',
          icon: 'warning',
          body: '<p style="margin:0;font-size:12.5px;color:var(--text-2)">Send/Receive could not complete because there is no network connection. Outlook will retry automatically.</p>',
          buttons: [{ label: 'OK' }, { label: 'Open Wi-Fi Settings', primary: true, action: () => Mac.run('open-setting', 'Wi-Fi') }],
        });
        return;
      }
      Mac.Notify.show('Outlook', 'Send/Receive in progress…', { app: 'outlook', transient: true, duration: 1400 });
      await Mac.wait(750);
      this.data().messages.unshift({
        id: Mac.uid('ol'),
        folder: 'Inbox',
        focused: true,
        from: 'Service Desk',
        email: 'servicedesk@support.example',
        subject: 'Change window completed',
        preview: 'The bench VLAN is back in service.',
        body: 'The switch firmware upgrade completed at 23:10. DHCP renewals are working normally again.\n\nService Desk',
        date: Date.now(),
        unread: true,
        flagged: false,
        category: 'Blue',
      });
      Mac.save();
      Mac.wm.refresh('outlook');
      Mac.Shell.renderDock();
      Mac.Notify.show('Service Desk', 'Change window completed', { app: 'outlook' });
    },

    categorise(message) {
      const colours = ['Blue', 'Green', 'Orange', 'Purple', 'Red', 'None'];
      Mac.Dialog.open({
        title: 'Categorise',
        icon: 'tag',
        body: `<div class="group">${colours.map(colour =>
          `<button class="row tappable" data-command="outlook-set-category" data-arg="${colour}">
            <div class="row-text"><strong>${colour}</strong></div>
            ${message.category === colour ? '<span class="badge info">Current</span>' : ''}</button>`).join('')}</div>`,
        buttons: [{ label: 'Cancel' }],
      });
    },

    setCategory(colour) {
      const message = this.selected();
      if (!message) return;
      message.category = colour === 'None' ? null : colour;
      Mac.save();
      Mac.Dialog.close();
      Mac.wm.refresh('outlook');
    },

    async newEvent() {
      const title = await Mac.Dialog.prompt({ title: 'New event', label: 'Title', value: 'Bench triage', confirmLabel: 'Add', icon: 'calendar' });
      if (!title) return;
      this.data().events.push({ id: Mac.uid('ev'), title, day: new Date().getDay(), time: '15:00', minutes: 30 });
      Mac.save();
      Mac.wm.refresh('outlook');
      Mac.Notify.show('Outlook', `“${title}” was added to today.`, { app: 'outlook', transient: true });
    },

    select(id) {
      const data = this.data();
      data.selected = id;
      const message = data.messages.find(candidate => candidate.id === id);
      if (message?.unread) message.unread = false;
      Mac.save();
      Mac.wm.refresh('outlook');
      Mac.Shell.renderDock();
    },

    compose({ to = '', subject = '', quote = null } = {}) {
      const data = this.data();
      const quoted = quote
        ? `\n\n-----Original Message-----\nFrom: ${quote.from} <${quote.email}>\nSent: ${new Date(quote.date).toLocaleString()}\nSubject: ${quote.subject}\n\n${quote.body}`
        : '';

      Mac.Dialog.open({
        title: 'Untitled — Message',
        wide: true,
        className: 'sheet-style',
        body: `<div class="outlook-ribbon" style="border-radius:8px;margin-bottom:12px">
            <button class="ribbon-btn primary" data-command="outlook-send">${glyph('send')}<span>Send</span></button>
            <span class="ribbon-sep"></span>
            <button class="ribbon-btn" data-command="outlook-action" data-arg="attach">${glyph('tag')}<span>Attach</span></button>
            <button class="ribbon-btn" data-command="outlook-action" data-arg="signature-insert">${glyph('compose')}<span>Signature</span></button>
          </div>
          <div class="mail-compose-grid">
            <label for="ol-to">To</label><input id="ol-to" value="${esc(to)}" autocomplete="off">
            <label for="ol-cc">Cc</label><input id="ol-cc" autocomplete="off">
            <label for="ol-subject">Subject</label><input id="ol-subject" value="${esc(subject)}" autocomplete="off">
          </div>
          <div class="dialog-field"><textarea id="ol-body" style="min-height:170px">${esc(`\n\n${data.signature}${quoted}`)}</textarea></div>
          <p class="field-error" id="ol-error"></p>`,
        buttons: [
          { label: 'Discard' },
          { label: 'Save Draft', action: () => this.saveDraft() },
          { label: 'Send', primary: true, close: false, action: () => this.send() },
        ],
        onMount: () => setTimeout(() => document.getElementById(to ? 'ol-body' : 'ol-to')?.focus(), 30),
      });
    },

    readCompose() {
      return {
        to: document.getElementById('ol-to')?.value.trim() || '',
        subject: document.getElementById('ol-subject')?.value.trim() || '',
        body: document.getElementById('ol-body')?.value || '',
      };
    },

    saveDraft() {
      const draft = this.readCompose();
      this.push('Drafts', draft);
      Mac.Notify.show('Outlook', 'Saved to Drafts.', { app: 'outlook', transient: true });
    },

    send() {
      const draft = this.readCompose();
      const error = document.getElementById('ol-error');
      if (!draft.to) { error.textContent = 'Enter at least one recipient.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.to.split(',')[0].trim())) {
        error.textContent = 'Outlook does not recognise that address.';
        return;
      }
      if (!this.online()) {
        Mac.Dialog.close();
        this.push('Drafts', draft);
        Mac.Dialog.info('Message not sent', 'Outlook is working offline, so the message was saved to Drafts.', 'warning');
        return;
      }
      Mac.Dialog.close();
      this.push('Sent Items', draft);
      Mac.Notify.show('Outlook', `Message sent to ${draft.to}.`, { app: 'outlook', transient: true });
    },

    push(folder, draft) {
      const data = this.data();
      data.messages.unshift({
        id: Mac.uid('ol'),
        folder,
        focused: true,
        from: data.account.name,
        email: data.account.address,
        to: draft.to,
        subject: draft.subject || '(no subject)',
        preview: draft.body.trim().slice(0, 80),
        body: draft.body,
        date: Date.now(),
        unread: false,
        flagged: false,
      });
      Mac.save();
      Mac.wm.refresh('outlook');
    },
  };

  Mac.registerApp({
    id: 'outlook',
    title: 'Microsoft Outlook',
    icon: 'outlook',
    category: 'Productivity',
    blurb: 'The Exchange client used on the support desk, with Focused Inbox and calendar.',
    size: [1100, 680],
    min: [560, 360],
    singleton: true,
    version: '16.91',
    toolbar: () => `<button class="tool-btn" data-command="outlook-action" data-arg="sync" aria-label="Send and receive">${glyph('refresh')}</button>
      <button class="tool-btn" data-command="outlook-action" data-arg="compose" aria-label="New mail">${glyph('compose')}</button>
      <button class="tool-btn" data-outlook-view="settings" aria-label="Settings">${glyph('gear')}</button>`,
    menus: () => ({
      File: [
        { label: 'New Email', command: 'outlook-action', arg: 'compose', shortcut: '⌘N' },
        { label: 'Send/Receive All', command: 'outlook-action', arg: 'sync' },
      ],
      Tools: [
        { label: 'Test Account Settings', command: 'outlook-action', arg: 'test' },
        { label: 'Repair Mailbox', command: 'outlook-action', arg: 'repair' },
        { label: 'Work Offline', command: 'wifi-toggle' },
      ],
      View: [
        { label: 'Mail', command: 'outlook-view', arg: 'mail' },
        { label: 'Calendar', command: 'outlook-view', arg: 'calendar' },
        { label: 'People', command: 'outlook-view', arg: 'people' },
      ],
    }),
    render: win => Outlook.render(win),
  });
}(window.Mac));
