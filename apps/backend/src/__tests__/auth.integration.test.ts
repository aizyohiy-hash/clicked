import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mocks (must be declared before any imports that use them) ─────────────

const mockCreateNonce = vi.fn(() => 'test-nonce-abc123');
const mockConsumeNonce = vi.fn();

vi.mock('../lib/nonce.js', () => ({
  createNonce: mockCreateNonce,
  consumeNonce: mockConsumeNonce,
}));

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      wallets: { findFirst: mockFindFirst },
    },
    insert: mockInsert,
    execute: vi.fn().mockResolvedValue([]),
  },
}));

const mockVerify = vi.fn(() => true);
vi.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: vi.fn(() => ({ verify: mockVerify })),
  },
}));

// ── Import app after mocks are registered ─────────────────────────────────

const { app } = await import('../app.js');

// ── Helpers ───────────────────────────────────────────────────────────────

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456789AB';
const SIGNATURE = 'aabbccdd';
const NONCE = 'test-nonce-abc123';

function setupInsert(userId = 'new-user-id') {
  const returningFn = vi.fn().mockResolvedValue([{ id: userId }]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  mockInsert.mockReturnValue({ values: valuesFn });
  return { returningFn, valuesFn };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /auth/challenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with message and nonce for valid walletAddress', async () => {
    const res = await request(app).post('/auth/challenge').send({ walletAddress: WALLET });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nonce', NONCE);
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message).toContain(WALLET);
    expect(mockCreateNonce).toHaveBeenCalledWith(WALLET);
  });

  it('returns 400 with error when walletAddress is missing', async () => {
    const res = await request(app).post('/auth/challenge').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockCreateNonce).not.toHaveBeenCalled();
  });

  it('returns 400 when body is completely absent', async () => {
    const res = await request(app)
      .post('/auth/challenge')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with JWT token for valid new-user flow', async () => {
    mockConsumeNonce.mockReturnValue(true);
    mockVerify.mockReturnValue(true);
    mockFindFirst.mockResolvedValue(undefined); // no existing wallet → create user
    setupInsert();

    const res = await request(app)
      .post('/auth/verify')
      .send({ walletAddress: WALLET, signature: SIGNATURE, nonce: NONCE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    const parts = (res.body.token as string).split('.');
    expect(parts).toHaveLength(3); // valid JWT structure
  });

  it('returns 200 with JWT for existing wallet (returning user)', async () => {
    mockConsumeNonce.mockReturnValue(true);
    mockVerify.mockReturnValue(true);
    mockFindFirst.mockResolvedValue({ userId: 'existing-user-id', address: WALLET });

    const res = await request(app)
      .post('/auth/verify')
      .send({ walletAddress: WALLET, signature: SIGNATURE, nonce: NONCE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('returns 401 when nonce is expired or invalid', async () => {
    mockConsumeNonce.mockReturnValue(false);

    const res = await request(app)
      .post('/auth/verify')
      .send({ walletAddress: WALLET, signature: SIGNATURE, nonce: 'expired-nonce' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when signature verification fails', async () => {
    mockConsumeNonce.mockReturnValue(true);
    mockVerify.mockReturnValue(false);

    const res = await request(app)
      .post('/auth/verify')
      .send({ walletAddress: WALLET, signature: 'badsig', nonce: NONCE });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/auth/verify').send({ walletAddress: WALLET });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when all fields are absent', async () => {
    const res = await request(app).post('/auth/verify').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when Stellar Keypair throws (malformed wallet address)', async () => {
    mockConsumeNonce.mockReturnValue(true);
    mockVerify.mockImplementation(() => {
      throw new Error('invalid key');
    });

    const res = await request(app)
      .post('/auth/verify')
      .send({ walletAddress: 'INVALID', signature: SIGNATURE, nonce: NONCE });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
