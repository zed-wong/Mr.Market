install-interface:
	@echo "Installing interface dependencies..."
	@cd interface && bun install || exit 1
	@echo "Client dependencies installed successfully!"
.PHONY: install-interface

install-server:
	@echo "Installing server dependencies..."
	@cd server && bun install || exit 1
	@echo "Server dependencies installed successfully!"
.PHONY: install-server

install: install-interface install-server
	@echo "All dependencies installed successfully!"
.PHONY: install

#

run-migrations:
	@echo "Running migrations..."
	@cd server && bun run build && bun run migration:run
.PHONY: run-migrations

run-seeder:
	@echo "Running seeder..."
	@cd server && bun run migration:seed
.PHONY: run-seeder

#

start-interface:
	@echo "Starting interface..."
	@cd interface && bun run dev
.PHONY: start-interface

start-server:
	@echo "Starting server..."
	@cd server && bun run start:dev
.PHONY: start-server

start-dev:
	$(MAKE) -j 2 start-interface start-server
.PHONY: start-dev

start-server-docker:
	@echo "Starting server in docker..."
	@cd server && docker-compose up
.PHONY: start-server-docker

one-shot: install run-migrations run-seeder start-dev
.PHONY: one-shot

#

test-interface-unit:
	@echo "Running interface unit tests..."
	@cd interface && bun run test:unit
.PHONY: test-interface-unit

test-interface-e2e:
	@echo "Running interface e2e tests..."
	@cd interface && bun run test:e2e
.PHONY: test-interface-e2e

test-interface: test-interface-unit test-interface-e2e
	@echo "Interface tests completed!"
.PHONY: test-interface

test-server-unit:
	@echo "Running server unit tests..."
	@cd server && bun run test
.PHONY: test-server-unit

test-server: test-server-unit
	@echo "Server tests completed!"
.PHONY: test-server

test: test-interface test-server
	@echo "All tests completed!"
.PHONY: test

lint-interface:
	@echo "Linting interface..."
	@cd interface && bun run lint
.PHONY: lint-interface

lint-server:
	@echo "Linting server..."
	@cd server && bun run lint
.PHONY: lint-server

lint: lint-interface lint-server
	@echo "Linting completed!"
.PHONY: lint

pr-check-interface:
	@echo "Running interface PR check"
	@cd interface && bun run pr:check
.PHONY: pr-check-interface

pr-check-server:
	@echo "Running server PR check"
	@cd server && bun run pr:check
.PHONY: pr-check-server

pr-check: pr-check-interface pr-check-server
	@echo "Running pr check"
.PHONY: pr-check
