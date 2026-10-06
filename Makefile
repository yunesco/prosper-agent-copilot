# Run from the repository root. Install dependencies once before offline checks.
PYTHON := backend/.venv/bin/python
RUFF := backend/.venv/bin/ruff
NPM := npm --prefix frontend

.PHONY: help install dev run verify format lint typecheck test contract eval-check eval-copilot e2e browser-install build clean

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dev launcher and both stacks from lockfiles (network required)
	npm ci
	uv sync --locked --directory backend
	$(NPM) ci

dev: ## Start frontend and voice backend together
	npm run dev

run: ## Run the existing Pipecat voice agent (requires backend/.env)
	uv run --locked --directory backend python bot.py

verify: lint typecheck test contract eval-check ## Canonical offline engineering gate (no model keys/browser required)

format: ## Format the frontend with Prettier
	$(NPM) run format

lint: ## Check formatting and lint Python and TypeScript
	$(RUFF) check backend
	$(NPM) run format:check
	$(NPM) run lint

typecheck: ## Check TypeScript and Python syntax without starting the runtime
	$(NPM) run typecheck
	$(PYTHON) -m compileall -q backend/agent_builder backend/bot.py backend/tests

test: ## Deterministic backend and frontend unit/integration tests
	cd backend && .venv/bin/python -m pytest
	$(NPM) test

contract: ## Compare TypeScript normalization/validation to the real Python builder
	$(NPM) run check:contract

eval-check: ## Validate eval fixtures/scoring with synthetic recorded traces (offline)
	$(NPM) run eval:check

eval-copilot: ## Model-dependent evals; requires a real COPILOT_EVAL_ADAPTER
	$(NPM) run eval:copilot

browser-install: ## Install Chromium for e2e (network required)
	cd frontend && npx playwright install chromium

e2e: ## Build and test the app in Chromium (no model or voice services)
	$(NPM) run test:e2e

build: ## Build production Next.js without network fonts or provider keys
	NEXT_TELEMETRY_DISABLED=1 $(NPM) run build

clean: ## Remove generated build/test outputs; preserve installed dependencies
	rm -rf frontend/.next frontend/playwright-report frontend/test-results evals/results
