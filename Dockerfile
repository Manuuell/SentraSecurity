FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x deploy/entrypoint.sh

# El entrypoint corre las migraciones (alembic) y luego uvicorn.
# El TCP server de ingestión arranca dentro de uvicorn vía el lifespan de asyncio.
CMD ["./deploy/entrypoint.sh"]
