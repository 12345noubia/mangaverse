/* ══════════════════════════════════════════════════════
   MangaVerse — Frontend Application
   All API calls go through /api/ proxy — never direct
   ══════════════════════════════════════════════════════ */

'use strict';

// ═══════════════ STATE ════════════════
const State = {
  currentPage: 'home',
  currentMangaId: null,
  currentChapterId: null,
  currentChapterIndex: 0,
  chapterList: [],
  readerPages: [],
  readerCurrentPage: 0,
  readerMode: 'vertical',
  library: JSON.parse(localStorage.getItem('mv_library') || '{}'),
  readHistory: JSON.parse(localStorage.getItem('mv_history') || '{}'),
  tags: [],
  searchTimeout: null,
  popularOffset: 0,
  latestOffset: 0,
  searchOffset: 0,
  genreBrowseOffset: 0,
  currentGenreId: null,
  currentQuery: '',
};

// ═══════════════ API ════════════════
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async manga(params = {}) {
    const q = new URLSearchParams(params);
    return this.get(`/api/manga?${q}`);
  },

  async mangaById(id) { return this.get(`/api/manga/${id}`); },

  async chapters(mangaId, offset = 0, limit = 500) {
    return this.get(`/api/manga/${mangaId}/chapters?limit=${limit}&offset=${offset}`);
  },

  async chapterPages(chapterId) {
    return this.get(`/api/chapter/${chapterId}/pages`);
  },

  async tags() { return this.get('/api/tags'); },

  async stats(mangaId) { return this.get(`/api/statistics/manga/${mangaId}`); },

  coverUrl(mangaId, filename, size = '512') {
    return `/api/cover?manga_id=${mangaId}&filename=${encodeURIComponent(filename)}&size=${size}`;
  }
};

// ═══════════════ HELPERS ════════════════
function getCoverFromRelationships(rels, mangaId, size = '512') {
  const cover = rels?.find(r => r.type === 'cover_art');
  if (!cover) return 'data:image/svg+xml,' + encodeURIComponent(`
    <svg viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="280" fill="#1c2028"/>
      <text x="100" y="145" text-anchor="middle" fill="#535d6e" font-size="14" font-family="monospace">No Cover</text>
    </svg>
  `);
  return API.coverUrl(mangaId, cover.attributes.fileName, size);
}

function getTitle(manga) {
  const t = manga.attributes.title;
  return t.en || t['ja-ro'] || t.ja || Object.values(t)[0] || 'Unknown Title';
}

function getAltTitle(manga) {
  const alts = manga.attributes.altTitles || [];
  for (const alt of alts) {
    const val = alt.en || alt['ja-ro'];
    if (val) return val;
  }
  return '';
}

function getDescription(manga) {
  const d = manga.attributes.description;
  return d?.en || d?.['ja-ro'] || Object.values(d || {})[0] || 'No description available.';
}

function getAuthor(manga) {
  const a = manga.relationships?.find(r => r.type === 'author');
  return a?.attributes?.name || 'Unknown';
}

function getArtist(manga) {
  const a = manga.relationships?.find(r => r.type === 'artist');
  return a?.attributes?.name || '';
}

function statusClass(status) {
  const map = { ongoing: 'status-ongoing', completed: 'status-completed', hiatus: 'status-hiatus', cancelled: 'status-cancelled' };
  return map[status] || '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff/86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function langFlag(lang) {
  const flags = {
    en: '🇺🇸', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳', 'zh-hk': '🇭🇰',
    fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
    ru: '🇷🇺', ar: '🇸🇦', id: '🇮🇩', vi: '🇻🇳', th: '🇹🇭',
    pl: '🇵🇱', uk: '🇺🇦', cs: '🇨🇿', tr: '🇹🇷', hu: '🇭🇺',
  };
  return flags[lang] || '🌐';
}

function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function isLibrarySaved(id) { return !!State.library[id]; }
function saveToLibrary(manga) {
  State.library[manga.id] = {
    id: manga.id, title: getTitle(manga),
    cover: getCoverFromRelationships(manga.relationships, manga.id, '256'),
    status: manga.attributes.status,
    savedAt: Date.now()
  };
  localStorage.setItem('mv_library', JSON.stringify(State.library));
}
function removeFromLibrary(id) {
  delete State.library[id];
  localStorage.setItem('mv_library', JSON.stringify(State.library));
}
function markChapterRead(chapterId) {
  State.readHistory[chapterId] = Date.now();
  localStorage.setItem('mv_history', JSON.stringify(State.readHistory));
}
function isChapterRead(chapterId) { return !!State.readHistory[chapterId]; }

// ═══════════════ SPLASH ════════════════
async function initSplash() {
  const progress = document.getElementById('splashProgress');
  const status = document.getElementById('splashStatus');
  const steps = [
    [20, 'Loading framework...'],
    [50, 'Connecting to server...'],
    [75, 'Fetching genres...'],
    [100, 'Ready!']
  ];
  for (const [pct, msg] of steps) {
    progress.style.width = pct + '%';
    status.textContent = msg;
    await new Promise(r => setTimeout(r, 350 + Math.random() * 200));
  }
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('splash').classList.add('fade-out');
  await new Promise(r => setTimeout(r, 650));
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

// ═══════════════ APP INIT ════════════════
async function initApp() {
  setupSearch();
  setupScrollHeader();
  loadHomeData();
  loadTags();
  if (window.lucide) window.lucide.createIcons();
}

function setupScrollHeader() {
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

// ═══════════════ NAVIGATION ════════════════
function navigateTo(page, id, extra) {
  // deactivate old
  document.querySelectorAll('.page.active').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn.active').forEach(b => b.classList.remove('active'));

  State.currentPage = page;

  const el = document.getElementById(`page-${page.replace('_','-')}`);
  if (!el) return;
  el.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.lucide) window.lucide.createIcons();

  if (page === 'home') loadHomeData();
  else if (page === 'popular') { State.popularOffset = 0; loadPopular(); }
  else if (page === 'latest') { State.latestOffset = 0; loadLatest(); }
  else if (page === 'genres') loadGenresPage();
  else if (page === 'manga-detail') loadMangaDetail(id);
  else if (page === 'reader') loadChapter(id, extra);
  else if (page === 'library') renderLibrary();
  else if (page === 'search') performSearch(State.currentQuery);
  else if (page === 'genre-browse') loadGenreBrowse(id, extra);
}

// ═══════════════ HOME DATA ════════════════
async function loadHomeData() {
  loadTrending();
  loadLatestHome();
}

async function loadTrending() {
  const grid = document.getElementById('trendingGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const data = await API.manga({
      limit: 12, 'order[followedCount]': 'desc',
      'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    });
    grid.innerHTML = '';
    data.data.forEach((m, i) => {
      grid.appendChild(createMangaCard(m, i * 50));
    });
    // Build hero float cards
    buildHeroCards(data.data.slice(0, 3));
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load</div>`;
  }
}

async function loadLatestHome() {
  const grid = document.getElementById('latestGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const data = await API.manga({
      limit: 12, 'order[latestUploadedChapter]': 'desc',
      'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    });
    grid.innerHTML = '';
    data.data.forEach((m, i) => {
      grid.appendChild(createMangaCard(m, i * 50));
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load</div>`;
  }
}

async function loadTags() {
  try {
    const data = await API.tags();
    State.tags = data.data;
    renderGenreChipsHome();
  } catch (e) {}
}

function renderGenreChipsHome() {
  const container = document.getElementById('genreChips');
  const picks = State.tags.filter(t => t.attributes.group === 'genre').slice(0, 20);
  container.innerHTML = picks.map(t => `
    <button class="genre-chip" onclick="navigateTo('genre-browse','${t.id}','${t.attributes.name.en}')">
      ${t.attributes.name.en}
    </button>
  `).join('');
}

function buildHeroCards(mangas) {
  const container = document.getElementById('heroCards');
  container.innerHTML = mangas.map(m => {
    const cover = getCoverFromRelationships(m.relationships, m.id, '512');
    return `
      <div class="hero-card" onclick="navigateTo('manga-detail','${m.id}')">
        <img src="${cover}" alt="${getTitle(m)}" loading="lazy" />
      </div>
    `;
  }).join('');
}

// ═══════════════ POPULAR ════════════════
async function loadPopular() {
  const grid = document.getElementById('popularGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const status = document.getElementById('popularStatus')?.value;
  try {
    const params = {
      limit: 24, offset: State.popularOffset,
      'order[followedCount]': 'desc',
      'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    };
    if (status) params.status = status;
    const data = await API.manga(params);
    grid.innerHTML = '';
    data.data.forEach((m, i) => grid.appendChild(createMangaCard(m, i * 40)));
    renderPagination('popularPagination', data.total, State.popularOffset, 24, (offset) => {
      State.popularOffset = offset; loadPopular();
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load</div>`;
  }
}

// ═══════════════ LATEST ════════════════
async function loadLatest() {
  const grid = document.getElementById('latestPageGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const data = await API.manga({
      limit: 24, offset: State.latestOffset,
      'order[latestUploadedChapter]': 'desc',
      'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    });
    grid.innerHTML = '';
    data.data.forEach((m, i) => grid.appendChild(createMangaCard(m, i * 40)));
    renderPagination('latestPagination', data.total, State.latestOffset, 24, (offset) => {
      State.latestOffset = offset; loadLatest();
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load</div>`;
  }
}

// ═══════════════ GENRES ════════════════
function loadGenresPage() {
  const grid = document.getElementById('genrePageGrid');
  if (State.tags.length === 0) {
    grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
    API.tags().then(data => { State.tags = data.data; renderGenresPage(); });
  } else {
    renderGenresPage();
  }
}

const GENRE_EMOJIS = {
  'Action': '<i data-lucide="zap"></i>', 'Adventure': '<i data-lucide="map"></i>', 'Comedy': '<i data-lucide="smile"></i>', 'Drama': '<i data-lucide="theater"></i>',
  'Fantasy': '<i data-lucide="wand"></i>', 'Horror': '<i data-lucide="skull"></i>', 'Mystery': '<i data-lucide="search"></i>', 'Romance': '<i data-lucide="heart"></i>',
  'Sci-Fi': '<i data-lucide="rocket"></i>', 'Slice of Life': '<i data-lucide="cherry"></i>', 'Sports': '<i data-lucide="target"></i>', 'Thriller': '<i data-lucide="alert-triangle"></i>',
  'Supernatural': '<i data-lucide="sparkles"></i>', 'Psychological': '<i data-lucide="brain"></i>', 'Mecha': '<i data-lucide="bot"></i>', 'Music': '<i data-lucide="music"></i>',
  'Historical': '<i data-lucide="scroll"></i>', 'Medical': '<i data-lucide="stethoscope"></i>', 'Philosophical': '<i data-lucide="lightbulb"></i>', 'Tragedy': '<i data-lucide="frown"></i>',
  'Martial Arts': '<i data-lucide="fighter"></i>', 'Isekai': '<i data-lucide="shuffle"></i>', 'Harem': '<i data-lucide="users"></i>', 'Cooking': '<i data-lucide="chef-hat"></i>',
  'Game': '<i data-lucide="gamepad-2"></i>', 'School Life': '<i data-lucide="graduation-cap"></i>', 'Military': '<i data-lucide="shield"></i>', 'Magic': '<i data-lucide="magic-wand"></i>',
  'Monsters': '<i data-lucide="monster"></i>', 'Survival': '<i data-lucide="compass"></i>',
};

function renderGenresPage() {
  const grid = document.getElementById('genrePageGrid');
  const genres = State.tags.filter(t => t.attributes.group === 'genre');
  grid.innerHTML = genres.map(t => {
    const name = t.attributes.name.en;
    const emoji = GENRE_EMOJIS[name] || '📖';
    return `
      <div class="genre-card" onclick="navigateTo('genre-browse','${t.id}','${name}')">
        <span class="genre-card-emoji">${emoji}</span>
        <div class="genre-card-name">${name}</div>
        <div class="genre-card-count">Browse series →</div>
      </div>
    `;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

// ═══════════════ GENRE BROWSE ════════════════
async function loadGenreBrowse(tagId, tagName) {
  State.currentGenreId = tagId;
  document.getElementById('genreBrowseTitle').innerHTML = `${GENRE_EMOJIS[tagName] || '<i data-lucide="book"></i>'} ${tagName}`;
  if (window.lucide) window.lucide.createIcons();
  const grid = document.getElementById('genreBrowseGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const data = await API.manga({
      limit: 24, offset: State.genreBrowseOffset,
      'order[followedCount]': 'desc',
      'includedTags[]': tagId,
      'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    });
    grid.innerHTML = '';
    if (!data.data.length) {
      grid.innerHTML = '<div class="loading-row" style="color:var(--text-muted)">No results found</div>';
      return;
    }
    data.data.forEach((m, i) => grid.appendChild(createMangaCard(m, i * 40)));
    renderPagination('genreBrowsePagination', data.total, State.genreBrowseOffset, 24, (offset) => {
      State.genreBrowseOffset = offset;
      loadGenreBrowse(tagId, tagName);
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load</div>`;
  }
}

// ═══════════════ MANGA CARD ════════════════
function createMangaCard(manga, delay = 0) {
  const cover = getCoverFromRelationships(manga.relationships, manga.id, '256');
  const title = getTitle(manga);
  const status = manga.attributes.status || '';
  const saved = isLibrarySaved(manga.id);

  const card = document.createElement('div');
  card.className = 'manga-card';
  card.style.animationDelay = delay + 'ms';
  card.innerHTML = `
    <div class="manga-card-thumb">
      <img src="${cover}" alt="${title}" loading="lazy"
           onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="280" fill="#1c2028"/><text x="100" y="145" text-anchor="middle" fill="#535d6e" font-size="12" font-family="monospace">No Image</text></svg>')}'"/>
      ${status ? `<span class="manga-card-status ${statusClass(status)}">${status}</span>` : ''}
      <button class="manga-card-bookmark ${saved ? 'saved' : ''}" onclick="toggleLibrary(event,'${manga.id}')" title="${saved ? 'Remove from library' : 'Add to library'}">
        <svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <div class="manga-card-overlay">
        <div class="manga-card-overlay-btns">
          <button class="overlay-btn overlay-btn-read" onclick="event.stopPropagation();openMangaAndRead('${manga.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Read
          </button>
          <button class="overlay-btn overlay-btn-save" onclick="event.stopPropagation();toggleLibrary(event,'${manga.id}')">
            ${saved ? '✓ Saved' : '+ Save'}
          </button>
        </div>
      </div>
    </div>
    <div class="manga-card-info">
      <div class="manga-card-title">${title}</div>
      <div class="manga-card-meta">
        <span class="manga-card-rating">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </span>
        <span>${manga.attributes.year || '—'}</span>
      </div>
    </div>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    navigateTo('manga-detail', manga.id);
  });
  // Store manga data for library toggle
  card._manga = manga;
  return card;
}

function toggleLibrary(event, mangaId) {
  event.stopPropagation();
  if (isLibrarySaved(mangaId)) {
    removeFromLibrary(mangaId);
    showToast('Removed from library', 'info');
  } else {
    // We need the manga object — fetch if needed
    const card = event.target.closest('.manga-card');
    if (card && card._manga) {
      saveToLibrary(card._manga);
    } else {
      API.mangaById(mangaId).then(d => saveToLibrary(d.data)).catch(() => {});
    }
    showToast('Added to library! ✨', 'success');
  }
  // Update bookmark button state
  const btn = event.target.closest('.manga-card-bookmark');
  if (btn) {
    const isSaved = isLibrarySaved(mangaId);
    btn.classList.toggle('saved', isSaved);
    btn.querySelector('svg').setAttribute('fill', isSaved ? 'currentColor' : 'none');
  }
}

async function openMangaAndRead(mangaId) {
  navigateTo('manga-detail', mangaId);
}

// ═══════════════ MANGA DETAIL ════════════════
async function loadMangaDetail(mangaId) {
  State.currentMangaId = mangaId;
  const container = document.getElementById('mangaDetailContent');
  container.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const [mangaRes, chaptersRes] = await Promise.all([
      API.mangaById(mangaId),
      API.chapters(mangaId, 0, 500),
    ]);
    const manga = mangaRes.data;
    const chapters = chaptersRes.data || [];
    State.chapterList = chapters;
    renderMangaDetail(manga, chapters);
  } catch (e) {
    container.innerHTML = `<div class="loading-row" style="color:var(--pink)">Failed to load manga details</div>`;
  }
}

function renderMangaDetail(manga, chapters) {
  const container = document.getElementById('mangaDetailContent');
  const cover = getCoverFromRelationships(manga.relationships, manga.id, '512');
  const title = getTitle(manga);
  const altTitle = getAltTitle(manga);
  const desc = getDescription(manga);
  const author = getAuthor(manga);
  const artist = getArtist(manga);
  const status = manga.attributes.status || '';
  const year = manga.attributes.year || '—';
  const saved = isLibrarySaved(manga.id);
  const tags = manga.attributes.tags?.filter(t => t.attributes.group === 'genre') || [];
  const type = manga.type || manga.attributes.originalLanguage?.toUpperCase() || 'MANGA';
  const contentRating = manga.attributes.contentRating || 'safe';
  const lastChap = manga.attributes.lastChapter || '—';

  // Languages available
  const langs = [...new Set(chapters.map(c => c.attributes.translatedLanguage))];
  const firstChapter = chapters[0];
  const latestChapter = chapters[chapters.length - 1];

  container.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-bg" style="background-image:url('${cover}')"></div>
      <div class="detail-hero-inner">
        <div class="detail-cover">
          <img src="${cover}" alt="${title}" />
        </div>
        <div class="detail-info">
          <div class="detail-badges">
            <span class="detail-badge detail-badge-type">${type.toUpperCase()}</span>
            ${status ? `<span class="detail-badge ${statusClass(status)}">${status}</span>` : ''}
            <span class="detail-badge" style="background:rgba(255,107,53,0.15);color:var(--orange);border:1px solid rgba(255,107,53,0.2)">${contentRating}</span>
          </div>
          <h1 class="detail-title">${title}</h1>
          ${altTitle ? `<p class="detail-alt-title">${altTitle}</p>` : ''}
          <p class="detail-authors">by <span>${author}</span>${artist && artist !== author ? ` · Art by <span>${artist}</span>` : ''}</p>
          <div class="detail-stats">
            <div class="detail-stat">
              <span class="detail-stat-val">${chapters.length}</span>
              <span class="detail-stat-label">Chapters</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-val">${langs.length}</span>
              <span class="detail-stat-label">Languages</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-val">${year}</span>
              <span class="detail-stat-label">Year</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-val">${lastChap !== '—' ? 'Ch. ' + lastChap : '—'}</span>
              <span class="detail-stat-label">Latest</span>
            </div>
          </div>
          <div class="detail-tags">
            ${tags.map(t => `<span class="detail-tag" onclick="navigateTo('genre-browse','${t.id}','${t.attributes.name.en}')">${t.attributes.name.en}</span>`).join('')}
          </div>
          <div class="detail-actions">
            ${firstChapter ? `
              <button class="detail-btn detail-btn-read" onclick="navigateTo('reader','${firstChapter.id}',0)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start Reading
              </button>
            ` : ''}
            ${latestChapter && latestChapter !== firstChapter ? `
              <button class="detail-btn" style="background:var(--orange-dim);color:var(--orange);border:1px solid rgba(255,107,53,0.2)" onclick="navigateTo('reader','${latestChapter.id}',${chapters.length-1})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                Latest Chapter
              </button>
            ` : ''}
            <button class="detail-btn detail-btn-save ${saved ? 'saved' : ''}" id="detailSaveBtn" onclick="toggleDetailLibrary('${manga.id}',this)" data-manga-id="${manga.id}">
              <svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              ${saved ? 'In Library' : 'Add to Library'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-body">
      <div>
        <h3 class="chapters-title" style="margin-bottom:14px">Synopsis</h3>
        <div class="detail-description collapsed" id="detailDesc">${desc.replace(/\n/g, '<br/>')}</div>
        <button class="expand-desc" id="expandDescBtn" onclick="toggleDesc()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
          Show more
        </button>

        <div class="chapters-section" style="margin-top:32px">
          <div class="chapters-header">
            <h3 class="chapters-title">Chapters</h3>
            <span class="chapters-count">${chapters.length} chapters · ${langs.length} languages</span>
          </div>
          <div class="chapter-lang-filter" id="chapterLangFilter">
            <button class="lang-btn active" onclick="filterChapterLang('all',this)">All</button>
            ${langs.slice(0,8).map(l => `<button class="lang-btn" onclick="filterChapterLang('${l}',this)">${langFlag(l)} ${l.toUpperCase()}</button>`).join('')}
          </div>
          <div class="chapters-list" id="chaptersList">
            ${renderChapterItems(chapters.slice(0, 30))}
          </div>
          ${chapters.length > 30 ? `
            <button class="view-all-chapters" onclick="openChapterModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
              View all ${chapters.length} chapters
            </button>
          ` : ''}
        </div>
      </div>

      <div class="detail-sidebar">
        <div class="sidebar-card">
          <div class="sidebar-card-title">Information</div>
          <div class="info-row"><span class="info-label">Format</span><span class="info-value">${type}</span></div>
          <div class="info-row"><span class="info-label">Status</span><span class="info-value" style="color:${status === 'ongoing' ? 'var(--green)' : status === 'completed' ? 'var(--cyan)' : 'var(--orange)'}">${status}</span></div>
          <div class="info-row"><span class="info-label">Published</span><span class="info-value">${year}</span></div>
          <div class="info-row"><span class="info-label">Author</span><span class="info-value">${author}</span></div>
          ${artist && artist !== author ? `<div class="info-row"><span class="info-label">Artist</span><span class="info-value">${artist}</span></div>` : ''}
          <div class="info-row"><span class="info-label">Rating</span><span class="info-value">${contentRating}</span></div>
          <div class="info-row"><span class="info-label">Languages</span><span class="info-value">${langs.slice(0,4).map(l => langFlag(l)).join(' ')}${langs.length > 4 ? ' +' + (langs.length - 4) : ''}</span></div>
        </div>
        <div class="sidebar-card">
          <div class="sidebar-card-title">Genres</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${tags.map(t => `<span class="detail-tag" onclick="navigateTo('genre-browse','${t.id}','${t.attributes.name.en}')">${t.attributes.name.en}</span>`).join('')}
            ${tags.length === 0 ? '<span style="color:var(--text-muted);font-size:0.85rem">No genres listed</span>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // Store manga for library toggle
  document._currentManga = manga;
}

function renderChapterItems(chapters, filterLang = 'all') {
  const filtered = filterLang === 'all' ? chapters : chapters.filter(c => c.attributes.translatedLanguage === filterLang);
  if (!filtered.length) return '<div style="text-align:center;padding:20px;color:var(--text-muted)">No chapters found</div>';
  return filtered.map((c, i) => {
    const read = isChapterRead(c.id);
    const vol = c.attributes.volume ? `Vol. ${c.attributes.volume} ` : '';
    const ch = c.attributes.chapter ? `Ch. ${c.attributes.chapter}` : `Oneshot`;
    const title = c.attributes.title || '';
    const lang = c.attributes.translatedLanguage || 'en';
    const date = formatDate(c.attributes.publishAt);
    const idx = State.chapterList.findIndex(ch => ch.id === c.id);
    return `
      <div class="chapter-item ${read ? 'read' : ''}" onclick="navigateTo('reader','${c.id}',${idx >= 0 ? idx : i})">
        <span class="chapter-num">${vol}${ch}</span>
        <span class="chapter-title-text">${title || 'Chapter ' + (c.attributes.chapter || '?')}</span>
        <span class="chapter-lang-badge">${langFlag(lang)} ${lang.toUpperCase()}</span>
        <span class="chapter-date">${date}</span>
      </div>
    `;
  }).join('');
}

let _chapterLang = 'all';
function filterChapterLang(lang, btn) {
  _chapterLang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  document.getElementById('chaptersList').innerHTML = renderChapterItems(State.chapterList.slice(0, 30), lang);
}

function toggleDesc() {
  const desc = document.getElementById('detailDesc');
  const btn = document.getElementById('expandDescBtn');
  const collapsed = desc.classList.contains('collapsed');
  desc.classList.toggle('collapsed', !collapsed);
  btn.innerHTML = collapsed
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg> Show less`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg> Show more`;
}

function toggleDetailLibrary(mangaId, btn) {
  const manga = document._currentManga;
  if (isLibrarySaved(mangaId)) {
    removeFromLibrary(mangaId);
    btn.classList.remove('saved');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Add to Library`;
    showToast('Removed from library', 'info');
  } else {
    if (manga) saveToLibrary(manga);
    btn.classList.add('saved');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> In Library`;
    showToast('Added to library! ✨', 'success');
  }
}

// ═══════════════ CHAPTER MODAL ════════════════
function openChapterModal() {
  const modal = document.getElementById('chapterModal');
  const title = document.getElementById('chapterModalTitle');
  const body = document.getElementById('chapterModalBody');
  const langBar = document.getElementById('modalLangBar');

  const chapters = State.chapterList;
  const langs = [...new Set(chapters.map(c => c.attributes.translatedLanguage))];

  title.textContent = `All Chapters (${chapters.length})`;
  langBar.innerHTML = `
    <button class="lang-btn active" onclick="filterModalLang('all',this)">🌍 All (${chapters.length})</button>
    ${langs.map(l => {
      const cnt = chapters.filter(c => c.attributes.translatedLanguage === l).length;
      return `<button class="lang-btn" onclick="filterModalLang('${l}',this)">${langFlag(l)} ${l.toUpperCase()} (${cnt})</button>`;
    }).join('')}
  `;

  renderModalChapters(chapters);
  modal.classList.remove('hidden');
}

let _modalLang = 'all';
function filterModalLang(lang, btn) {
  _modalLang = lang;
  document.querySelectorAll('#modalLangBar .lang-btn').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  const filtered = lang === 'all' ? State.chapterList : State.chapterList.filter(c => c.attributes.translatedLanguage === lang);
  renderModalChapters(filtered);
}

function renderModalChapters(chapters) {
  const body = document.getElementById('chapterModalBody');
  body.innerHTML = chapters.map((c, i) => {
    const read = isChapterRead(c.id);
    const vol = c.attributes.volume ? `Vol.${c.attributes.volume} ` : '';
    const ch = c.attributes.chapter ? `Ch.${c.attributes.chapter}` : 'Oneshot';
    const title = c.attributes.title || '';
    const lang = c.attributes.translatedLanguage || 'en';
    const date = formatDate(c.attributes.publishAt);
    const idx = State.chapterList.findIndex(ch => ch.id === c.id);
    return `
      <div class="modal-chapter-item ${read ? 'read' : ''}" onclick="closeChapterModal();navigateTo('reader','${c.id}',${idx >= 0 ? idx : i})">
        <span class="modal-ch-num">${vol}${ch}</span>
        <span class="modal-ch-title">${title || 'Chapter ' + (c.attributes.chapter || '?')}</span>
        <span class="modal-ch-lang">${langFlag(lang)} ${lang}</span>
        <span class="modal-ch-date">${date}</span>
      </div>
    `;
  }).join('') || '<div style="text-align:center;padding:40px;color:var(--text-muted)">No chapters available</div>';
}

function filterChapters(query) {
  const chapters = _modalLang === 'all' ? State.chapterList : State.chapterList.filter(c => c.attributes.translatedLanguage === _modalLang);
  const filtered = query
    ? chapters.filter(c => {
        const ch = c.attributes.chapter || '';
        const t = c.attributes.title || '';
        return ch.includes(query) || t.toLowerCase().includes(query.toLowerCase());
      })
    : chapters;
  renderModalChapters(filtered);
}

function closeChapterModal(event) {
  if (event && event.target !== document.getElementById('chapterModal')) return;
  document.getElementById('chapterModal').classList.add('hidden');
}

// ═══════════════ READER ════════════════
async function loadChapter(chapterId, chapterIndex) {
  State.currentChapterId = chapterId;
  State.currentChapterIndex = parseInt(chapterIndex) || 0;
  State.readerCurrentPage = 0;

  const container = document.getElementById('readerContainer');
  const titleEl = document.getElementById('readerTitle');
  const chapterEl = document.getElementById('readerChapter');

  container.innerHTML = '<div class="loading-row"><div class="spinner" style="border-top-color:#00D9FF"></div></div>';

  // Update chapter info display
  const chapter = State.chapterList[State.currentChapterIndex];
  if (chapter) {
    const vol = chapter.attributes.volume ? `Vol. ${chapter.attributes.volume} · ` : '';
    const ch = chapter.attributes.chapter ? `Ch. ${chapter.attributes.chapter}` : 'Oneshot';
    const chTitle = chapter.attributes.title || '';
    titleEl.textContent = State.currentMangaId ? 'Reading...' : 'MangaVerse Reader';
    chapterEl.textContent = `${vol}${ch}${chTitle ? ' — ' + chTitle : ''} · ${langFlag(chapter.attributes.translatedLanguage)} ${(chapter.attributes.translatedLanguage || 'en').toUpperCase()}`;
  }

  // Update chapter nav buttons
  document.getElementById('readerPrevChap').style.opacity = State.currentChapterIndex <= 0 ? '0.4' : '1';
  document.getElementById('readerNextChap').style.opacity = State.currentChapterIndex >= State.chapterList.length - 1 ? '0.4' : '1';

  try {
    const data = await API.chapterPages(chapterId);
    State.readerPages = data.pages;
    document.getElementById('totalPages').textContent = data.total;
    markChapterRead(chapterId);
    renderReaderPages();
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--pink)">
      <p>Failed to load chapter pages</p>
      <p style="font-size:0.8rem;margin-top:8px;color:var(--text-muted)">${e.message}</p>
    </div>`;
  }
}

function renderReaderPages() {
  const container = document.getElementById('readerContainer');
  const mode = State.readerMode;
  container.className = 'reader-container' + (mode !== 'vertical' ? ` mode-${mode}` : '');
  container.innerHTML = '';

  if (mode === 'vertical') {
    State.readerPages.forEach((page, i) => {
      const img = document.createElement('img');
      img.className = 'reader-page-img';
      img.src = page.url;
      img.alt = `Page ${i + 1}`;
      img.loading = 'lazy';
      img.onload = () => updateReaderProgress();
      container.appendChild(img);
    });
    // Track scroll for progress
    container.addEventListener('scroll', onReaderScroll, { passive: true });
  } else {
    // Single or Double — show current page(s)
    renderPagedView();
  }
  document.getElementById('currentPage').textContent = '1';
}

function renderPagedView() {
  const container = document.getElementById('readerContainer');
  container.innerHTML = '';
  const mode = State.readerMode;

  if (mode === 'single') {
    const page = State.readerPages[State.readerCurrentPage];
    if (!page) return;
    const img = document.createElement('img');
    img.className = 'reader-page-img mode-single';
    img.src = page.url; img.alt = `Page ${State.readerCurrentPage + 1}`;
    container.appendChild(img);
    document.getElementById('currentPage').textContent = State.readerCurrentPage + 1;
  } else if (mode === 'double') {
    for (let i = 0; i < 2; i++) {
      const page = State.readerPages[State.readerCurrentPage + i];
      if (!page) break;
      const img = document.createElement('img');
      img.className = 'reader-page-img mode-double';
      img.src = page.url; img.alt = `Page ${State.readerCurrentPage + i + 1}`;
      container.appendChild(img);
    }
    document.getElementById('currentPage').textContent = State.readerCurrentPage + 1;
  }
  updateReaderProgress();
}

function onReaderScroll() {
  const container = document.getElementById('readerContainer');
  const imgs = container.querySelectorAll('.reader-page-img');
  if (!imgs.length) return;
  let closestIdx = 0;
  let closestDist = Infinity;
  imgs.forEach((img, i) => {
    const rect = img.getBoundingClientRect();
    const dist = Math.abs(rect.top);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });
  State.readerCurrentPage = closestIdx;
  document.getElementById('currentPage').textContent = closestIdx + 1;
  updateReaderProgress();
}

function updateReaderProgress() {
  const pct = State.readerPages.length > 0
    ? ((State.readerCurrentPage + 1) / State.readerPages.length) * 100
    : 0;
  document.getElementById('readerProgressFill').style.width = pct + '%';
}

function prevPage() {
  if (State.readerMode === 'vertical') {
    const container = document.getElementById('readerContainer');
    const imgs = container.querySelectorAll('.reader-page-img');
    const target = imgs[Math.max(0, State.readerCurrentPage - 1)];
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  } else {
    const step = State.readerMode === 'double' ? 2 : 1;
    if (State.readerCurrentPage > 0) {
      State.readerCurrentPage = Math.max(0, State.readerCurrentPage - step);
      renderPagedView();
    } else {
      navigateChapter(-1);
    }
  }
}

function nextPage() {
  if (State.readerMode === 'vertical') {
    const container = document.getElementById('readerContainer');
    const imgs = container.querySelectorAll('.reader-page-img');
    const target = imgs[Math.min(imgs.length - 1, State.readerCurrentPage + 1)];
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  } else {
    const step = State.readerMode === 'double' ? 2 : 1;
    if (State.readerCurrentPage + step < State.readerPages.length) {
      State.readerCurrentPage += step;
      renderPagedView();
    } else {
      navigateChapter(1);
    }
  }
}

function navigateChapter(dir) {
  const newIdx = State.currentChapterIndex + dir;
  if (newIdx < 0 || newIdx >= State.chapterList.length) {
    showToast(dir > 0 ? 'No more chapters!' : 'Already at first chapter!', 'info');
    return;
  }
  const chapter = State.chapterList[newIdx];
  navigateTo('reader', chapter.id, newIdx);
}

function setReaderMode(mode) {
  State.readerMode = mode;
  State.readerCurrentPage = 0;
  renderReaderPages();
}

function closeReader() {
  if (State.currentMangaId) {
    navigateTo('manga-detail', State.currentMangaId);
  } else {
    navigateTo('home');
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('page-reader').requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

// Keyboard navigation in reader
document.addEventListener('keydown', (e) => {
  if (State.currentPage !== 'reader') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPage();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage();
  if (e.key === 'Escape') closeReader();
});

// ═══════════════ SEARCH ════════════════
function setupSearch() {
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('searchClear');
  const results = document.getElementById('searchResults');

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clear.classList.toggle('hidden', !q);
    if (!q) { results.classList.add('hidden'); return; }
    clearTimeout(State.searchTimeout);
    State.searchTimeout = setTimeout(() => quickSearch(q), 350);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      results.classList.add('hidden');
      State.currentQuery = q;
      State.searchOffset = 0;
      navigateTo('search');
      document.getElementById('searchResultDesc').textContent = `Results for "${q}"`;
    }
    if (e.key === 'Escape') { results.classList.add('hidden'); input.blur(); }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('searchWrap').contains(e.target)) {
      results.classList.add('hidden');
    }
  });
}

async function quickSearch(query) {
  const results = document.getElementById('searchResults');
  results.classList.remove('hidden');
  results.innerHTML = '<div class="search-no-results"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto"></div></div>';
  try {
    const data = await API.manga({
      title: query, limit: 8, 'includes[]': 'cover_art',
      'contentRating[]': ['safe', 'suggestive'],
    });
    if (!data.data.length) {
      results.innerHTML = `<div class="search-no-results">No results for "${query}"</div>`;
      return;
    }
    results.innerHTML = data.data.map(m => {
      const cover = getCoverFromRelationships(m.relationships, m.id, '256');
      const title = getTitle(m);
      const status = m.attributes.status || '';
      return `
        <div class="search-result-item" onclick="navigateTo('manga-detail','${m.id}');document.getElementById('searchResults').classList.add('hidden')">
          <img class="search-result-thumb" src="${cover}" alt="${title}" loading="lazy"/>
          <div class="search-result-info">
            <div class="search-result-title">${title}</div>
            <div class="search-result-meta">${status} · ${m.attributes.year || '—'}</div>
          </div>
        </div>
      `;
    }).join('') + `
      <div class="search-result-item" style="justify-content:center;color:var(--cyan);font-size:0.85rem"
           onclick="State.currentQuery='${query}';State.searchOffset=0;navigateTo('search');document.getElementById('searchResults').classList.add('hidden');document.getElementById('searchResultDesc').textContent='Results for &quot;${query}&quot;'">
        View all results →
      </div>
    `;
  } catch (e) {
    results.innerHTML = `<div class="search-no-results">Search error. Try again.</div>`;
  }
}

async function performSearch(query) {
  if (!query) return;
  const grid = document.getElementById('searchGrid');
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    const data = await API.manga({
      title: query, limit: 24, offset: State.searchOffset,
      'includes[]': 'cover_art', 'contentRating[]': ['safe', 'suggestive'],
    });
    grid.innerHTML = '';
    if (!data.data.length) {
      grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔍</span><h3>No results found</h3><p>Try a different search term</p></div>`;
      return;
    }
    data.data.forEach((m, i) => grid.appendChild(createMangaCard(m, i * 40)));
    document.getElementById('searchResultDesc').textContent = `Found ${data.total.toLocaleString()} results for "${query}"`;
    renderPagination('searchPagination', data.total, State.searchOffset, 24, (offset) => {
      State.searchOffset = offset; performSearch(State.currentQuery);
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row" style="color:var(--pink)">Search failed</div>`;
  }
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.add('hidden');
  document.getElementById('searchResults').classList.add('hidden');
}

// ═══════════════ LIBRARY ════════════════
function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  const items = Object.values(State.library).sort((a, b) => b.savedAt - a.savedAt);
  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">📚</span>
        <h3>Your library is empty</h3>
        <p>Bookmark manga to find them here</p>
      </div>
    `;
    return;
  }
  grid.innerHTML = items.map(item => `
    <div class="manga-card" onclick="navigateTo('manga-detail','${item.id}')" style="animation:cardIn 0.4s ease both">
      <div class="manga-card-thumb">
        <img src="${item.cover}" alt="${item.title}" loading="lazy"/>
        <span class="manga-card-status ${statusClass(item.status)}">${item.status || ''}</span>
        <button class="manga-card-bookmark saved" onclick="event.stopPropagation();removeFromLibrary('${item.id}');renderLibrary();showToast('Removed','info')">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="manga-card-info">
        <div class="manga-card-title">${item.title}</div>
        <div class="manga-card-meta" style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted)">
          ${formatDate(item.savedAt)}
        </div>
      </div>
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

// ═══════════════ PAGINATION ════════════════
function renderPagination(containerId, total, offset, limit, onPage) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const currentPage = Math.floor(offset / limit);
  const maxPages = 7;
  let start = Math.max(0, currentPage - 3);
  let end = Math.min(totalPages - 1, start + maxPages - 1);
  if (end - start < maxPages - 1) start = Math.max(0, end - maxPages + 1);

  let html = `
    <button class="page-arrow" ${currentPage === 0 ? 'disabled' : ''} onclick="(${onPage.toString()})(${(currentPage-1)*limit});window.scrollTo({top:0,behavior:'smooth'})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  `;
  for (let i = start; i <= end; i++) {
    html += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="(${onPage.toString()})(${i*limit});window.scrollTo({top:0,behavior:'smooth'})">${i+1}</button>`;
  }
  html += `
    <button class="page-arrow" ${currentPage >= totalPages-1 ? 'disabled' : ''} onclick="(${onPage.toString()})(${(currentPage+1)*limit});window.scrollTo({top:0,behavior:'smooth'})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;
  container.innerHTML = html;
}

// ═══════════════ THEME ════════════════
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next === 'dark' ? '' : 'light');
  localStorage.setItem('mv_theme', next);
  showToast(`Switched to ${next} mode`, 'info');
}

(function applyTheme() {
  const saved = localStorage.getItem('mv_theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

// ═══════════════ MOBILE MENU ════════════════
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('hidden');
}

// ═══════════════ START ════════════════
document.addEventListener('DOMContentLoaded', initSplash);
