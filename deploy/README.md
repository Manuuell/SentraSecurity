# Despliegue — SentraSecurity

Producción: **https://sentrasecurity.duckdns.org** (VPS Oracle ARM, `158.101.105.13`).

## Arquitectura en el VPS

```
Internet ──HTTPS 443──▶ nginx del host ──┬─ /            → /var/www/sentrasecurity (frontend estático)
                                         ├─ /api/        → 127.0.0.1:8000  (contenedor sentra-api)
                                         └─ /osrm/       → 127.0.0.1:5000  (contenedor sentra-osrm)

Trackers ST-907L ──TCP 5013──▶ sentra-api:8090 (ingestión)
sentra-api ──▶ sentra-postgres (interno)
```

Todo vive en `~/sentra-gps/`:
```
~/sentra-gps/
├── repo/     git clone (backend: Dockerfile + docker-compose.yml)
│   └── .env  secretos (NO en git): POSTGRES_PASSWORD, SECRET_KEY, CORS_ORIGINS
└── (el frontend estático va a /var/www/sentrasecurity, lo despliega Actions)
```

## CI/CD (GitHub Actions)

En cada push a `main` (`.github/workflows/deploy.yml`):
1. **test** — pytest del backend + build del frontend.
2. **deploy** — build de producción del frontend → rsync a `/var/www/sentrasecurity`;
   luego `git pull` + `docker compose up -d --build` en el VPS; verifica `/api/healthz`.

Secretos del repo (GitHub → Settings → Secrets):
- `VPS_SSH_KEY` — clave privada de despliegue (ed25519 dedicada).
- `VPS_HOST` — `158.101.105.13`
- `VPS_USER` — `ubuntu`

## Primer despliegue manual (una vez)

```bash
# En el VPS
mkdir -p ~/sentra-gps && cd ~/sentra-gps
git clone https://github.com/Manuuell/SentraSecurity repo
cd repo
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 24)
SECRET_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=https://sentrasecurity.duckdns.org
EOF
docker compose up -d --build

# Frontend + nginx + TLS
sudo mkdir -p /var/www/sentrasecurity && sudo chown ubuntu:ubuntu /var/www/sentrasecurity
sudo ln -s $PWD/deploy/nginx-sentrasecurity.conf /etc/nginx/sites-available/sentrasecurity
sudo ln -s /etc/nginx/sites-available/sentrasecurity /etc/nginx/sites-enabled/
sudo certbot --nginx -d sentrasecurity.duckdns.org
sudo nginx -t && sudo systemctl reload nginx

# Crear el primer admin
docker exec -it sentra-api python -m server.create_admin admin@sentrasecurity.co <clave> --role admin --name "Admin"
```
