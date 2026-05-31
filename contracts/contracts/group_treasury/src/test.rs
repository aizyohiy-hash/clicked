#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

// ── Minimal mock token contract ───────────────────────────────────────────────

mod mock_token {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum Key {
        Balance(Address),
    }

    #[contract]
    pub struct MockToken;

    #[contractimpl]
    impl MockToken {
        pub fn mint(env: Env, to: Address, amount: i128) {
            let key = Key::Balance(to);
            let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage().persistent().set(&key, &(current + amount));
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            from.require_auth();
            let from_key = Key::Balance(from.clone());
            let to_key = Key::Balance(to.clone());
            let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
            assert!(from_bal >= amount, "insufficient balance");
            env.storage().persistent().set(&from_key, &(from_bal - amount));
            let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
            env.storage().persistent().set(&to_key, &(to_bal + amount));
        }

        pub fn balance(env: Env, id: Address) -> i128 {
            env.storage()
                .persistent()
                .get(&Key::Balance(id))
                .unwrap_or(0)
        }
    }
}

use mock_token::MockTokenClient;

/// Returns (contract_id, token_id, admin, member)
fn setup(env: &Env) -> (Address, Address, Address, Address) {
    let admin = Address::generate(env);
    let member = Address::generate(env);

    let token_id = env.register(mock_token::MockToken, ());
    let token = MockTokenClient::new(env, &token_id);
    token.mint(&member, &1_000_000);

    let contract_id = env.register(GroupTreasuryContract, ());
    let client = GroupTreasuryContractClient::new(env, &contract_id);
    client.initialize(&admin, &token_id);

    (contract_id, token_id, admin, member)
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let (contract_id, _token_id, _admin, _member) = setup(&env);
    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    assert_eq!(client.balance(), 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let env = Env::default();
    let (contract_id, token_id, _admin, _member) = setup(&env);
    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    let other = Address::generate(&env);
    client.initialize(&other, &token_id);
}

#[test]
fn test_deposit_increases_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, _token_id, _admin, member) = setup(&env);
    let client = GroupTreasuryContractClient::new(&env, &contract_id);

    client.deposit(&member, &300_000);
    assert_eq!(client.balance(), 300_000);
}

#[test]
fn test_balance_reflects_multiple_deposits() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, token_id, _admin, member) = setup(&env);
    let token = MockTokenClient::new(&env, &token_id);
    let member2 = Address::generate(&env);
    token.mint(&member2, &500_000);

    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    client.deposit(&member, &200_000);
    client.deposit(&member2, &150_000);

    assert_eq!(client.balance(), 350_000);
}

#[test]
fn test_admin_can_withdraw() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, token_id, _admin, member) = setup(&env);
    let token = MockTokenClient::new(&env, &token_id);
    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    let recipient = Address::generate(&env);

    client.deposit(&member, &400_000);
    client.withdraw(&recipient, &100_000);

    assert_eq!(client.balance(), 300_000);
    assert_eq!(token.balance(&recipient), 100_000);
}

#[test]
fn test_balance_correct_after_deposits_and_withdrawals() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_id, token_id, _admin, member) = setup(&env);
    let token = MockTokenClient::new(&env, &token_id);
    let member2 = Address::generate(&env);
    token.mint(&member2, &500_000);

    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    let recipient = Address::generate(&env);

    client.deposit(&member, &600_000);
    client.deposit(&member2, &200_000);
    client.withdraw(&recipient, &300_000);

    // 600_000 + 200_000 - 300_000 = 500_000
    assert_eq!(client.balance(), 500_000);
}

#[test]
#[should_panic]
fn test_non_admin_cannot_withdraw() {
    let env = Env::default();
    // Do not mock all auths — calling withdraw without the admin's auth must panic.

    let admin = Address::generate(&env);
    let token_id = env.register(mock_token::MockToken, ());

    let contract_id = env.register(GroupTreasuryContract, ());
    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id);

    let recipient = Address::generate(&env);
    // admin.require_auth() inside withdraw will fail — no auth context set up.
    client.withdraw(&recipient, &100);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_deposit_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, _token_id, _admin, member) = setup(&env);
    let client = GroupTreasuryContractClient::new(&env, &contract_id);
    client.deposit(&member, &0);
}
