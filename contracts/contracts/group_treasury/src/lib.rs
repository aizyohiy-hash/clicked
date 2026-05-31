#![no_std]

mod storage;
mod token_interface;
mod test;

use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};
use storage::{DataKey, DepositEvent, WithdrawEvent};
use token_interface::TokenClient;

#[contract]
pub struct GroupTreasuryContract;

#[contractimpl]
impl GroupTreasuryContract {
    /// One-time initialisation. Sets the admin and the SEP-41 token held by
    /// this treasury.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Transfer `amount` tokens from `from` into the treasury.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        from.require_auth();

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");

        TokenClient::new(&env, &token_id).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            DepositEvent { from, amount },
        );
    }

    /// Admin-only: transfer `amount` tokens from the treasury to `to`.
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");

        TokenClient::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            WithdrawEvent { to, amount },
        );
    }

    /// Returns the token balance currently held by this treasury.
    pub fn balance(env: Env) -> i128 {
        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");

        TokenClient::new(&env, &token_id).balance(&env.current_contract_address())
    }
}
