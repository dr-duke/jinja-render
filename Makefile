.PHONY: help backend-install backend-dev backend-test frontend-install frontend-dev frontend-test frontend-build up down logs

help:
	@echo "Targets:"
	@echo "  backend-install   Create venv and install backend deps"
	@echo "  backend-dev       Run backend with uvicorn --reload"
	@echo "  backend-test      Run backend pytest suite"
	@echo "  frontend-install  Install frontend deps"
	@echo "  frontend-dev      Run Vite dev server"
	@echo "  frontend-test     Run vitest"
	@echo "  frontend-build    Type-check and build frontend"
	@echo "  up                docker compose up -d --build"
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

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f
