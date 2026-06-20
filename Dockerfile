# Single-container image: builds the React/Vite SPA, then serves it together
# with the FastAPI API from one Python process (uvicorn). No nginx at runtime —
# the frontend and the API live on the same origin/port (8000).

# --- Stage 1: build the frontend ---------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build && test -f dist/index.html

# --- Stage 2: Python runtime that serves API + built SPA ---------------------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JR_DEBUG=false \
    JR_STATIC_DIR=/app/static

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# Copy the built SPA into the static dir FastAPI serves (JR_STATIC_DIR).
COPY --from=frontend /frontend/dist ./static

# Run as a non-root user (uvicorn listens on 8000, so no privileged bind).
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/livez').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
