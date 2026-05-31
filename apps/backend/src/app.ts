import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { usersRouter } from './routes/users.js';
import { requireAuth, type AuthRequest } from './middleware/auth.js';

export const app: Express = express();

app.use(cors());
app.use(express.json());
if (process.env['NODE_ENV'] !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/auth', authRouter);
app.use('/conversations', conversationsRouter);
app.use('/users', usersRouter);

app.get('/me', requireAuth, (req, res) => {
  res.json({ user: (req as AuthRequest).auth });
});
