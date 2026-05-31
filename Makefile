# Start infrastructure (Postgres, Redis) then all applications via Turborepo.
dev:
	docker compose -f infra/docker-compose.yml up -d
	pnpm dev

# Run database migrations for the backend package.
migrate:
	pnpm --filter backend db:migrate

# Run all test suites: JS/TS packages and Soroban contracts.
test:
	pnpm --filter backend test
	cd contracts && cargo test

# Run linting across all packages via Turborepo.
lint:
	pnpm lint

# Build and deploy all Soroban smart contracts to the configured network.
deploy-contracts:
	bash contracts/scripts/deploy_token_transfer.sh
	bash contracts/scripts/deploy_group_treasury.sh

.PHONY: dev migrate test lint deploy-contracts
