use soroban_sdk::{contractclient, Address, Env};

/// Minimal interface for calling the group treasury contract.
#[contractclient(name = "TreasuryClient")]
pub trait TreasuryInterface {
    fn withdraw(env: Env, to: Address, amount: i128);
}