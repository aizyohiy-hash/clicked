import jwt from 'jsonwebtoken';

const SECRET = process.env['JWT_SECRET'];

if (!SECRET) {
  throw new Error('JWT_SECRET is not set');
}

const JWT_SECRET: string = SECRET;

export interface JwtPayload {
  userId: string;
  walletAddress: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
}
