.PHONY: help backend-install backend-dev backend-test frontend-install frontend-dev frontend-test frontend-build image up down logs

IMAGE ?= jinja-render-app:latest

help:
	@echo "Targets:"
	@echo "  backend-install   Create venv and install backend deps"
	@echo "  backend-dev       Run backend with uvicorn --reload"
	@echo "  backend-test      Run backend pytest suite"
	@echo "  frontend-install  Install frontend deps"
	@echo "  frontend-dev      Run Vite dev server"
	@echo "  frontend-test     Run vitest"
	@echo "  frontend-build    Type-check and build frontend"
	@echo "  image             Build the single app image (multi-stage Dockerfile)"
	@echo "  up                docker compose up -d --build (one app container)"
	@echo "  down              docker compose down"
	@echo "  logs              docker compose logs -f"

backend-install:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt pytest httpx

backend-dev:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

backend-test:
	cd backend && . .venv/bin/activate && python -m pytest -q

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-test:
	cd frontend && npm run test

frontend-build:
	cd frontend && npm run build

image:
	docker build -t $(IMAGE) .

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f
