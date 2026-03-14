const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_UPLOADS = 'https://uploads.mangadex.org';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const axiosInstance = axios.create({
  baseURL: MANGADEX_API,
  timeout: 15000,
  headers: {
    'User-Agent': 'MangaVerse/1.0',
    'Content-Type': 'application/json'
  }
});

// Helper to build query string from object
function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (Array.isArray(val)) {
      val.forEach(v => q.append(key, v));
    } else if (val !== undefined && val !== null && val !== '') {
      q.append(key, val);
    }
  }
  return q.toString();
}

// ─── SEARCH / POPULAR / LATEST ────────────────────────────────────────────
app.get('/api/manga', async (req, res) => {
  try {
    const params = {
      limit: req.query.limit || 20,
      offset: req.query.offset || 0,
      'includes[]': ['cover_art', 'author', 'artist'],
      'order[followedCount]': req.query.sort === 'popular' ? 'desc' : undefined,
      'order[latestUploadedChapter]': req.query.sort === 'latest' ? 'desc' : undefined,
      'order[relevance]': req.query.sort === 'relevance' ? 'desc' : undefined,
      title: req.query.title || undefined,
      status: req.query.status || undefined,
      'contentRating[]': req.query.rating || ['safe', 'suggestive', 'erotica'],
      'availableTranslatedLanguage[]': undefined,
    };

    // genres
    if (req.query.genres) {
      params['includedTags[]'] = req.query.genres.split(',');
    }

    const qs = buildQuery(params);
    const response = await axiosInstance.get(`/manga?${qs}`);
    res.json(response.data);
  } catch (err) {
    console.error('Manga list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── SINGLE MANGA ──────────────────────────────────────────────────────────
app.get('/api/manga/:id', async (req, res) => {
  try {
    const qs = buildQuery({ 'includes[]': ['cover_art', 'author', 'artist', 'tag'] });
    const response = await axiosInstance.get(`/manga/${req.params.id}?${qs}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CHAPTERS LIST ─────────────────────────────────────────────────────────
app.get('/api/manga/:id/chapters', async (req, res) => {
  try {
    const params = {
      limit: req.query.limit || 100,
      offset: req.query.offset || 0,
      'order[volume]': 'asc',
      'order[chapter]': 'asc',
      'includes[]': ['scanlation_group'],
    };
    const qs = buildQuery(params);
    const response = await axiosInstance.get(`/manga/${req.params.id}/feed?${qs}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CHAPTER PAGES ─────────────────────────────────────────────────────────
app.get('/api/chapter/:id/pages', async (req, res) => {
  try {
    const response = await axiosInstance.get(`/at-home/server/${req.params.id}`);
    const data = response.data;
    const baseUrl = data.baseUrl;
    const chapterData = data.chapter;
    const hash = chapterData.hash;
    const pages = chapterData.data; // high quality
    const dataSaver = chapterData.dataSaver; // compressed

    const quality = req.query.quality === 'saver' ? 'data-saver' : 'data';
    const files = quality === 'data-saver' ? dataSaver : pages;

    const urls = files.map(file => ({
      url: `/api/image-proxy?url=${encodeURIComponent(`${baseUrl}/${quality}/${hash}/${file}`)}`,
      filename: file
    }));

    res.json({ pages: urls, total: urls.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COVER ART PROXY ───────────────────────────────────────────────────────
app.get('/api/cover', async (req, res) => {
  try {
    const { manga_id, filename, size } = req.query;
    // size: 256 | 512 | original
    const suffix = size === '256' ? '.256.jpg' : size === '512' ? '.512.jpg' : '';
    const url = `${MANGADEX_UPLOADS}/covers/${manga_id}/${filename}${suffix}`;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'MangaVerse/1.0' }
    });
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── IMAGE PROXY (chapter pages) ──────────────────────────────────────────
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = decodeURIComponent(req.query.url);
    if (!imageUrl.startsWith('https://')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mangadex.org',
        'Origin': 'https://mangadex.org'
      }
    });
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TAGS ──────────────────────────────────────────────────────────────────
app.get('/api/tags', async (req, res) => {
  try {
    const response = await axiosInstance.get('/manga/tag');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTHOR SEARCH ─────────────────────────────────────────────────────────
app.get('/api/author', async (req, res) => {
  try {
    const qs = buildQuery({ name: req.query.name, limit: 10 });
    const response = await axiosInstance.get(`/author?${qs}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATISTICS ─────────────────────────────────────────────────────────────
app.get('/api/statistics/manga/:id', async (req, res) => {
  try {
    const response = await axiosInstance.get(`/statistics/manga/${req.params.id}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RELATED MANGA ─────────────────────────────────────────────────────────
app.get('/api/manga/:id/related', async (req, res) => {
  try {
    const qs = buildQuery({ 'includes[]': ['cover_art'] });
    const response = await axiosInstance.get(`/manga/${req.params.id}/relation?${qs}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CATCH-ALL: serve index.html ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 MangaVerse server running at http://localhost:${PORT}`);
});
