/* ===========================================================================
   The catalogue.

   Every streaming service, title, live channel and programme below is
   invented — none of them is a real product and none of the artwork is
   anyone's trademark.

   Where they are not invented, they are jokes. The titles are shows-within-
   shows: the sort of thing that only ever exists inside somebody else's
   sitcom, playing on a television in the background of a scene. The developer
   names on the channel pages are the fictional companies those shows were made
   by, the neighbours' Wi-Fi networks are the jokes people actually name their
   routers, and there are a few things buried further in for anyone who goes
   looking. None of it changes how the simulator behaves, and the support flows
   are all still straight.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------- the set */

/* The Roku is a box on HDMI 1. Everything else here belongs to the
   television, and is what makes "check your input" a real step. */
const TV_INPUTS = [
  { id: 'hdmi1', name: 'HDMI 1', label: 'Roku Ultra',     device: 'roku' },
  { id: 'hdmi2', name: 'HDMI 2', label: 'Vertex 4K',      device: 'disc' },
  { id: 'hdmi3', name: 'HDMI 3', label: 'Nothing plugged in', device: null },
  { id: 'av',    name: 'AV',     label: 'Nothing plugged in', device: null },
  { id: 'tuner', name: 'Antenna TV', label: 'No channels tuned', device: 'tuner' },
];

/* --------------------------------------------------------------- channels */

/* word carries light markup so a wordmark can mix weights the way real ones
   do. mark is a glyph id from 02-icons.js; layout picks how the two sit
   together; tex is the CSS overlay class. `dev` is where the jokes live. */
const CHANNELS = [
  /* ---- the ones the box ships with ------------------------------------ */
  { id: 'beacon', name: 'The Beacon Channel', short: 'BEACON', word: 'Beacon', tag: 'free tv', mark: 'mSignal',
    c1: '#7b2fb5', c2: '#2c0f47', tex: 'tex-arc', layout: 'stack', cat: 'featured', kind: 'avod', built: true,
    dev: 'Kabletown', rating: 4.4, reviews: '128,402', size: '68.2 MB', ver: '5.12.1',
    desc: 'Thousands of free films and series, with ads. The ads are also free.' },

  { id: 'nimbus', name: 'Nimbus', short: 'NIMBUS', word: 'NIMBUS', mark: 'mCube',
    c1: '#d8232a', c2: '#2b0507', tex: 'tex-glow', layout: 'word', cat: 'movies', kind: 'svod',
    dev: 'Sheinhardt Wig Company', rating: 4.6, reviews: '842,119', size: '92.4 MB', ver: '9.4.0',
    desc: 'Prestige originals. Two have been renewed; the rest end on a cliffhanger for ever.' },

  { id: 'vantage', name: 'Vantage+', short: 'VANTAGE', word: 'Vantage<span class="plus">+</span>', mark: 'mStar',
    c1: '#123a8f', c2: '#050d24', tex: 'tex-rays', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'The Bluth Company', rating: 4.5, reviews: '611,884', size: '104.8 MB', ver: '3.8.2',
    desc: 'Family films from a studio with an enormous back catalogue and one frozen banana stand.' },

  { id: 'orbit', name: 'Orbit Video', short: 'ORBIT', word: 'orbit', tag: 'video', mark: 'mOrbit',
    c1: '#1a9fd4', c2: '#062435', tex: 'tex-arc', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Kruger Industrial Smoothing', rating: 4.2, reviews: '498,220', size: '88.1 MB', ver: '7.1.5',
    desc: 'Included with your membership. The membership is for something else entirely.' },

  { id: 'halo', name: 'Halo TV', short: 'HALO', word: 'HALO', tag: 'tv', mark: 'mRing',
    c1: '#3a3f47', c2: '#0b0c0e', tex: 'tex-glow', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Sterling Cooper', rating: 4.3, reviews: '212,900', size: '76.0 MB', ver: '2.9.4',
    desc: 'Four originals a year. Each is eight hours of a man looking thoughtfully at the sea.' },

  { id: 'kite', name: 'Kite', short: 'KITE', word: 'KITE', mark: 'mKite',
    c1: '#ffc93c', c2: '#8a5a00', ink: '#1a1200', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'Wernham Hogg', rating: 4.1, reviews: '304,551', size: '54.7 MB', ver: '6.0.9',
    desc: 'Free films, free ads, free opinions. No account, no card, no escape from the ads.' },

  { id: 'peak', name: 'Peakstream', short: 'PEAK', word: 'Peak<span class="thin">stream</span>', mark: 'mPeak',
    c1: '#0e7f7a', c2: '#03231f', tex: 'tex-grid', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Initech', rating: 4.0, reviews: '156,772', size: '81.3 MB', ver: '4.4.1',
    desc: 'Documentaries about mountains, made largely by people who have not been up one.' },

  { id: 'lumen', name: 'Lumen', short: 'LUMEN', word: 'lumen', mark: 'mDrop',
    c1: '#f08a24', c2: '#3d1a02', tex: 'tex-glow', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Lumon Industries', rating: 3.9, reviews: '98,214', size: '70.9 MB', ver: '5.2.0',
    desc: 'Wellness sessions, a waffle party and a nine-part series about a lift. Please enjoy each channel equally.' },

  { id: 'sportswire', name: 'SportsWire', short: 'SPORTS', word: 'SPORTS<span class="thin">WIRE</span>', mark: 'mBolt',
    c1: '#1c8a3c', c2: '#04180a', tex: 'tex-diag', layout: 'inline', cat: 'sports', kind: 'sports',
    dev: 'Springfield Isotopes Network', rating: 3.8, reviews: '221,309', size: '64.5 MB', ver: '8.3.3',
    desc: 'Live games, highlights, and four men disagreeing about them until midnight.' },

  { id: 'newspulse', name: 'NewsPulse', short: 'NEWS', word: 'News<span class="thin">Pulse</span>', mark: 'mSignal',
    c1: '#c02026', c2: '#240406', tex: 'tex-grid', layout: 'inline', cat: 'news', kind: 'news',
    dev: 'Channel 6 Broadcasting', rating: 3.6, reviews: '77,930', size: '41.2 MB', ver: '3.1.7',
    desc: 'Rolling news, rolling mostly downhill. Free, live, and never once quiet.' },

  { id: 'tunestack', name: 'Tunestack', short: 'TUNES', word: 'tunestack', mark: 'mWave',
    c1: '#d6357f', c2: '#33061c', tex: 'tex-dots', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'KBBL Media', rating: 4.4, reviews: '410,556', size: '58.8 MB', ver: '11.0.2',
    desc: 'Music on the television, which is a thing people do now.' },

  { id: 'cascade', name: 'Cascade Kids', short: 'CASCADE', word: 'Cascade', tag: 'kids', mark: 'mLeaf',
    c1: '#39b54a', c2: '#0d3d16', tex: 'tex-dots', layout: 'stack', cat: 'kids', kind: 'kids',
    dev: 'Sweetums Family', rating: 4.7, reviews: '188,004', size: '73.6 MB', ver: '2.5.8',
    desc: 'Cartoons for smaller people, and a parent lock they worked out in an afternoon.' },

  { id: 'reelhouse', name: 'Reelhouse', short: 'REEL', word: 'REELHOUSE', mark: 'mPlay',
    c1: '#7c1b32', c2: '#1e040c', tex: 'tex-rays', layout: 'box', cat: 'movies', kind: 'svod',
    dev: 'Nakatomi Pictures', rating: 4.2, reviews: '64,118', size: '49.9 MB', ver: '1.9.3',
    desc: 'Restored classics, including a six-hour cut nobody restored on purpose.' },

  { id: 'freeplay', name: 'FreePlay', short: 'FREEPLAY', word: 'FreePlay', mark: 'mPlay',
    c1: '#ff6a1f', c2: '#3a1000', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'Buy n Large', rating: 3.7, reviews: '142,880', size: '46.1 MB', ver: '4.7.0',
    desc: 'Free films with ad breaks placed by someone who has never watched a film.' },

  { id: 'verity', name: 'Verity', short: 'VERITY', word: 'VERITY', tag: 'documentary', mark: 'mEye',
    c1: '#5a6b2a', c2: '#161c07', tex: 'tex-grid', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Weyland-Yutani Media', rating: 4.5, reviews: '52,301', size: '44.3 MB', ver: '2.2.6',
    desc: 'Building better worlds, and feature documentaries about them.' },

  { id: 'retroreel', name: 'Retro Reel', short: 'RETRO', word: 'Retro<span class="thin">Reel</span>', mark: 'mFilm',
    c1: '#a8763f', c2: '#2b1a09', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'Channel 6 Archives', rating: 4.0, reviews: '39,447', size: '38.7 MB', ver: '3.0.4',
    desc: 'Television from the archive, free with ads, in whatever aspect ratio it survived in.' },

  { id: 'cityfeed', name: 'CityFeed', short: 'CITY', word: 'CityFeed', tag: 'local', mark: 'mBars',
    c1: '#31526e', c2: '#0a1520', tex: 'tex-grid', layout: 'inline', cat: 'news', kind: 'news',
    dev: 'Pawnee Public Access', rating: 3.4, reviews: '18,220', size: '31.5 MB', ver: '1.6.2',
    desc: 'Local news, local weather, and a man who says what he is currently doing.' },

  { id: 'skywatch', name: 'SkyWatch', short: 'SKY', word: 'SKYWATCH', mark: 'mDrop',
    c1: '#1d7fc4', c2: '#051a2c', tex: 'tex-arc', layout: 'box', cat: 'news', kind: 'news',
    dev: 'Cyberdyne Systems', rating: 4.1, reviews: '61,004', size: '29.8 MB', ver: '5.5.1',
    desc: 'Forecasts computed by something that has recently become self-aware about rain.' },

  { id: 'mediaplayer', name: 'Media Player', short: 'MEDIA', word: 'Media', tag: 'player', mark: 'mPlay',
    c1: '#4a4f57', c2: '#15171a', tex: 'tex-none', layout: 'stack', cat: 'featured', kind: 'utility', built: true,
    dev: 'Included', rating: 3.9, reviews: '92,118', size: '12.4 MB', ver: '6.1.0',
    desc: 'Plays video, music and photos off a USB stick. Yes, that USB stick. Try the other port.' },

  /* ---- available in the store ----------------------------------------- */
  { id: 'animealley', name: 'AnimeAlley', short: 'ANIME', word: 'ANIME<span class="thin">ALLEY</span>', mark: 'mPrism',
    c1: '#b21e9a', c2: '#25052a', tex: 'tex-rays', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Tyrell Corporation', rating: 4.6, reviews: '233,908', size: '66.2 MB', ver: '7.7.7',
    desc: 'Subbed, dubbed, and one show where the argument about which is better is the plot.' },

  { id: 'fitstream', name: 'FitStream', short: 'FIT', word: 'FitStream', mark: 'mBolt',
    c1: '#8ac926', c2: '#1d2f04', ink: '#0d1502', tex: 'tex-diag', layout: 'inline', cat: 'fitness', kind: 'svod',
    dev: 'Globo Gym Media', rating: 4.3, reviews: '71,455', size: '52.0 MB', ver: '4.0.1',
    desc: 'Guided workouts from ten minutes to an hour. If you can dodge a wrench, you can subscribe.' },

  { id: 'gamegrid', name: 'GameGrid', short: 'GAMES', word: 'GAME<span class="thin">GRID</span>', mark: 'mHex',
    c1: '#12e2a3', c2: '#04211a', ink: '#04211a', tex: 'tex-grid', layout: 'inline', cat: 'games', kind: 'game',
    dev: 'ENCOM', rating: 3.5, reviews: '44,210', size: '118.9 MB', ver: '2.3.0',
    desc: 'Games you play with a television remote, which is its own kind of challenge.' },

  { id: 'podwave', name: 'Podwave', short: 'PODS', word: 'podwave', mark: 'mWave',
    c1: '#ff5d5d', c2: '#3a0808', tex: 'tex-dots', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'MacLaren Audio', rating: 4.0, reviews: '28,913', size: '24.6 MB', ver: '3.4.2',
    desc: 'Podcasts with artwork, chapters, and a host who will get to the point in forty minutes.' },

  { id: 'sagebrush', name: 'Sagebrush', short: 'SAGE', word: 'SAGEBRUSH', mark: 'mPeak',
    c1: '#b8823c', c2: '#2c1c07', tex: 'tex-diag', layout: 'box', cat: 'free', kind: 'avod',
    dev: 'Sagebrush Television', rating: 3.8, reviews: '15,772', size: '33.1 MB', ver: '1.4.9',
    desc: 'Westerns, day and night, free with ads. Somebody always gets to the river first.' },

  { id: 'nightowl', name: 'Night Owl', short: 'OWL', word: 'Night<span class="thin">Owl</span>', mark: 'mEye',
    c1: '#4b1d7a', c2: '#0e0418', tex: 'tex-glow', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Miskatonic Media', rating: 4.1, reviews: '88,620', size: '47.7 MB', ver: '2.8.0',
    desc: 'Horror and thrillers, plus a live channel that is only ever on at 3am.' },

  { id: 'tidepool', name: 'Tidepool', short: 'TIDE', word: 'tidepool', mark: 'mDrop',
    c1: '#149ba0', c2: '#032a2c', tex: 'tex-arc', layout: 'stack', cat: 'featured', kind: 'svod',
    dev: 'Oceanic Media', rating: 4.8, reviews: '112,004', size: '61.8 MB', ver: '3.3.3',
    desc: 'Nature in 4K, narrated by a voice that has clearly seen things.' },

  { id: 'courtside', name: 'Courtside', short: 'COURT', word: 'COURTSIDE', mark: 'mRing',
    c1: '#e8701a', c2: '#2f1102', tex: 'tex-arc', layout: 'box', cat: 'sports', kind: 'sports',
    dev: 'Average Joe’s Broadcasting', rating: 3.9, reviews: '132,880', size: '57.2 MB', ver: '6.6.1',
    desc: 'Basketball, live and on demand, with a games pass that renews when you are asleep.' },

  { id: 'pitchside', name: 'Pitchside', short: 'PITCH', word: 'Pitchside', mark: 'mGlobe',
    c1: '#127a4a', c2: '#03200f', tex: 'tex-grid', layout: 'inline', cat: 'sports', kind: 'sports',
    dev: 'Richmond Greyhound Media', rating: 4.0, reviews: '176,331', size: '59.4 MB', ver: '5.1.2',
    desc: 'Football from eleven leagues. Believe.' },

  { id: 'gearhead', name: 'Gearhead', short: 'GEAR', word: 'GEARHEAD', mark: 'mCube',
    c1: '#c4171f', c2: '#141416', tex: 'tex-diag', layout: 'box', cat: 'free', kind: 'avod',
    dev: 'Tool Time Productions', rating: 3.7, reviews: '22,447', size: '35.9 MB', ver: '2.0.6',
    desc: 'Cars, restorations and race replays. More power than the job strictly requires.' },

  { id: 'hearthside', name: 'Hearthside', short: 'HEARTH', word: 'Hearthside', mark: 'mFlame',
    c1: '#d1452f', c2: '#2e0a04', tex: 'tex-glow', layout: 'inline', cat: 'featured', kind: 'avod',
    dev: 'Krusty Burger Test Kitchen', rating: 4.2, reviews: '54,118', size: '42.8 MB', ver: '4.2.2',
    desc: 'Cooking shows and recipes sized for a television nobody is standing near.' },

  { id: 'blueprint', name: 'Blueprint', short: 'BLUE', word: 'BLUEPRINT', mark: 'mHex',
    c1: '#16406e', c2: '#040d18', tex: 'tex-grid', layout: 'box', cat: 'featured', kind: 'avod',
    dev: 'Vandelay Industries', rating: 3.9, reviews: '31,209', size: '37.4 MB', ver: '1.8.1',
    desc: 'Home renovation and design, presented by a latex salesman who always wanted to be an architect.' },

  { id: 'stargazer', name: 'Stargazer', short: 'STAR', word: 'stargazer', mark: 'mStar',
    c1: '#2a2f8f', c2: '#06081f', tex: 'tex-dots', layout: 'stack', cat: 'featured', kind: 'svod',
    dev: 'Massive Dynamic', rating: 4.6, reviews: '68,772', size: '55.0 MB', ver: '3.9.0',
    desc: 'Space and science, in 4K, narrated slowly enough to fall asleep to.' },

  { id: 'laughtrack', name: 'LaughTrack', short: 'LAUGH', word: 'LaughTrack', mark: 'mWave',
    c1: '#f2c317', c2: '#3d2f01', ink: '#231b00', tex: 'tex-dots', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'TGS Productions', rating: 3.8, reviews: '47,881', size: '39.6 MB', ver: '2.6.5',
    desc: 'Sketch, stand-up and sitcoms. Home of a live variety show that is mostly staff meetings.' },

  { id: 'chapterhouse', name: 'Chapterhouse', short: 'CHAPTER', word: 'Chapterhouse', mark: 'mBars',
    c1: '#7a5230', c2: '#1d1108', tex: 'tex-none', layout: 'inline', cat: 'music', kind: 'music',
    dev: 'Bookhouse Audio', rating: 4.1, reviews: '19,330', size: '27.2 MB', ver: '1.5.0',
    desc: 'Audiobooks with a sleep timer, and a resume point that is usually about right.' },

  { id: 'vinylroom', name: 'Vinyl Room', short: 'VINYL', word: 'VINYL<span class="thin">ROOM</span>', mark: 'mRing',
    c1: '#6a2c86', c2: '#180624', tex: 'tex-arc', layout: 'inline', cat: 'music', kind: 'music',
    dev: 'Roadhouse Records', rating: 4.3, reviews: '25,704', size: '30.9 MB', ver: '2.1.4',
    desc: 'Concert films and music documentaries. There is always a singer at the Roadhouse.' },

  { id: 'clearview', name: 'ClearView', short: 'CLEAR', word: 'ClearView', tag: 'news', mark: 'mSignal',
    c1: '#41525e', c2: '#0c1216', tex: 'tex-grid', layout: 'stack', cat: 'news', kind: 'news',
    dev: 'Network 23', rating: 3.5, reviews: '40,118', size: '33.8 MB', ver: '4.9.2',
    desc: 'National and world news, live, free, and twenty minutes into the future.' },

  { id: 'bumblebee', name: 'Bumble Bee Jr.', short: 'BUMBLE', word: 'Bumble<span class="thin">Bee</span>', mark: 'mLeaf',
    c1: '#3fa9f5', c2: '#0a2b46', tex: 'tex-dots', layout: 'inline', cat: 'kids', kind: 'kids',
    dev: 'Itchy & Scratchy Studios', rating: 4.5, reviews: '96,220', size: '48.5 MB', ver: '3.2.1',
    desc: 'Songs and short episodes for preschoolers, from a studio better known for violence.' },

  { id: 'saltsteel', name: 'Salt & Steel', short: 'SALT', word: 'Salt<span class="thin">&amp;Steel</span>', mark: 'mGlobe',
    c1: '#127a86', c2: '#031f24', tex: 'tex-arc', layout: 'inline', cat: 'featured', kind: 'avod',
    dev: 'Der Waffle Haus Travel', rating: 4.0, reviews: '21,558', size: '36.2 MB', ver: '1.7.3',
    desc: 'Travel series shot on the coast by people who never once check the weather.' },

  { id: 'quartzfm', name: 'Quartz FM', short: 'QUARTZ', word: 'QUARTZ', tag: 'fm', mark: 'mSignal',
    c1: '#8b8f97', c2: '#1d1f23', ink: '#121315', tex: 'tex-none', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'K-Billy Radio', rating: 3.6, reviews: '12,880', size: '18.4 MB', ver: '2.4.0',
    desc: 'Internet radio by genre and city. Super sounds of the seventies, weekend long.' },

  { id: 'arcadia', name: 'Arcadia', short: 'ARCADE', word: 'ARCADIA', mark: 'mHex',
    c1: '#ff2d95', c2: '#1c0320', tex: 'tex-grid', layout: 'box', cat: 'games', kind: 'game',
    dev: 'Flynn’s Arcade', rating: 3.9, reviews: '35,004', size: '142.7 MB', ver: '5.0.3',
    desc: 'Arcade games from the eighties. Greetings, programs.' },

  { id: 'wanderlight', name: 'Wanderlight', short: 'WANDER', word: 'wanderlight', mark: 'mDrop',
    c1: '#e0603c', c2: '#2b0d05', tex: 'tex-glow', layout: 'stack', cat: 'featured', kind: 'avod',
    dev: 'Griswold Family Films', rating: 4.2, reviews: '17,442', size: '34.0 MB', ver: '1.3.8',
    desc: 'Slow travel films and city walks. Nobody arrives, and that is the appeal.' },

  { id: 'ironpeak', name: 'Iron Peak', short: 'IRON', word: 'IRON<span class="thin">PEAK</span>', mark: 'mPeak',
    c1: '#7b1113', c2: '#17181b', tex: 'tex-diag', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Kickpuncher Productions', rating: 3.7, reviews: '58,119', size: '51.3 MB', ver: '2.7.2',
    desc: 'Action films where the hero’s legs were replaced with fists. Ad-free with a subscription.' },

  { id: 'lullaby', name: 'Lullaby', short: 'LULL', word: 'lullaby', mark: 'mLeaf',
    c1: '#9b8bd6', c2: '#221c3d', tex: 'tex-glow', layout: 'stack', cat: 'kids', kind: 'kids',
    dev: 'Mr. Peanutbutter’s House', rating: 4.4, reviews: '30,118', size: '22.9 MB', ver: '1.2.5',
    desc: 'Quiet stories and night-light scenes, with a timer that switches itself off. Does it though?' },
];

/* Catalogue lookup and the order the box ships in. */
const CH = Object.fromEntries(CHANNELS.map(c => [c.id, c]));

const PREINSTALLED = [
  'beacon', 'nimbus', 'vantage', 'orbit', 'halo', 'kite', 'peak', 'lumen',
  'sportswire', 'newspulse', 'tunestack', 'cascade', 'reelhouse', 'freeplay',
  'verity', 'retroreel', 'cityfeed', 'skywatch', 'mediaplayer',
];

/* The four shortcut buttons printed on the remote. */
const REMOTE_SHORTCUTS = ['nimbus', 'vantage', 'orbit', 'beacon'];

const STORE_CATEGORIES = [
  { id: 'featured', name: 'Featured' },
  { id: 'movies',   name: 'Movies & TV' },
  { id: 'free',     name: 'Top Free' },
  { id: 'sports',   name: 'Sports' },
  { id: 'news',     name: 'News & Weather' },
  { id: 'kids',     name: 'Kids & Family' },
  { id: 'music',    name: 'Music & Podcasts' },
  { id: 'fitness',  name: 'Fitness' },
  { id: 'games',    name: 'Games' },
];

/* ------------------------------------------------------------------ titles */

/* Every one of these is a show that only exists inside another show. kind is
   'movie' or 'series'; price is 'free' (with ads), 'sub' (included with a
   subscription) or a rental figure; `on` is the services carrying it. */
const TITLES = [
  { id: 't01', title: 'The Girlie Show', year: 2024, rated: 'TV-14', genre: 'Comedy', mins: 44, kind: 'series', price: 'free', on: ['laughtrack', 'kite'],
    desc: 'A live sketch show, ninety per cent of which is about its own staff meetings.' },
  { id: 't02', title: 'The Rural Juror', year: 2023, rated: 'PG-13', genre: 'Drama', mins: 106, kind: 'movie', price: 'sub', on: ['nimbus'],
    desc: 'Nobody involved can say the title out loud. The sequel is called Urban Fervor.' },
  { id: 't03', title: 'Are You Stronger Than a Dog?', year: 2022, rated: 'TV-PG', genre: 'Game show', mins: 42, kind: 'series', price: 'free', on: ['kite', 'freeplay'],
    desc: 'A contestant arm-wrestles a dog. So far the dog is undefeated.' },
  { id: 't04', title: 'Threat Level Midnight', year: 2011, rated: 'PG-13', genre: 'Action', mins: 88, kind: 'movie', price: 'free', on: ['freeplay', 'ironpeak'],
    desc: 'An agent comes out of retirement to stop a man from blowing up the All-Star Game. Eleven years in the making.' },
  { id: 't05', title: 'Nine Fathoms', year: 2024, rated: 'TV-PG', genre: 'Nature', mins: 52, kind: 'series', price: 'sub', on: ['tidepool', 'verity'],
    desc: 'Six episodes following one reef through a year, narrated by a man who has clearly seen things.' },
  { id: 't06', title: 'Inspector Spacetime', year: 2025, rated: 'TV-PG', genre: 'Science fiction', mins: 48, kind: 'series', price: 'sub', on: ['halo', 'nimbus'],
    desc: 'A time-travelling inspector and his Constable. Eleven of them so far, and the argument continues.' },
  { id: 't07', title: 'Horsin’ Around', year: 1993, rated: 'TV-G', genre: 'Comedy', mins: 24, kind: 'series', price: 'free', on: ['retroreel', 'kite'],
    desc: 'A horse raises three orphans. Nine seasons. It got dark towards the end.' },
  { id: 't08', title: 'Kickpuncher', year: 2021, rated: 'R', genre: 'Action', mins: 97, kind: 'movie', price: 'sub', on: ['ironpeak'],
    desc: 'A cop whose legs were replaced with fists. Followed by Kickpuncher II: Codename Punchkicker.' },
  { id: 't09', title: 'Rochelle, Rochelle', year: 1995, rated: 'R', genre: 'Drama', mins: 102, kind: 'movie', price: '3.99', on: ['orbit', 'reelhouse'],
    desc: 'A young woman’s strange journey from Milan to Minsk. Now, inexplicably, a Broadway musical.' },
  { id: 't10', title: 'Invitation to Love', year: 1990, rated: 'TV-14', genre: 'Mystery', mins: 46, kind: 'series', price: 'free', on: ['retroreel', 'sagebrush'],
    desc: 'A soap opera that is always playing on somebody else’s television, in the background, ominously.' },
  { id: 't11', title: 'Macrodata Refinement', year: 2025, rated: 'TV-MA', genre: 'Drama', mins: 58, kind: 'series', price: 'sub', on: ['lumen', 'halo'],
    desc: 'Four people sort numbers that feel scary. Nine hours. Please enjoy each episode equally.' },
  { id: 't12', title: 'Tool Time', year: 1994, rated: 'TV-G', genre: 'Food', mins: 26, kind: 'series', price: 'free', on: ['gearhead', 'blueprint'],
    desc: 'A man rewires a dishwasher with considerably more power than the job requires.' },
  { id: 't13', title: 'Ya Heard? with Perd', year: 2024, rated: 'TV-G', genre: 'News', mins: 30, kind: 'series', price: 'free', on: ['cityfeed', 'clearview'],
    desc: 'The news, delivered slowly, by a man who narrates what he is currently doing.' },
  { id: 't14', title: 'The Nightman Cometh', year: 2023, rated: 'TV-MA', genre: 'Musical', mins: 41, kind: 'movie', price: 'free', on: ['laughtrack', 'kite'],
    desc: 'A rock opera about a troll, a boy and a coffee shop. Staged once, at enormous personal cost.' },
  { id: 't15', title: 'Gold Case', year: 2022, rated: 'TV-PG', genre: 'Game show', mins: 44, kind: 'series', price: 'free', on: ['kite'],
    desc: 'One of these cases has gold in it. That is the entire format, and it works.' },
  { id: 't16', title: 'Meridian', year: 2021, rated: 'PG-13', genre: 'Science fiction', mins: 128, kind: 'movie', price: '4.99', on: ['orbit', 'stargazer'],
    desc: 'A survey ship crosses a line on the map that should not have been there.' },
  { id: 't17', title: 'Angels with Filthy Souls', year: 1946, rated: 'R', genre: 'Crime', mins: 84, kind: 'movie', price: 'free', on: ['retroreel', 'reelhouse'],
    desc: 'A gangster picture best known for one line, one staircase and a great deal of change.' },
  { id: 't18', title: 'Mock Trial with J. Reinhold', year: 2005, rated: 'TV-14', genre: 'Crime', mins: 43, kind: 'series', price: 'free', on: ['freeplay', 'kite'],
    desc: 'Real cases, fake celebrity judges, and one host taking it far more seriously than anyone else.' },
  { id: 't19', title: 'Scandalmakers', year: 2006, rated: 'TV-14', genre: 'Documentary', mins: 45, kind: 'series', price: 'free', on: ['freeplay', 'verity'],
    desc: 'Dramatic reconstructions of things that happened to one family in Orange County.' },
  { id: 't20', title: 'Northlight', year: 2025, rated: 'TV-PG', genre: 'Nature', mins: 58, kind: 'series', price: 'sub', on: ['tidepool', 'stargazer'],
    desc: 'Four seasons above the Arctic circle, filmed from one valley, by one very cold crew.' },
  { id: 't21', title: 'The Vindicators', year: 2024, rated: 'TV-MA', genre: 'Action', mins: 51, kind: 'series', price: 'sub', on: ['ironpeak', 'nimbus'],
    desc: 'A team of heroes assembles to save a planet. One of them is not sober for any of it.' },
  { id: 't22', title: 'Radioactive Man', year: 2019, rated: 'PG', genre: 'Animation', mins: 96, kind: 'movie', price: 'sub', on: ['vantage', 'cascade'],
    desc: 'Up and at them. Now with a sidekick nobody voted for.' },
  { id: 't23', title: 'Sack Lunch', year: 1998, rated: 'PG', genre: 'Comedy', mins: 91, kind: 'movie', price: '2.99', on: ['orbit', 'freeplay'],
    desc: 'A family lives in a paper bag. The trailer gives away the ending, which is the bag.' },
  { id: 't24', title: 'Prognosis Negative', year: 1997, rated: 'PG-13', genre: 'Drama', mins: 99, kind: 'movie', price: '2.99', on: ['orbit', 'reelhouse'],
    desc: 'Terrible news, delivered beautifully, for an hour and thirty-nine minutes.' },
  { id: 't25', title: 'Death Blow', year: 1994, rated: 'R', genre: 'Action', mins: 104, kind: 'movie', price: 'sub', on: ['ironpeak', 'sagebrush'],
    desc: 'When someone tries to kill you, you kill them right back.' },
  { id: 't26', title: 'The Sunday Match', year: 2024, rated: 'TV-PG', genre: 'Sport', mins: 90, kind: 'series', price: 'sub', on: ['pitchside', 'sportswire'],
    desc: 'A full season with a club two divisions below where it used to be. Believe.' },
  { id: 't27', title: 'Static', year: 2021, rated: 'TV-MA', genre: 'Horror', mins: 98, kind: 'movie', price: 'sub', on: ['nightowl'],
    desc: 'A radio engineer keeps hearing a station that stopped broadcasting in 1974.' },
  { id: 't28', title: 'Chardee MacDennis', year: 2023, rated: 'TV-MA', genre: 'Game show', mins: 38, kind: 'series', price: 'free', on: ['laughtrack', 'gamegrid'],
    desc: 'The game of games. The rules are never explained and the tribunal is binding.' },
  { id: 't29', title: 'Boyfights', year: 2004, rated: 'TV-14', genre: 'Documentary', mins: 32, kind: 'series', price: 'free', on: ['freeplay', 'gearhead'],
    desc: 'Home footage. Two brothers. No supervision. Nine volumes.' },
  { id: 't30', title: 'Terrance & Phillip', year: 1998, rated: 'TV-MA', genre: 'Animation', mins: 22, kind: 'series', price: 'free', on: ['laughtrack', 'retroreel'],
    desc: 'Two Canadians. One joke. Forty seasons and no sign of fatigue.' },
  { id: 't31', title: 'Mac and C.H.E.E.S.E.', year: 1999, rated: 'TV-PG', genre: 'Crime', mins: 44, kind: 'series', price: 'free', on: ['retroreel'],
    desc: 'A police officer and his crime-fighting robot. Cancelled after the pilot; the robot was fine.' },
  { id: 't32', title: 'Stab 8: The Reboot', year: 2022, rated: 'R', genre: 'Horror', mins: 101, kind: 'movie', price: '4.99', on: ['nightowl', 'orbit'],
    desc: 'A film about the murders, based on the book about the murders, filmed where the murders were.' },
  { id: 't33', title: 'Hollywoo Stars and Celebrities: What Do They Know? Do They Know Things?? Let’s Find Out!', year: 2018, rated: 'TV-14', genre: 'Game show', mins: 47, kind: 'series', price: 'free', on: ['kite', 'laughtrack'],
    desc: 'A celebrity quiz with a title no listings grid has ever printed in full.' },
  { id: 't34', title: 'Man Getting Hit by Football', year: 1996, rated: 'TV-G', genre: 'Comedy', mins: 3, kind: 'movie', price: 'free', on: ['kite', 'sportswire'],
    desc: 'A man is hit by a football. The film has been described as a work of genius by the man himself.' },
  { id: 't35', title: 'Werewolf Bar Mitzvah', year: 2021, rated: 'TV-PG', genre: 'Music', mins: 74, kind: 'movie', price: 'sub', on: ['vinylroom', 'tunestack'],
    desc: 'A novelty single, extended to feature length, then to a live tour, then to an apology.' },
  { id: 't36', title: 'Homonym', year: 2023, rated: 'TV-G', genre: 'Game show', mins: 30, kind: 'series', price: 'free', on: ['kite', 'laughtrack'],
    desc: 'A contestant is asked to spell a word. The contestant then loses. Every time.' },
  { id: 't37', title: 'The Long Harbour', year: 2024, rated: 'TV-14', genre: 'Drama', mins: 118, kind: 'movie', price: 'sub', on: ['nimbus', 'peak'],
    desc: 'A ferry pilot returns to the island she grew up on and finds the crossing has been sold.' },
  { id: 't38', title: 'Salt Flats', year: 2025, rated: 'TV-14', genre: 'Documentary', mins: 88, kind: 'movie', price: 'sub', on: ['verity', 'peak'],
    desc: 'The last land-speed team still building their car by hand, and mostly in a shed.' },
  { id: 't39', title: 'Ninth Street Kitchen', year: 2023, rated: 'TV-G', genre: 'Food', mins: 26, kind: 'series', price: 'free', on: ['hearthside', 'kite'],
    desc: 'One kitchen, one street, and whatever the market had that morning.' },
  { id: 't40', title: 'Little Dipper', year: 2024, rated: 'G', genre: 'Kids', mins: 22, kind: 'series', price: 'sub', on: ['cascade', 'bumblebee'],
    desc: 'A small bear learns the night sky one constellation at a time, very slowly, on purpose.' },
  { id: 't41', title: 'Paper Boats', year: 2023, rated: 'G', genre: 'Kids', mins: 18, kind: 'series', price: 'sub', on: ['bumblebee', 'lullaby'],
    desc: 'Small stories for the end of the day, told quietly enough to work.' },
  { id: 't42', title: 'Sunday Roads', year: 2022, rated: 'TV-G', genre: 'Travel', mins: 34, kind: 'series', price: 'free', on: ['wanderlight', 'saltsteel'],
    desc: 'Long, slow drives with no narration and unreasonably good sound.' },
  { id: 't43', title: 'Open Water Mile', year: 2025, rated: 'TV-PG', genre: 'Sport', mins: 68, kind: 'movie', price: 'free', on: ['sportswire', 'kite'],
    desc: 'Six swimmers train through winter for one race in water nobody should be in.' },
  { id: 't44', title: 'Grand Circuit', year: 2023, rated: 'TV-14', genre: 'Sport', mins: 44, kind: 'series', price: 'free', on: ['gearhead', 'sportswire'],
    desc: 'A season inside a privateer racing team with one car, no spare and considerable optimism.' },
  { id: 't45', title: 'Downstream', year: 2023, rated: 'TV-PG', genre: 'Documentary', mins: 92, kind: 'movie', price: 'sub', on: ['peak', 'tidepool'],
    desc: 'One river from source to sea, and the eleven towns that argue about it.' },
  { id: 't46', title: 'Blue Hour', year: 2022, rated: 'PG', genre: 'Animation', mins: 87, kind: 'movie', price: 'sub', on: ['vantage'],
    desc: 'A lamplighter and a small comet keep each other company for one winter.' },
  { id: 't47', title: 'Philbert', year: 2019, rated: 'TV-MA', genre: 'Crime', mins: 49, kind: 'series', price: 'sub', on: ['halo', 'nimbus'],
    desc: 'A gritty detective drama that everybody involved insists is not about them.' },
  { id: 't48', title: 'Wolf Cola: A Family Drink', year: 2024, rated: 'TV-14', genre: 'Documentary', mins: 61, kind: 'movie', price: 'free', on: ['freeplay', 'verity'],
    desc: 'The inside story of a soft drink, told by a family who is very thirsty.' },
];

const TITLE_BY_ID = Object.fromEntries(TITLES.map(t => [t.id, t]));

/* ---------------------------------------------------------------- live TV */

const LIVE_CHANNELS = [
  { num: '1.1',  id: 'beacon',     name: 'Beacon Movies' },
  { num: '1.2',  id: 'beacon',     name: 'Beacon Classics' },
  { num: '2.1',  id: 'newspulse',  name: 'NewsPulse Live' },
  { num: '2.2',  id: 'clearview',  name: 'ClearView 23' },
  { num: '3.1',  id: 'cityfeed',   name: 'Pawnee Public' },
  { num: '4.1',  id: 'sportswire', name: 'Isotopes Network' },
  { num: '4.2',  id: 'courtside',  name: 'Courtside Live' },
  { num: '5.1',  id: 'kite',       name: 'Kite Comedy' },
  { num: '5.2',  id: 'laughtrack', name: 'TGS 24/7' },
  { num: '6.1',  id: 'retroreel',  name: 'Retro Reel' },
  { num: '7.1',  id: 'sagebrush',  name: 'Sagebrush Westerns' },
  { num: '8.1',  id: 'skywatch',   name: 'SkyWatch Radar' },
  { num: '9.1',  id: 'tidepool',   name: 'Tidepool Ambient' },
  { num: '10.1', id: 'hearthside', name: 'Krusty Test Kitchen' },
  { num: '11.1', id: 'cascade',    name: 'Cascade Kids' },
  { num: '12.1', id: 'gearhead',   name: 'Tool Time Classics' },
];

/* Programme names the guide is filled from; the schedule itself is generated
   deterministically per channel and half-hour, so it never reshuffles. */
const PROGRAMMES = [
  'Morning Edition', 'Ya Heard? with Perd', 'Eye on Springfield', 'Tool Time',
  'Headlines at the Hour', 'Market Watch', 'Deep Field', 'Ninth Street Kitchen',
  'The Sunday Match', 'Second Innings', 'Classic Feature', 'Late Feature',
  'Weather on the Eights', 'Radar Live', 'Storm Track', 'Field Notes',
  'Reef Cam', 'Night Sky Live', 'Boyfights', 'Two Wheels', 'Pit Lane',
  'Itchy & Scratchy', 'Story Corner', 'Bedtime Hour', 'Stand-up Half Hour',
  'Homonym', 'Rerun Double Bill', 'Trail Ride', 'Sagebrush Feature',
  'Council Meeting Live', 'Traffic and Travel', 'Highlights Show',
  'Gold Case', 'Archive Hour', 'Open Water Mile', 'Grand Circuit',
  'Invitation to Love', 'Are You Stronger Than a Dog?', 'Mock Trial',
  'Scandalmakers', 'The Girlie Show', 'Terrance & Phillip',
];

/* --------------------------------------------------------------- settings */

const THEMES = [
  { id: 'roku',     name: 'Roku (default)', preview: 'radial-gradient(120% 100% at 8% 0%,#2c1c46,#17111f 46%,#0c0812)' },
  { id: 'daydream', name: 'Daydream',       preview: 'radial-gradient(130% 110% at 90% 0%,#1d3f6b,#101c33 48%,#070c16)' },
  { id: 'graphite', name: 'Graphite',       preview: 'linear-gradient(165deg,#23262b,#14161a 55%,#0a0b0d)' },
  { id: 'nebula',   name: 'Nebula',         preview: 'radial-gradient(110% 100% at 20% 10%,#4a1050,#1b0a2c 45%,#07040e)' },
  { id: 'sunrise',  name: 'Sunrise',        preview: 'linear-gradient(155deg,#5a2340,#2b1430 45%,#100813)' },
];

const SCREENSAVERS = [
  { id: 'clock',  name: 'Roku Digital Clock', desc: 'The time and date, drifting slowly around a black screen.' },
  { id: 'logo',   name: 'Roku Screensaver',   desc: 'The wordmark bouncing off the edges of the screen. It has never once hit the corner.' },
  { id: 'off',    name: 'None',               desc: 'Nothing is shown. The screen stays on whatever was left on it.' },
];

const SAVER_WAITS = [
  { id: 1, name: '1 minute' }, { id: 5, name: '5 minutes' },
  { id: 10, name: '10 minutes' }, { id: 20, name: '20 minutes' },
  { id: 30, name: '30 minutes' }, { id: 0, name: 'Disabled' },
];

const DISPLAY_TYPES = [
  { id: 'auto',    name: 'Auto detect',   detail: 'Ask the television what it supports and use the best match.' },
  { id: '4khdr',   name: '4K HDR TV',     detail: '3840 x 2160 at 60Hz with high dynamic range.' },
  { id: '4k',      name: '4K TV',         detail: '3840 x 2160 at 60Hz, standard dynamic range.' },
  { id: '1080p',   name: '1080p TV',      detail: '1920 x 1080 at 60Hz.' },
  { id: '720p',    name: '720p TV',       detail: '1280 x 720 at 60Hz. Use this if the picture is missing or unstable.' },
];

const AUDIO_MODES = [
  { id: 'auto',    name: 'Auto (recommended)' },
  { id: 'stereo',  name: 'Stereo' },
  { id: 'passthru', name: 'Dolby Digital Plus (pass-through)' },
  { id: 'pcm',     name: 'PCM-Stereo' },
];

const VOLUME_MODES = [
  { id: 'off',      name: 'Off' },
  { id: 'leveling', name: 'Leveling' },
  { id: 'night',    name: 'Night' },
];

const CAPTION_MODES = [
  { id: 'off',    name: 'Off' },
  { id: 'always', name: 'On always' },
  { id: 'replay', name: 'On replay' },
  { id: 'mute',   name: 'On mute' },
];

const TIME_ZONES = [
  'US Eastern', 'US Central', 'US Mountain', 'US Arizona', 'US Pacific',
  'US Alaska', 'US Hawaii', 'Canada Atlantic', 'Canada Newfoundland',
];

const IDLE_POWER = ['Off', '15 minutes', '30 minutes', '1 hour', '4 hours'];

const LANGUAGES = ['English', 'Español', 'Français', 'Deutsch', 'Português', 'Nederlands'];
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Mexico', 'Australia'];

/* Networks the box can see when it scans. The household's own is first and
   sensible; the rest are what the neighbours actually call their routers. */
const VISIBLE_NETWORKS = [
  { ssid: 'Sunfish Cottage 5G',    secure: true,  signal: 4, band: '5 GHz' },
  { ssid: 'Sunfish Cottage',       secure: true,  signal: 4, band: '2.4 GHz' },
  { ssid: 'Sunfish Guest',         secure: false, signal: 3, band: '2.4 GHz' },
  { ssid: 'Pretty Fly for a WiFi', secure: true,  signal: 3, band: '5 GHz' },
  { ssid: 'The LAN Before Time',   secure: true,  signal: 2, band: '2.4 GHz' },
  { ssid: 'Martin Router King',    secure: true,  signal: 2, band: '5 GHz' },
  { ssid: 'Silence of the LANs',   secure: true,  signal: 1, band: '2.4 GHz' },
  { ssid: 'NOT A SURVEILLANCE VAN', secure: true, signal: 1, band: '2.4 GHz' },
  { ssid: 'Vandelay Industries',   secure: true,  signal: 1, band: '5 GHz' },
  { ssid: 'ORB-Setup',             secure: false, signal: 1, band: '2.4 GHz' },
];

/* --------------------------------------------------------------- helpers */

/** Titles carried by one service, in a stable order. */
function titlesOn(channelId) {
  return TITLES.filter(t => t.on.includes(channelId));
}

/** A deterministic shuffle, so a rail keeps its order between renders. */
function seededOrder(list, seed) {
  const random = rng(seed);
  return list
    .map(item => ({ item, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(entry => entry.item);
}

/** How a title's price reads in the interface. */
function priceLabel(price) {
  if (price === 'free') return { cls: 'free', text: 'Free' };
  if (price === 'sub')  return { cls: 'sub',  text: 'Subscription' };
  return { cls: 'buy', text: `Rent $${price}` };
}
