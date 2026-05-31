//! On-chain proposals contract (#45).
//!
//! Lightweight community-funding proposals: anyone can `create_proposal`
//! with a description + expiry timestamp; members `vote(support: bool)`
//! until that timestamp; afterwards anyone can call `finalize_proposal`
//! to lock the status as Passed/Rejected based on the tally.
//! `execute_proposal` is a separate step (kept simple at MVP — just
//! flips the status to `Executed` and emits an event) and refuses to
//! run unless the proposal has been finalised as `Passed`.
//!
//! The auto-rejection mechanic is the issue's core ask:
//!   - calling `finalize_proposal` before `expires_at` panics
//!   - `yes_votes > no_votes` → `Passed`; otherwise → `Rejected`
//!   - duplicate finalisation is rejected
//!   - `execute_proposal` panics unless status == Passed

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};

// ── Storage layout ──────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    NextProposalId,
    Proposal(u64),
    Vote(u64, Address), // (proposal_id, voter) -> bool (true = yes, false = no)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Rejected,
    Executed,
}

#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub description: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub yes_votes: u32,
    pub no_votes: u32,
    pub status: ProposalStatus,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct ProposalCreatedEvent {
    pub id: u64,
    pub proposer: Address,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct VoteCastEvent {
    pub id: u64,
    pub voter: Address,
    pub support: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct ProposalFinalizedEvent {
    pub id: u64,
    pub status: ProposalStatus,
    pub yes_votes: u32,
    pub no_votes: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct ProposalExecutedEvent {
    pub id: u64,
    pub executor: Address,
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct ProposalsContract;

#[contractimpl]
impl ProposalsContract {
    /// One-time initialisation. The admin slot is reserved so a future
    /// upgrade can wire admin-only governance hooks (e.g. quorum
    /// changes) without breaking the existing API.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextProposalId, &0u64);
    }

    /// Create a new proposal that expires at `expires_at` (unix seconds).
    /// Returns the assigned proposal id.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        description: String,
        expires_at: u64,
    ) -> u64 {
        proposer.require_auth();
        let now = env.ledger().timestamp();
        if expires_at <= now {
            panic!("expires_at must be in the future");
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(0);
        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            description,
            created_at: now,
            expires_at,
            yes_votes: 0,
            no_votes: 0,
            status: ProposalStatus::Active,
        };
        env.storage()
            .instance()
            .set(&DataKey::Proposal(id), &proposal);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &(id + 1));

        env.events().publish(
            (Symbol::new(&env, "proposal_created"),),
            ProposalCreatedEvent {
                id,
                proposer,
                expires_at,
            },
        );
        id
    }

    /// Cast a vote on a proposal. One vote per address per proposal —
    /// re-voting panics. Voting after expiry panics.
    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();
        let mut proposal = Self::load_proposal(&env, proposal_id);
        if !matches!(proposal.status, ProposalStatus::Active) {
            panic!("proposal is not active");
        }
        let now = env.ledger().timestamp();
        if now >= proposal.expires_at {
            panic!("voting window has closed");
        }

        let vote_key = DataKey::Vote(proposal_id, voter.clone());
        if env.storage().instance().has(&vote_key) {
            panic!("voter has already voted");
        }
        env.storage().instance().set(&vote_key, &support);

        if support {
            proposal.yes_votes += 1;
        } else {
            proposal.no_votes += 1;
        }
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "vote_cast"),),
            VoteCastEvent {
                id: proposal_id,
                voter,
                support,
            },
        );
    }

    /// Finalise a proposal after its `expires_at`. Callable by anyone
    /// — the auto-rejection mechanic from the issue. Sets the status
    /// to `Passed` when `yes_votes > no_votes`, else `Rejected`. The
    /// tie (yes_votes == no_votes) breaks toward Rejected per the
    /// issue's `yes_votes <= no_votes` condition.
    pub fn finalize_proposal(env: Env, proposal_id: u64) -> ProposalStatus {
        let mut proposal = Self::load_proposal(&env, proposal_id);
        if !matches!(proposal.status, ProposalStatus::Active) {
            panic!("proposal already finalized");
        }
        let now = env.ledger().timestamp();
        if now < proposal.expires_at {
            panic!("cannot finalize before expiry");
        }

        let new_status = if proposal.yes_votes > proposal.no_votes {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Rejected
        };
        proposal.status = new_status.clone();
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "proposal_finalized"),),
            ProposalFinalizedEvent {
                id: proposal_id,
                status: new_status.clone(),
                yes_votes: proposal.yes_votes,
                no_votes: proposal.no_votes,
            },
        );
        new_status
    }

    /// Execute a Passed proposal. Refuses unless `status == Passed`.
    /// MVP execution simply flips the status to `Executed` and emits
    /// the event; downstream wiring (treasury withdrawals, etc.) can
    /// observe the event and act.
    pub fn execute_proposal(env: Env, executor: Address, proposal_id: u64) {
        executor.require_auth();
        let mut proposal = Self::load_proposal(&env, proposal_id);
        if !matches!(proposal.status, ProposalStatus::Passed) {
            panic!("proposal is not in Passed state");
        }
        proposal.status = ProposalStatus::Executed;
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.events().publish(
            (symbol_short!("executed"),),
            ProposalExecutedEvent {
                id: proposal_id,
                executor,
            },
        );
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        Self::load_proposal(&env, proposal_id)
    }

    fn load_proposal(env: &Env, proposal_id: u64) -> Proposal {
        env.storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found")
    }
}

mod test;