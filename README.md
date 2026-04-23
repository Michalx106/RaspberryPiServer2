# RaspberryPiServer2

Projekt zawiera frontend Vue (`client/`) oraz backend Python FastAPI (`server/`).

Szczegóły uruchomienia backendu i formatu danych urządzeń (JSON) są opisane w `server/README.md`.

## Docker

W repo są gotowe pliki Dockera dla backendu i frontendu oraz `docker-compose.yml` w katalogu głównym.

### Uruchomienie całego stacku

```bash
docker compose up --build -d
```

- Frontend: `https://localhost` (oraz przekierowanie z `http://localhost`)
- Backend API (przez reverse proxy): `https://localhost/api`
- Backend API (bezpośrednio): `http://localhost:3000`

### HTTPS + reverse proxy (Nginx)

Frontendowy kontener Nginx działa jako reverse proxy dla backendu na ścieżce `/api/*` i terminates TLS na porcie `443`.

1. Utwórz katalog certyfikatów:

```bash
mkdir -p certs certbot/www
```

2. Dodaj certyfikat i klucz do `./certs`:

- `certs/fullchain.pem`
- `certs/privkey.pem`

Dla testów lokalnych możesz użyć self-signed cert:

```bash
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -days 365 -subj "/CN=localhost"
```

3. Uruchom kontenery:

```bash
docker compose up --build -d
```

Opcjonalne zmienne środowiskowe:

- `SERVER_NAME` (domyślnie `_`)
- `SSL_CERT_PATH` (domyślnie `/etc/nginx/certs/fullchain.pem`)
- `SSL_CERT_KEY_PATH` (domyślnie `/etc/nginx/certs/privkey.pem`)

### Zatrzymanie

```bash
docker compose down
```
