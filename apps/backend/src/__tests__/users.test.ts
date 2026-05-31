import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { signToken } from '../lib/jwt.js';

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}));

const { usersRouter } = await import('../routes/users.js');
const { db } = await import('../db/index.js');

const app = express();
app.use(express.json());
app.use('/users', usersRouter);

const VALID_TOKEN = signToken({ userId: 'auth-user-id', walletAddress: 'GAUTH' });
const AUTH_HEADER = `Bearer ${VALID_TOKEN}`;

const MOCK_USER = {
  id: 'user-uuid-123',
  username: 'testuser',
  avatarUrl: 'https://example.com/avatar.png',
  wallets: [
    { address: 'GABCDEFG', isPrimary: true },
    { address: 'GHIJKLMN', isPrimary: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /users/:id', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/users/user-uuid-123');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/users/user-uuid-123')
      .set('Authorization', 'Bearer invalid.token.value');
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(app)
      .get('/users/user-uuid-123')
      .set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    const res = await request(app)
      .get('/users/unknown-uuid')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  it('returns 404 for a malformed (non-UUID) id', async () => {
    vi.mocked(db.query.users.findFirst).mockRejectedValue(new Error('invalid input syntax for type uuid'));

    const res = await request(app)
      .get('/users/not-a-valid-uuid')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  it('returns the user profile with wallets on success', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(MOCK_USER as any); // eslint-disable-line

    const res = await request(app)
      .get('/users/user-uuid-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MOCK_USER.id);
    expect(res.body.username).toBe(MOCK_USER.username);
    expect(res.body.avatarUrl).toBe(MOCK_USER.avatarUrl);
    expect(res.body.wallets).toHaveLength(2);
    expect(res.body.wallets[0]).toEqual({ address: 'GABCDEFG', isPrimary: true });
    expect(res.body.wallets[1]).toEqual({ address: 'GHIJKLMN', isPrimary: false });
  });

  it('strips internal fields even if db returns them', async () => {
    const userWithInternals = {
      ...MOCK_USER,
      createdAt: new Date(),
      updatedAt: new Date(),
      wallets: MOCK_USER.wallets.map((w) => ({
        ...w,
        id: 'wallet-uuid',
        userId: 'user-uuid-123',
        createdAt: new Date(),
      })),
    };
    vi.mocked(db.query.users.findFirst).mockResolvedValue(userWithInternals as any); // eslint-disable-line

    const res = await request(app)
      .get('/users/user-uuid-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    // Explicit serialization in handler ensures internal fields never reach the response
    expect(res.body).not.toHaveProperty('createdAt');
    expect(res.body).not.toHaveProperty('updatedAt');
    expect(res.body.wallets[0]).not.toHaveProperty('id');
    expect(res.body.wallets[0]).not.toHaveProperty('userId');
    expect(res.body.wallets[0]).not.toHaveProperty('createdAt');
  });
});
