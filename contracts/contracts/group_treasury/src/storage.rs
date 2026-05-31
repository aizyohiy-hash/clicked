use soroban_sdk::{contracttype, Address};

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
}

#[contracttype]
pub struct DepositEvent {
    pub from: Address,
    pub amount: i128,
}

#[contracttype]
pub struct WithdrawEvent {
    pub to: Address,
    pub amount: i128,
}
