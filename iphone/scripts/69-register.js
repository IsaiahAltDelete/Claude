/* ===========================================================================
   Registration.

   Runs last. The extension modules only define apps; nothing appears on the
   home screen until its id is added to a page, so this file is the single
   place that decides the layout. Ids already in PAGE1 are skipped, which keeps
   this idempotent if the file is ever loaded twice.
   =========================================================================== */

/* Page two onward, grouped the way someone would actually arrange them. */
const EXTRA_APPS = [
  'calendar', 'reminders', 'contacts', 'files', 'voicememos',
  'health', 'fitness', 'home', 'findmy', 'facetime',
  'books', 'podcasts', 'stocks', 'translate', 'compass', 'freeform',
];

EXTRA_APPS.forEach(id => {
  if (Apps[id] && !PAGE1.includes(id) && !DOCK.includes(id)) PAGE1.push(id);
});

/* Reasonable starting badges for the apps that carry them on a real phone. */
if (!State.badgesSeeded) {
  State.badgesSeeded = true;
  const seed = { reminders: 3, facetime: 1 };
  Object.entries(seed).forEach(([id, count]) => {
    if (Apps[id] && !State.badges[id]) State.badges[id] = count;
  });
  save();
}

/* A couple of lock-screen notifications from the new apps, so the phone looks
   lived-in rather than empty.

   Unconditionally, and deliberately: LOCK_NOTIFS is rebuilt from scratch on
   every load, exactly like the three the inline script seeds. Gating this on a
   persisted flag — which is what the badge block above correctly does, because
   State.badges IS persisted — meant these two appeared once and never again. */
LOCK_NOTIFS.push(
  { app: 'reminders', title: 'Reminders', body: 'Call back ticket 4821 — due in an hour', when: '35m ago' },
  { app: 'health', title: 'Health', body: 'Your weekly summary is ready', when: '2h ago' },
);

/* Boot (scripts/70-boot.js) runs after this file and paints everything, so
   nothing needs replaying here. */
