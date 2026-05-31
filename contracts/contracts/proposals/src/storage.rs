use soroban_sdk::{contracttype, Address, String};

#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub proposer: Address,
    pub description: String,
    pub amount: i128,
    pub recipient: Address,
    pub yes_votes: u32,
    pub no_votes: u32,
    /// Unix timestamp (seconds) when the voting period closes.
    pub end_time: u64,
    pub executed: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    NextId,
    Proposal(u32),
    /// Tracks whether a given voter has already voted on a proposal.
    Voted(u32, Address),
}

#[contracttype]
pub struct ProposalCreatedEvent {
    pub id: u32,
    pub proposer: Address,
    pub amount: i128,
}

#[contracttype]
pub struct VoteCastEvent {
    pub proposal_id: u32,
    pub voter: Address,
    pub approve: bool,
}

#[contracttype]
pub struct ProposalExecutedEvent {
    pub proposal_id: u32,
    pub passed: bool,
}