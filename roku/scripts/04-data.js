/* ===========================================================================
   The catalogue.

   Every streaming service, title, live channel and programme below is
   invented. None of them is a real product and none of the artwork is anyone's
   trademark — the point is a home screen that looks lived in, not a copy of
   somebody's brand. Anything that would be a real person, address or account
   is invented in the same way as in the other simulators in this repository.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------- channels */

/* word carries light markup so a wordmark can mix weights the way real ones
   do. mark is a glyph id from 02-icons.js; layout picks how the two sit
   together; tex is the CSS overlay class. */
const CHANNELS = [
  /* ---- the ones the box ships with ------------------------------------ */
  { id: 'beacon', name: 'The Beacon Channel', short: 'BEACON', word: 'Beacon', tag: 'free tv', mark: 'mSignal',
    c1: '#7b2fb5', c2: '#2c0f47', tex: 'tex-arc', layout: 'stack', cat: 'featured', kind: 'avod', built: true,
    dev: 'Beacon Media', rating: 4.4, reviews: '128,402', size: '68.2 MB', ver: '5.12.1',
    desc: 'Thousands of free movies, series and live channels with ads, plus the store for everything else.' },

  { id: 'nimbus', name: 'Nimbus TV', short: 'NIMBUS', word: 'NIMBUS', mark: 'mCube',
    c1: '#d8232a', c2: '#2b0507', tex: 'tex-glow', layout: 'word', cat: 'movies', kind: 'svod',
    dev: 'Nimbus Media Group', rating: 4.6, reviews: '842,119', size: '92.4 MB', ver: '9.4.0',
    desc: 'Originals, films and box sets. A subscription is required after the trial ends.' },

  { id: 'vantage', name: 'Vantage+', short: 'VANTAGE', word: 'Vantage<span class="plus">+</span>', mark: 'mStar',
    c1: '#123a8f', c2: '#050d24', tex: 'tex-rays', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Vantage Studios', rating: 4.5, reviews: '611,884', size: '104.8 MB', ver: '3.8.2',
    desc: 'Family films, animation and the studio back catalogue, all in one subscription.' },

  { id: 'orbit', name: 'Orbit Video', short: 'ORBIT', word: 'orbit', tag: 'video', mark: 'mOrbit',
    c1: '#1a9fd4', c2: '#062435', tex: 'tex-arc', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Orbit Retail', rating: 4.2, reviews: '498,220', size: '88.1 MB', ver: '7.1.5',
    desc: 'Included titles for members, plus rentals and purchases from the wider store.' },

  { id: 'halo', name: 'Halo TV', short: 'HALO', word: 'HALO', tag: 'tv', mark: 'mRing',
    c1: '#3a3f47', c2: '#0b0c0e', tex: 'tex-glow', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Halo Pictures', rating: 4.3, reviews: '212,900', size: '76.0 MB', ver: '2.9.4',
    desc: 'A small slate of originals, released weekly.' },

  { id: 'kite', name: 'Kite', short: 'KITE', word: 'KITE', mark: 'mKite',
    c1: '#ffc93c', c2: '#8a5a00', ink: '#1a1200', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'Kite Networks', rating: 4.1, reviews: '304,551', size: '54.7 MB', ver: '6.0.9',
    desc: 'Free films and live channels, supported by ads. No account needed.' },

  { id: 'peak', name: 'Peakstream', short: 'PEAK', word: 'Peak<span class="thin">stream</span>', mark: 'mPeak',
    c1: '#0e7f7a', c2: '#03231f', tex: 'tex-grid', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Peakstream Inc.', rating: 4.0, reviews: '156,772', size: '81.3 MB', ver: '4.4.1',
    desc: 'Documentaries, drama and a live news feed for subscribers.' },

  { id: 'lumen', name: 'Lumen', short: 'LUMEN', word: 'lumen', mark: 'mDrop',
    c1: '#f08a24', c2: '#3d1a02', tex: 'tex-glow', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Lumen Networks', rating: 3.9, reviews: '98,214', size: '70.9 MB', ver: '5.2.0',
    desc: 'Series and films from the Lumen network, ad-free on the higher tier.' },

  { id: 'sportswire', name: 'SportsWire', short: 'SPORTS', word: 'SPORTS<span class="thin">WIRE</span>', mark: 'mBolt',
    c1: '#1c8a3c', c2: '#04180a', tex: 'tex-diag', layout: 'inline', cat: 'sports', kind: 'sports',
    dev: 'SportsWire Media', rating: 3.8, reviews: '221,309', size: '64.5 MB', ver: '8.3.3',
    desc: 'Live games, highlights and a 24-hour sports channel.' },

  { id: 'newspulse', name: 'NewsPulse', short: 'NEWS', word: 'News<span class="thin">Pulse</span>', mark: 'mSignal',
    c1: '#c02026', c2: '#240406', tex: 'tex-grid', layout: 'inline', cat: 'news', kind: 'news',
    dev: 'Pulse Broadcasting', rating: 3.6, reviews: '77,930', size: '41.2 MB', ver: '3.1.7',
    desc: 'Rolling news, free and live around the clock.' },

  { id: 'tunestack', name: 'Tunestack', short: 'TUNES', word: 'tunestack', mark: 'mWave',
    c1: '#d6357f', c2: '#33061c', tex: 'tex-dots', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'Tunestack Audio', rating: 4.4, reviews: '410,556', size: '58.8 MB', ver: '11.0.2',
    desc: 'Music, playlists and concert films on the television.' },

  { id: 'cascade', name: 'Cascade Kids', short: 'CASCADE', word: 'Cascade', tag: 'kids', mark: 'mLeaf',
    c1: '#39b54a', c2: '#0d3d16', tex: 'tex-dots', layout: 'stack', cat: 'kids', kind: 'kids',
    dev: 'Cascade Family', rating: 4.7, reviews: '188,004', size: '73.6 MB', ver: '2.5.8',
    desc: 'Cartoons and shows for younger children, with a parent-locked profile.' },

  { id: 'reelhouse', name: 'Reelhouse', short: 'REEL', word: 'REELHOUSE', mark: 'mPlay',
    c1: '#7c1b32', c2: '#1e040c', tex: 'tex-rays', layout: 'box', cat: 'movies', kind: 'svod',
    dev: 'Reelhouse Classics', rating: 4.2, reviews: '64,118', size: '49.9 MB', ver: '1.9.3',
    desc: 'Restored classics and world cinema, curated weekly.' },

  { id: 'freeplay', name: 'FreePlay', short: 'FREEPLAY', word: 'FreePlay', mark: 'mPlay',
    c1: '#ff6a1f', c2: '#3a1000', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'FreePlay Networks', rating: 3.7, reviews: '142,880', size: '46.1 MB', ver: '4.7.0',
    desc: 'Free movies with ad breaks, refreshed every month.' },

  { id: 'verity', name: 'Verity', short: 'VERITY', word: 'VERITY', tag: 'documentary', mark: 'mEye',
    c1: '#5a6b2a', c2: '#161c07', tex: 'tex-grid', layout: 'stack', cat: 'movies', kind: 'svod',
    dev: 'Verity Films', rating: 4.5, reviews: '52,301', size: '44.3 MB', ver: '2.2.6',
    desc: 'Feature documentaries and investigative series.' },

  { id: 'retroreel', name: 'Retro Reel', short: 'RETRO', word: 'Retro<span class="thin">Reel</span>', mark: 'mFilm',
    c1: '#a8763f', c2: '#2b1a09', tex: 'tex-diag', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'Retro Reel Media', rating: 4.0, reviews: '39,447', size: '38.7 MB', ver: '3.0.4',
    desc: 'Television from the archives, free with ads.' },

  { id: 'cityfeed', name: 'CityFeed', short: 'CITY', word: 'CityFeed', tag: 'local', mark: 'mBars',
    c1: '#31526e', c2: '#0a1520', tex: 'tex-grid', layout: 'inline', cat: 'news', kind: 'news',
    dev: 'CityFeed Local', rating: 3.4, reviews: '18,220', size: '31.5 MB', ver: '1.6.2',
    desc: 'Local news, weather and traffic for your area, free.' },

  { id: 'skywatch', name: 'SkyWatch', short: 'SKY', word: 'SKYWATCH', mark: 'mDrop',
    c1: '#1d7fc4', c2: '#051a2c', tex: 'tex-arc', layout: 'box', cat: 'news', kind: 'news',
    dev: 'SkyWatch Weather', rating: 4.1, reviews: '61,004', size: '29.8 MB', ver: '5.5.1',
    desc: 'Forecasts, radar and live severe-weather coverage.' },

  { id: 'mediaplayer', name: 'Media Player', short: 'MEDIA', word: 'Media', tag: 'player', mark: 'mPlay',
    c1: '#4a4f57', c2: '#15171a', tex: 'tex-none', layout: 'stack', cat: 'featured', kind: 'utility', built: true,
    dev: 'Included', rating: 3.9, reviews: '92,118', size: '12.4 MB', ver: '6.1.0',
    desc: 'Plays video, music and photos from a USB drive or a shared folder on your network.' },

  /* ---- available in the store ----------------------------------------- */
  { id: 'animealley', name: 'AnimeAlley', short: 'ANIME', word: 'ANIME<span class="thin">ALLEY</span>', mark: 'mPrism',
    c1: '#b21e9a', c2: '#25052a', tex: 'tex-rays', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Alley Networks', rating: 4.6, reviews: '233,908', size: '66.2 MB', ver: '7.7.7',
    desc: 'Subtitled and dubbed animation, simulcast with the season.' },

  { id: 'fitstream', name: 'FitStream', short: 'FIT', word: 'FitStream', mark: 'mBolt',
    c1: '#8ac926', c2: '#1d2f04', ink: '#0d1502', tex: 'tex-diag', layout: 'inline', cat: 'fitness', kind: 'svod',
    dev: 'FitStream Health', rating: 4.3, reviews: '71,455', size: '52.0 MB', ver: '4.0.1',
    desc: 'Guided workouts on the big screen, from ten minutes to an hour.' },

  { id: 'gamegrid', name: 'GameGrid', short: 'GAMES', word: 'GAME<span class="thin">GRID</span>', mark: 'mHex',
    c1: '#12e2a3', c2: '#04211a', ink: '#04211a', tex: 'tex-grid', layout: 'inline', cat: 'games', kind: 'game',
    dev: 'GameGrid Interactive', rating: 3.5, reviews: '44,210', size: '118.9 MB', ver: '2.3.0',
    desc: 'Casual games you play with the remote. Nothing to install on a console.' },

  { id: 'podwave', name: 'Podwave', short: 'PODS', word: 'podwave', mark: 'mWave',
    c1: '#ff5d5d', c2: '#3a0808', tex: 'tex-dots', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'Podwave Audio', rating: 4.0, reviews: '28,913', size: '24.6 MB', ver: '3.4.2',
    desc: 'Podcasts with artwork and chapters, resuming where you left off.' },

  { id: 'sagebrush', name: 'Sagebrush', short: 'SAGE', word: 'SAGEBRUSH', mark: 'mPeak',
    c1: '#b8823c', c2: '#2c1c07', tex: 'tex-diag', layout: 'box', cat: 'free', kind: 'avod',
    dev: 'Sagebrush TV', rating: 3.8, reviews: '15,772', size: '33.1 MB', ver: '1.4.9',
    desc: 'Westerns, free with ads, running day and night.' },

  { id: 'nightowl', name: 'Night Owl', short: 'OWL', word: 'Night<span class="thin">Owl</span>', mark: 'mEye',
    c1: '#4b1d7a', c2: '#0e0418', tex: 'tex-glow', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Night Owl Films', rating: 4.1, reviews: '88,620', size: '47.7 MB', ver: '2.8.0',
    desc: 'Horror and thrillers, with a curated late-night live channel.' },

  { id: 'tidepool', name: 'Tidepool', short: 'TIDE', word: 'tidepool', mark: 'mDrop',
    c1: '#149ba0', c2: '#032a2c', tex: 'tex-arc', layout: 'stack', cat: 'featured', kind: 'svod',
    dev: 'Tidepool Nature', rating: 4.8, reviews: '112,004', size: '61.8 MB', ver: '3.3.3',
    desc: 'Nature series in 4K, plus ambient scenes for the screensaver.' },

  { id: 'courtside', name: 'Courtside', short: 'COURT', word: 'COURTSIDE', mark: 'mRing',
    c1: '#e8701a', c2: '#2f1102', tex: 'tex-arc', layout: 'box', cat: 'sports', kind: 'sports',
    dev: 'Courtside Sports', rating: 3.9, reviews: '132,880', size: '57.2 MB', ver: '6.6.1',
    desc: 'Basketball, live and on demand, with a games pass add-on.' },

  { id: 'pitchside', name: 'Pitchside', short: 'PITCH', word: 'Pitchside', mark: 'mGlobe',
    c1: '#127a4a', c2: '#03200f', tex: 'tex-grid', layout: 'inline', cat: 'sports', kind: 'sports',
    dev: 'Pitchside Networks', rating: 4.0, reviews: '176,331', size: '59.4 MB', ver: '5.1.2',
    desc: 'Football from eleven leagues, with a multi-view for weekend fixtures.' },

  { id: 'gearhead', name: 'Gearhead', short: 'GEAR', word: 'GEARHEAD', mark: 'mCube',
    c1: '#c4171f', c2: '#141416', tex: 'tex-diag', layout: 'box', cat: 'free', kind: 'avod',
    dev: 'Gearhead Motoring', rating: 3.7, reviews: '22,447', size: '35.9 MB', ver: '2.0.6',
    desc: 'Cars, restorations and race replays, free with ads.' },

  { id: 'hearthside', name: 'Hearthside', short: 'HEARTH', word: 'Hearthside', mark: 'mFlame',
    c1: '#d1452f', c2: '#2e0a04', tex: 'tex-glow', layout: 'inline', cat: 'featured', kind: 'avod',
    dev: 'Hearthside Food', rating: 4.2, reviews: '54,118', size: '42.8 MB', ver: '4.2.2',
    desc: 'Cooking shows and step-by-step recipes sized for a television.' },

  { id: 'blueprint', name: 'Blueprint', short: 'BLUE', word: 'BLUEPRINT', mark: 'mHex',
    c1: '#16406e', c2: '#040d18', tex: 'tex-grid', layout: 'box', cat: 'featured', kind: 'avod',
    dev: 'Blueprint Home', rating: 3.9, reviews: '31,209', size: '37.4 MB', ver: '1.8.1',
    desc: 'Home renovation and design, free with ads.' },

  { id: 'stargazer', name: 'Stargazer', short: 'STAR', word: 'stargazer', mark: 'mStar',
    c1: '#2a2f8f', c2: '#06081f', tex: 'tex-dots', layout: 'stack', cat: 'featured', kind: 'svod',
    dev: 'Stargazer Science', rating: 4.6, reviews: '68,772', size: '55.0 MB', ver: '3.9.0',
    desc: 'Space and science documentaries, narrated and in 4K.' },

  { id: 'laughtrack', name: 'LaughTrack', short: 'LAUGH', word: 'LaughTrack', mark: 'mWave',
    c1: '#f2c317', c2: '#3d2f01', ink: '#231b00', tex: 'tex-dots', layout: 'inline', cat: 'free', kind: 'avod',
    dev: 'LaughTrack Comedy', rating: 3.8, reviews: '47,881', size: '39.6 MB', ver: '2.6.5',
    desc: 'Stand-up and sitcoms, free with ads.' },

  { id: 'chapterhouse', name: 'Chapterhouse', short: 'CHAPTER', word: 'Chapterhouse', mark: 'mBars',
    c1: '#7a5230', c2: '#1d1108', tex: 'tex-none', layout: 'inline', cat: 'music', kind: 'music',
    dev: 'Chapterhouse Audio', rating: 4.1, reviews: '19,330', size: '27.2 MB', ver: '1.5.0',
    desc: 'Audiobooks with a sleep timer and a proper resume point.' },

  { id: 'vinylroom', name: 'Vinyl Room', short: 'VINYL', word: 'VINYL<span class="thin">ROOM</span>', mark: 'mRing',
    c1: '#6a2c86', c2: '#180624', tex: 'tex-arc', layout: 'inline', cat: 'music', kind: 'music',
    dev: 'Vinyl Room Media', rating: 4.3, reviews: '25,704', size: '30.9 MB', ver: '2.1.4',
    desc: 'Concert films and music documentaries, subscription only.' },

  { id: 'clearview', name: 'ClearView', short: 'CLEAR', word: 'ClearView', tag: 'news', mark: 'mSignal',
    c1: '#41525e', c2: '#0c1216', tex: 'tex-grid', layout: 'stack', cat: 'news', kind: 'news',
    dev: 'ClearView News', rating: 3.5, reviews: '40,118', size: '33.8 MB', ver: '4.9.2',
    desc: 'National and world news, live and free.' },

  { id: 'bumblebee', name: 'Bumble Bee Jr.', short: 'BUMBLE', word: 'Bumble<span class="thin">Bee</span>', mark: 'mLeaf',
    c1: '#3fa9f5', c2: '#0a2b46', tex: 'tex-dots', layout: 'inline', cat: 'kids', kind: 'kids',
    dev: 'Bumble Bee Kids', rating: 4.5, reviews: '96,220', size: '48.5 MB', ver: '3.2.1',
    desc: 'Songs and short episodes for preschoolers, with a screen-time limit.' },

  { id: 'saltsteel', name: 'Salt & Steel', short: 'SALT', word: 'Salt<span class="thin">&amp;Steel</span>', mark: 'mGlobe',
    c1: '#127a86', c2: '#031f24', tex: 'tex-arc', layout: 'inline', cat: 'featured', kind: 'avod',
    dev: 'Salt & Steel Travel', rating: 4.0, reviews: '21,558', size: '36.2 MB', ver: '1.7.3',
    desc: 'Travel series shot on the coast, free with ads.' },

  { id: 'quartzfm', name: 'Quartz FM', short: 'QUARTZ', word: 'QUARTZ', tag: 'fm', mark: 'mSignal',
    c1: '#8b8f97', c2: '#1d1f23', ink: '#121315', tex: 'tex-none', layout: 'stack', cat: 'music', kind: 'music',
    dev: 'Quartz Radio', rating: 3.6, reviews: '12,880', size: '18.4 MB', ver: '2.4.0',
    desc: 'Internet radio stations, sorted by genre and city.' },

  { id: 'arcadia', name: 'Arcadia', short: 'ARCADE', word: 'ARCADIA', mark: 'mHex',
    c1: '#ff2d95', c2: '#1c0320', tex: 'tex-grid', layout: 'box', cat: 'games', kind: 'game',
    dev: 'Arcadia Games', rating: 3.9, reviews: '35,004', size: '142.7 MB', ver: '5.0.3',
    desc: 'Arcade games from the eighties, playable with the remote.' },

  { id: 'wanderlight', name: 'Wanderlight', short: 'WANDER', word: 'wanderlight', mark: 'mDrop',
    c1: '#e0603c', c2: '#2b0d05', tex: 'tex-glow', layout: 'stack', cat: 'featured', kind: 'avod',
    dev: 'Wanderlight Media', rating: 4.2, reviews: '17,442', size: '34.0 MB', ver: '1.3.8',
    desc: 'Slow travel films and city walks, free with ads.' },

  { id: 'ironpeak', name: 'Iron Peak', short: 'IRON', word: 'IRON<span class="thin">PEAK</span>', mark: 'mPeak',
    c1: '#7b1113', c2: '#17181b', tex: 'tex-diag', layout: 'inline', cat: 'movies', kind: 'svod',
    dev: 'Iron Peak Pictures', rating: 3.7, reviews: '58,119', size: '51.3 MB', ver: '2.7.2',
    desc: 'Action films and series, ad-free with a subscription.' },

  { id: 'lullaby', name: 'Lullaby', short: 'LULL', word: 'lullaby', mark: 'mLeaf',
    c1: '#9b8bd6', c2: '#221c3d', tex: 'tex-glow', layout: 'stack', cat: 'kids', kind: 'kids',
    dev: 'Lullaby Kids', rating: 4.4, reviews: '30,118', size: '22.9 MB', ver: '1.2.5',
    desc: 'Quiet stories and night-light scenes, with a timer that switches itself off.' },
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

/* kind: 'movie' or 'series'. price: 'free' (with ads), 'sub' (included with a
   subscription) or a rental figure. `on` is the services carrying it. */
const TITLES = [
  { id: 't01', title: 'The Long Harbour', year: 2024, rated: 'TV-14', genre: 'Drama', mins: 118, kind: 'movie', price: 'sub', on: ['nimbus', 'peak'],
    desc: 'A ferry pilot returns to the island she grew up on and finds the crossing has been sold.' },
  { id: 't02', title: 'Copper Line', year: 2023, rated: 'TV-MA', genre: 'Thriller', mins: 106, kind: 'movie', price: 'sub', on: ['nimbus'],
    desc: 'Two engineers discover the fault they were sent to fix was never an accident.' },
  { id: 't03', title: 'Winter Postcards', year: 2022, rated: 'PG', genre: 'Family', mins: 94, kind: 'movie', price: 'free', on: ['kite', 'freeplay'],
    desc: 'A snowed-in post office reunites a town with the letters it never sent.' },
  { id: 't04', title: 'Salt Flats', year: 2025, rated: 'TV-14', genre: 'Documentary', mins: 88, kind: 'movie', price: 'sub', on: ['verity', 'peak'],
    desc: 'The last land-speed team still building their car by hand.' },
  { id: 't05', title: 'Nine Fathoms', year: 2024, rated: 'TV-PG', genre: 'Nature', mins: 52, kind: 'series', price: 'sub', on: ['tidepool', 'verity'],
    desc: 'Six episodes following one reef through a full year.' },
  { id: 't06', title: 'Marlow & Fen', year: 2025, rated: 'TV-MA', genre: 'Crime', mins: 48, kind: 'series', price: 'sub', on: ['halo'],
    desc: 'A detective and a hydrologist work the same case from opposite ends of a river.' },
  { id: 't07', title: 'The Paper Orchestra', year: 2021, rated: 'G', genre: 'Animation', mins: 91, kind: 'movie', price: 'sub', on: ['vantage', 'cascade'],
    desc: 'A folded paper violin gathers a whole orchestra out of a rainy attic.' },
  { id: 't08', title: 'Grand Circuit', year: 2023, rated: 'TV-14', genre: 'Sport', mins: 44, kind: 'series', price: 'free', on: ['gearhead', 'sportswire'],
    desc: 'A season inside a privateer racing team with one car and no spare.' },
  { id: 't09', title: 'Quiet Hours', year: 2024, rated: 'TV-14', genre: 'Drama', mins: 102, kind: 'movie', price: '3.99', on: ['orbit', 'nimbus'],
    desc: 'A night nurse and a security guard share a hospital nobody else is awake in.' },
  { id: 't10', title: 'Foghorn', year: 2020, rated: 'TV-PG', genre: 'Mystery', mins: 46, kind: 'series', price: 'free', on: ['retroreel', 'kite'],
    desc: 'A restored series about a lighthouse keeper who hears things in the fog.' },
  { id: 't11', title: 'Above the Treeline', year: 2025, rated: 'TV-PG', genre: 'Documentary', mins: 76, kind: 'movie', price: 'sub', on: ['stargazer', 'verity'],
    desc: 'A summer at the highest observatory still staffed through winter.' },
  { id: 't12', title: 'Brass & Ivy', year: 2022, rated: 'TV-14', genre: 'Period', mins: 55, kind: 'series', price: 'sub', on: ['reelhouse', 'lumen'],
    desc: 'A brass foundry, a family, and the year the orders stopped coming.' },
  { id: 't13', title: 'Little Dipper', year: 2024, rated: 'G', genre: 'Kids', mins: 22, kind: 'series', price: 'sub', on: ['cascade', 'bumblebee'],
    desc: 'A small bear learns the night sky one constellation at a time.' },
  { id: 't14', title: 'Ninth Street Kitchen', year: 2023, rated: 'TV-G', genre: 'Food', mins: 26, kind: 'series', price: 'free', on: ['hearthside', 'kite'],
    desc: 'One kitchen, one street, and whatever the market had that morning.' },
  { id: 't15', title: 'The Ledger', year: 2025, rated: 'TV-MA', genre: 'Thriller', mins: 51, kind: 'series', price: 'sub', on: ['nimbus', 'ironpeak'],
    desc: 'An auditor finds a second set of books and cannot un-find them.' },
  { id: 't16', title: 'Meridian', year: 2021, rated: 'PG-13', genre: 'Science fiction', mins: 128, kind: 'movie', price: '4.99', on: ['orbit', 'halo'],
    desc: 'A survey ship crosses a line on the map that should not have been there.' },
  { id: 't17', title: 'Sunday Roads', year: 2022, rated: 'TV-G', genre: 'Travel', mins: 34, kind: 'series', price: 'free', on: ['wanderlight', 'saltsteel'],
    desc: 'Long, slow drives with no narration and very good sound.' },
  { id: 't18', title: 'Hard Water', year: 2024, rated: 'TV-MA', genre: 'Drama', mins: 113, kind: 'movie', price: 'sub', on: ['peak'],
    desc: 'A fishing family faces a season with the harbour closed.' },
  { id: 't19', title: 'The Understudy', year: 2023, rated: 'TV-14', genre: 'Comedy', mins: 29, kind: 'series', price: 'free', on: ['laughtrack', 'kite'],
    desc: 'A regional theatre, a leading man who never gets ill, and one very patient understudy.' },
  { id: 't20', title: 'Northlight', year: 2025, rated: 'TV-PG', genre: 'Nature', mins: 58, kind: 'series', price: 'sub', on: ['tidepool', 'stargazer'],
    desc: 'Four seasons above the Arctic circle, filmed from one valley.' },
  { id: 't21', title: 'Cast Iron', year: 2020, rated: 'TV-14', genre: 'Documentary', mins: 84, kind: 'movie', price: 'free', on: ['blueprint', 'freeplay'],
    desc: 'The last commercial foundry in the county, and the people keeping it lit.' },
  { id: 't22', title: 'Field Notes', year: 2024, rated: 'TV-G', genre: 'Nature', mins: 24, kind: 'series', price: 'sub', on: ['verity', 'tidepool'],
    desc: 'A naturalist walks the same square mile every week for a year.' },
  { id: 't23', title: 'Second Draft', year: 2022, rated: 'TV-14', genre: 'Comedy', mins: 96, kind: 'movie', price: '2.99', on: ['orbit', 'laughtrack'],
    desc: 'A novelist rewrites her own life and finds the ending was fine.' },
  { id: 't24', title: 'Halfway Home', year: 2025, rated: 'TV-14', genre: 'Drama', mins: 47, kind: 'series', price: 'sub', on: ['lumen'],
    desc: 'A hostel on a long-distance trail, and everyone who stops for one night.' },
  { id: 't25', title: 'Depth Charge', year: 2023, rated: 'TV-MA', genre: 'Action', mins: 121, kind: 'movie', price: 'sub', on: ['ironpeak', 'nimbus'],
    desc: 'A salvage crew has eleven hours before the wreck they are inside gives way.' },
  { id: 't26', title: 'The Sunday Match', year: 2024, rated: 'TV-PG', genre: 'Sport', mins: 90, kind: 'series', price: 'sub', on: ['pitchside', 'sportswire'],
    desc: 'A full season with a club two divisions below where it used to be.' },
  { id: 't27', title: 'Static', year: 2021, rated: 'TV-MA', genre: 'Horror', mins: 98, kind: 'movie', price: 'sub', on: ['nightowl'],
    desc: 'A radio engineer keeps hearing a station that stopped broadcasting in 1974.' },
  { id: 't28', title: 'Open Water Mile', year: 2025, rated: 'TV-PG', genre: 'Sport', mins: 68, kind: 'movie', price: 'free', on: ['sportswire', 'kite'],
    desc: 'Six swimmers train through winter for one race in open water.' },
  { id: 't29', title: 'Tinderbox', year: 2022, rated: 'TV-MA', genre: 'Thriller', mins: 53, kind: 'series', price: 'sub', on: ['halo', 'nimbus'],
    desc: 'A fire investigator works a town where nothing burns by accident.' },
  { id: 't30', title: 'Paper Boats', year: 2023, rated: 'G', genre: 'Kids', mins: 18, kind: 'series', price: 'sub', on: ['bumblebee', 'lullaby'],
    desc: 'Small stories for the end of the day, told very quietly.' },
  { id: 't31', title: 'Long Exposure', year: 2024, rated: 'TV-14', genre: 'Documentary', mins: 79, kind: 'movie', price: 'sub', on: ['verity', 'stargazer'],
    desc: 'A photographer spends four years on a single frame.' },
  { id: 't32', title: 'The Quarry', year: 2020, rated: 'TV-14', genre: 'Mystery', mins: 44, kind: 'series', price: 'free', on: ['retroreel', 'freeplay'],
    desc: 'A village, a flooded quarry, and a case reopened after thirty years.' },
  { id: 't33', title: 'Hearth', year: 2025, rated: 'TV-G', genre: 'Food', mins: 31, kind: 'series', price: 'free', on: ['hearthside'],
    desc: 'Everything cooked over one fire, over one winter.' },
  { id: 't34', title: 'Downstream', year: 2023, rated: 'TV-PG', genre: 'Documentary', mins: 92, kind: 'movie', price: 'sub', on: ['peak', 'tidepool'],
    desc: 'One river from source to sea, and the eleven towns that share it.' },
  { id: 't35', title: 'Night Shift Radio', year: 2024, rated: 'TV-14', genre: 'Drama', mins: 41, kind: 'series', price: 'sub', on: ['lumen', 'halo'],
    desc: 'A phone-in show at three in the morning and the people who call it.' },
  { id: 't36', title: 'Blue Hour', year: 2022, rated: 'PG', genre: 'Animation', mins: 87, kind: 'movie', price: 'sub', on: ['vantage'],
    desc: 'A lamplighter and a small comet keep each other company for one winter.' },
];

const TITLE_BY_ID = Object.fromEntries(TITLES.map(t => [t.id, t]));

/* ---------------------------------------------------------------- live TV */

const LIVE_CHANNELS = [
  { num: '1.1',  id: 'beacon',     name: 'Beacon Movies' },
  { num: '1.2',  id: 'beacon',     name: 'Beacon Classics' },
  { num: '2.1',  id: 'newspulse',  name: 'NewsPulse Live' },
  { num: '2.2',  id: 'clearview',  name: 'ClearView 24' },
  { num: '3.1',  id: 'cityfeed',   name: 'CityFeed Local' },
  { num: '4.1',  id: 'sportswire', name: 'SportsWire 1' },
  { num: '4.2',  id: 'courtside',  name: 'Courtside Live' },
  { num: '5.1',  id: 'kite',       name: 'Kite Comedy' },
  { num: '5.2',  id: 'laughtrack', name: 'LaughTrack 24/7' },
  { num: '6.1',  id: 'retroreel',  name: 'Retro Reel' },
  { num: '7.1',  id: 'sagebrush',  name: 'Sagebrush Westerns' },
  { num: '8.1',  id: 'skywatch',   name: 'SkyWatch Radar' },
  { num: '9.1',  id: 'tidepool',   name: 'Tidepool Ambient' },
  { num: '10.1', id: 'hearthside', name: 'Hearthside Kitchen' },
  { num: '11.1', id: 'cascade',    name: 'Cascade Kids' },
  { num: '12.1', id: 'gearhead',   name: 'Gearhead Garage' },
];

/* Programme names the guide is filled from; the schedule itself is generated
   deterministically per channel and half-hour so it never reshuffles. */
const PROGRAMMES = [
  'Morning Edition', 'The Long Harbour', 'Coast to Coast', 'Repair Shop Hour',
  'Headlines at the Hour', 'Market Watch', 'Deep Field', 'Kitchen Table',
  'The Sunday Match', 'Second Innings', 'Classic Feature', 'Late Feature',
  'Weather on the Eights', 'Radar Live', 'Storm Track', 'Field Notes',
  'Reef Cam', 'Night Sky Live', 'Toolbox', 'Two Wheels', 'Pit Lane',
  'Cartoon Block', 'Story Corner', 'Bedtime Hour', 'Stand-up Half Hour',
  'Panel Show', 'Rerun Double Bill', 'Trail Ride', 'Sagebrush Feature',
  'Local Council Live', 'Traffic and Travel', 'Highlights Show',
  'Documentary Feature', 'Archive Hour', 'Open Water Mile', 'Grand Circuit',
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
  { id: 'logo',   name: 'Roku Screensaver',   desc: 'The wordmark bouncing off the edges of the screen.' },
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

/* Networks the box can see when it scans. The one it ships joined to is first;
   everything else is scenery, and joining any of them works the same way. */
const VISIBLE_NETWORKS = [
  { ssid: 'Sunfish Cottage 5G', secure: true,  signal: 4, band: '5 GHz' },
  { ssid: 'Sunfish Cottage',    secure: true,  signal: 4, band: '2.4 GHz' },
  { ssid: 'Sunfish Guest',      secure: false, signal: 3, band: '2.4 GHz' },
  { ssid: 'Harbour Point 5G',   secure: true,  signal: 2, band: '5 GHz' },
  { ssid: 'NETGEAR-2F',         secure: true,  signal: 2, band: '2.4 GHz' },
  { ssid: 'Cove Lane 2.4',      secure: true,  signal: 1, band: '2.4 GHz' },
  { ssid: 'ORB-Setup',          secure: false, signal: 1, band: '2.4 GHz' },
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
