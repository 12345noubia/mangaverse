# 🌌 MangaVerse — Professional Manga & Webtoon Reader Platform

A full-stack manga reader with a beautiful dark UI, proxy backend, and complete MangaDex API integration.

## ✨ Features

- 🔥 **Trending & Popular** — Most followed series on MangaDex
- ⚡ **Latest Updates** — Fresh chapters uploaded daily
- 🎭 **Genre Browsing** — All genres with beautiful cards
- 🔍 **Full-text Search** — Instant search with autocomplete
- 📖 **Chapter Reader** — Vertical scroll, single page, double page modes
- 🌍 **All Languages** — Every language supported, flags and all
- 📚 **My Library** — Save & bookmark your favorites
- 📜 **Read History** — Track completed chapters
- 🌙 **Dark/Light Mode** — Gorgeous neon dark theme + clean light mode
- 🖼️ **High-res Covers** — 512px covers, proxied for performance
- 📱 **Fully Responsive** — Mobile-first design

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
# or for development with auto-restart:
npm run dev
```

### 3. Open Your Browser

```
http://localhost:3000
```

## 🏗️ Architecture

```
mangaverse/
├── server/
│   └── index.js          # Express proxy server
├── public/
│   ├── index.html        # App shell + all views
│   ├── css/
│   │   └── main.css      # Full design system
│   └── js/
│       └── app.js        # Frontend application
└── package.json
```

### Proxy Pattern

```
Browser  →  /api/*  →  Express Server  →  MangaDex API
                    ↓
               /api/cover     →  uploads.mangadex.org
               /api/image-proxy → chapter image CDNs
```

**The frontend NEVER directly contacts any external API.** All requests go through the Express proxy, which:
- Handles CORS
- Injects required headers
- Proxies images with caching headers
- Validates image URLs (security)

## 🎨 Design System

**Colors:**
- `--cyan: #00D9FF` — Primary accent (interactive elements)
- `--orange: #FF6B35` — Secondary accent (warnings, saves)
- `--green: #39FF6A` — Tertiary accent (status, success)
- `--bg-primary: #111318` — Main background

**Typography:**
- `Syne` — Display headings (bold, modern)
- `Roboto Mono` — Code, metadata, IDs
- `DM Sans` — Body text

## 📡 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/manga` | Search/list manga |
| `GET /api/manga/:id` | Single manga details |
| `GET /api/manga/:id/chapters` | Chapter list |
| `GET /api/chapter/:id/pages` | Chapter page URLs |
| `GET /api/cover` | Proxied cover images |
| `GET /api/image-proxy` | Proxied chapter pages |
| `GET /api/tags` | All genre tags |
| `GET /api/statistics/manga/:id` | Ratings/stats |

## 🌐 Languages

All available translations are fetched and displayed with:
- Country flag emojis
- Language code badges
- Filterable in chapter lists and modals

## 📱 Reader Modes

1. **Vertical Scroll** — Continuous scroll (webtoon style)
2. **Single Page** — One page at a time with prev/next
3. **Double Page** — Two-page spread (manga style)
4. **Keyboard Navigation** — Arrow keys work in reader

## 🔒 Security

- Image proxy validates URLs (only mangadex.org domains allowed)
- No API keys needed (MangaDex is open)
- CORS handled server-side
- All external requests from server, not browser

---

Built with ❤️ using Express.js + Vanilla JS + MangaDex API
