#!/usr/bin/env bash
# Deploy group_treasury contract to Stellar testnet.
#
# Prerequisites:
#   - stellar CLI installed  (https://developers.stellar.org/docs/tools/stellar-cli)
#   - DEPLOYER_SECRET env var set (Stellar secret key of the deployer/admin account)
#   - TOKEN_CONTRACT_ID env var set (contract ID of the SEP-41 token to hold)
#
# Usage:
#   DEPLOYER_SECRET=S... TOKEN_CONTRACT_ID=C... ./scripts/deploy_group_treasury.sh

set -euo pipefail

NETWORK="testnet"
WASM_PATH="target/wasm32-unknown-unknown/release/group_treasury.wasm"

if [[ -z "${DEPLOYER_SECRET:-}" ]]; then
  echo "Error: DEPLOYER_SECRET is not set" >&2
  exit 1
fi

if [[ -z "${TOKEN_CONTRACT_ID:-}" ]]; then
  echo "Error: TOKEN_CONTRACT_ID is not set" >&2
  exit 1
fi

echo "==> Building contract..."
cargo build -p group_treasury --target wasm32-unknown-unknown --release

echo "==> Uploading WASM to testnet..."
WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --source "$DEPLOYER_SECRET" \
  --wasm "$WASM_PATH")

echo "    WASM hash: $WASM_HASH"

echo "==> Deploying contract instance..."
CONTRACT_ID=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER_SECRET" \
  --wasm-hash "$WASM_HASH")

echo "    Contract ID: $CONTRACT_ID"

ADMIN_PUBLIC=$(stellar keys public-key --secret-key "$DEPLOYER_SECRET")

echo "==> Initialising contract..."
stellar contract invoke \
  --network "$NETWORK" \
  --source "$DEPLOYER_SECRET" \
  --id "$CONTRACT_ID" \
  -- initialize \
  --admin "$ADMIN_PUBLIC" \
  --token "$TOKEN_CONTRACT_ID"

echo ""
echo "group_treasury deployed and initialised"
echo "  Contract ID : $CONTRACT_ID"
echo "  Token       : $TOKEN_CONTRACT_ID"
echo "  Admin       : $ADMIN_PUBLIC"
echo ""
echo "Add to your .env:"
echo "  GROUP_TREASURY_CONTRACT_ID=$CONTRACT_ID"