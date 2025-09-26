# Raspberry Pi Metrics Dashboard (Vue 3)

This project is a Vue 3 + Vite single-page application that visualizes live and historical Raspberry Pi metrics. It polls REST endpoints for current CPU/memory/temperature readings and renders a Chart.js line chart for historical trends.

## Prerequisites

- Node.js 18+
- npm 9+

## Project setup

Install dependencies:

```bash
npm install
```

### Development server

Start Vite's development server (defaults to [http://localhost:5173](http://localhost:5173)):

```bash
npm run dev
```

API requests to `/api/**` are proxied to `http://localhost:${API_PORT}`. Set `API_PORT` (or `PORT`) in your shell if your backend does not run on port `3000`:

```bash
API_PORT=8080 npm run dev
```

### Type checking & linting

This starter template does not ship with additional tooling enabled. Add ESLint/TypeScript as needed.

### Production build

Create an optimized production build in `dist/`:

```bash
npm run build
```

Preview the production bundle locally:

```bash
npm run preview
```

### Serving the built assets

After running `npm run build`, serve the static files in `dist/` using your preferred web server. Examples:

#### Node + Express

```js
import express from 'express'

const app = express()
const port = process.env.PORT || 4173

app.use(express.static('dist'))
app.use('/api', proxyMiddleware) // mount your API routes or proxy middleware

app.listen(port, () => {
  console.log(`Server ready on http://localhost:${port}`)
})
```

#### Nginx

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/metrics-dashboard/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Adjust the upstream target to match your backend's address.
