COMPOSE = docker compose -f docker-compose.yml
DATASET_DIR ?= /dataset
CACHE_DIR ?= /cache
OUT_DIR ?= /output
EPOCHS ?= 12
SECONDS_BUDGET ?= 230

.PHONY: setup dev test lint seed train e2e verify

setup:
	$(COMPOSE) build backend frontend

dev:
	$(COMPOSE) up --build

test:
	$(COMPOSE) run --rm backend python -m pytest -q --cov=app --cov-report=term-missing --cov-fail-under=85 tests

lint:
	$(COMPOSE) run --rm frontend sh -c "npm ci && npm run lint"

seed:
	$(COMPOSE) exec backend python -m app.seed --admin

train:
	$(COMPOSE) run --rm --build trainer sh -c "python ml_training/prepare_cache.py $(DATASET_DIR) $(CACHE_DIR) train && python ml_training/prepare_cache.py $(DATASET_DIR) $(CACHE_DIR) val && python ml_training/prepare_cache.py $(DATASET_DIR) $(CACHE_DIR) test"
	$(COMPOSE) run --rm trainer python ml_training/train.py $(DATASET_DIR) $(OUT_DIR) $(EPOCHS) $(SECONDS_BUDGET) $(CACHE_DIR)

e2e:
	$(COMPOSE) up -d --wait postgres backend
	$(COMPOSE) exec -T -e E2E_SEED_ALLOW_RESET=1 backend python -m app.seed_e2e --reset
	npm --prefix narcotrace-frontend run test:e2e -- --reporter=html,list

verify:
	python scripts/verify.py
