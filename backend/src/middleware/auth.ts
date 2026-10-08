import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/config.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';


export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
};

export function signAccessToken(user: AuthUser) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as string, algorithm: 'HS256' } as jwt.SignOptions,
  );
}

export function signRefreshToken(userId: string) {
  return jwt.sign(
    { sub: userId, typ: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL as string, algorithm: 'HS256' } as jwt.SignOptions,
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const cookieToken = (req as any).cookies?.accessToken as string | undefined;
    const token = bearer || cookieToken;
    if (!token) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
    };
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const cookieToken = (req as any).cookies?.accessToken as string | undefined;
  const token = bearer || cookieToken;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
    };
  } catch {
    // ignore invalid optional auth
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  if (req.user.role !== 'ADMIN') return next(new AppError(403, 'Admin role required', 'FORBIDDEN'));
  next();
}

export async function loadUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}
