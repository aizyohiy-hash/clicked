//! Tests for the proposals contract (#45).
//!
//! Covers every acceptance criterion from the issue:
//!   - `finalize_proposal` before expiry panics
//!   - Correct status set based on vote tally
//!   - `execute_proposal` panics if status is not `Passed`
//!
//! Plus the obvious adjacent rules: voting after expiry / re-voting /
//! double-finalize all panic; the `yes_votes <= no_votes` rule resolves
//! ties as `Rejected`.

#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Env, String};

fn setup(env: &Env) -> (ProposalsContractClient<'static>, Address, Address, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ProposalsContract);
    let client = ProposalsContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let alice = Address::generate(env);
    let bob = Address::generate(env);
    let carol = Address::generate(env);

    client.initialize(&admin);
    (client, admin, alice, bob, carol)
}

fn create_proposal_in(
    env: &Env,
    client: &ProposalsContractClient<'static>,
    proposer: &Address,
    expires_in_secs: u64,
) -> u64 {
    let now = env.ledger().timestamp();
    let desc = String::from_str(env, "fund a community art mural");
    client.create_proposal(proposer, &desc, &(now + expires_in_secs))
}

fn advance_time(env: &Env, seconds: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp += seconds;
    });
}

#[test]
fn create_then_vote_then_pass_then_execute_happy_path() {
    let env = Env::default();
    let (client, _admin, alice, bob, carol) = setup(&env);

    let id = create_proposal_in(&env, &client, &alice, 1_000);
    client.vote(&alice, &id, &true);
    client.vote(&bob, &id, &true);
    client.vote(&carol, &id, &false);

    advance_time(&env, 1_001);
    let status = client.finalize_proposal(&id);
    assert_eq!(status, ProposalStatus::Passed);

    let proposal = client.get_proposal(&id);
    assert_eq!(proposal.yes_votes, 2);
    assert_eq!(proposal.no_votes, 1);
    assert_eq!(proposal.status, ProposalStatus::Passed);

    client.execute_proposal(&alice, &id);
    assert_eq!(client.get_proposal(&id).status, ProposalStatus::Executed);
}

#[test]
fn finalize_with_more_no_votes_rejects() {
    let env = Env::default();
    let (client, _admin, alice, bob, carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    client.vote(&alice, &id, &false);
    client.vote(&bob, &id, &true);
    client.vote(&carol, &id, &false);

    advance_time(&env, 501);
    let status = client.finalize_proposal(&id);
    assert_eq!(status, ProposalStatus::Rejected);
}

#[test]
fn finalize_with_a_tie_rejects() {
    // yes_votes <= no_votes → Rejected, per the issue text.
    let env = Env::default();
    let (client, _admin, alice, bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    client.vote(&alice, &id, &true);
    client.vote(&bob, &id, &false);

    advance_time(&env, 501);
    assert_eq!(client.finalize_proposal(&id), ProposalStatus::Rejected);
}

#[test]
fn finalize_with_zero_votes_rejects() {
    // 0 yes <= 0 no → Rejected; closes the door on a no-quorum win.
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    advance_time(&env, 501);
    assert_eq!(client.finalize_proposal(&id), ProposalStatus::Rejected);
}

#[test]
#[should_panic(expected = "cannot finalize before expiry")]
fn finalize_before_expiry_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 1_000);
    // Don't advance time at all.
    client.finalize_proposal(&id);
}

#[test]
#[should_panic(expected = "proposal already finalized")]
fn finalize_twice_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    advance_time(&env, 501);
    client.finalize_proposal(&id);
    client.finalize_proposal(&id);
}

#[test]
#[should_panic(expected = "proposal is not in Passed state")]
fn execute_when_rejected_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    advance_time(&env, 501);
    // No votes → Rejected.
    client.finalize_proposal(&id);
    client.execute_proposal(&alice, &id);
}

#[test]
#[should_panic(expected = "proposal is not in Passed state")]
fn execute_when_still_active_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 1_000);
    // Status is still Active.
    client.execute_proposal(&alice, &id);
}

#[test]
#[should_panic(expected = "voting window has closed")]
fn vote_after_expiry_panics() {
    let env = Env::default();
    let (client, _admin, alice, bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    advance_time(&env, 600);
    client.vote(&bob, &id, &true);
}

#[test]
#[should_panic(expected = "voter has already voted")]
fn double_vote_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    let id = create_proposal_in(&env, &client, &alice, 500);
    client.vote(&alice, &id, &true);
    client.vote(&alice, &id, &false);
}

#[test]
#[should_panic(expected = "expires_at must be in the future")]
fn create_with_past_expiry_panics() {
    let env = Env::default();
    let (client, _admin, alice, _bob, _carol) = setup(&env);
    // expires_at == now → not in the future → panic.
    let desc = String::from_str(&env, "x");
    client.create_proposal(&alice, &desc, &env.ledger().timestamp());
}