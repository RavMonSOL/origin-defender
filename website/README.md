# OriginDefender Website

Vite + React + Tailwind frontend for the OriginDefender project.

### Setup

```bash
cd website
npm install
```

### Development

```bash
npm run dev
```

Then open http://localhost:3000. The frontend proxies `/api/*` to the backend similarity API (expected at `http://localhost:8000`).

### Build

```bash
npm run build
npm run preview
```

### Background Video

Replace `public/background.mp4` with your own looping background video (dark, neon-themed). Recommended: 1920x1080, 30fps, muted.

### Deploy to Vercel

```bash
vercel --prod
```

Environment variables:
- `VITE_API_URL` — override API base (default: `/api`)

---

**Note:** This frontend is a demo. For production, connect to live API endpoints and add proper error handling.