# RaspberryPiServer2

Projekt zawiera frontend Vue (`client/`) oraz backend Python FastAPI (`server/`).

Szczegóły uruchomienia backendu i formatu danych urządzeń (JSON) są opisane w `server/README.md`.

## Docker

W repo są gotowe pliki Dockera dla backendu i frontendu oraz `docker-compose.yml` w katalogu głównym.

### Uruchomienie całego stacku

```bash
docker compose up --build -d
```

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3000`

### Zatrzymanie

```bash
docker compose down
```
