import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { env } from '../lib/config.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function setAuthCookies(res: import('express').Response, accessToken: string, refreshToken: string) {
  const secure = env.NODE_ENV === 'production';
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: import('express').Response) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body as z.infer<typeof registerSchema>;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });
    await prisma.watchlist.create({ data: { userId: user.id, name: 'Default' } });
    const authUser = { id: user.id, email: user.email, name: user.name, role: user.role as 'USER' | 'ADMIN' };
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(user.id);
    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date((decoded.exp || 0) * 1000),
      },
    });
    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json({
      user: authUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    const authUser = { id: user.id, email: user.email, name: user.name, role: user.role as 'USER' | 'ADMIN' };
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(user.id);
    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date((decoded.exp || 0) * 1000),
      },
    });
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user: authUser, accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const refresh = (req as any).cookies?.refreshToken as string | undefined;
    if (refresh) {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(refresh), userId: req.user!.id } });
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refresh = ((req as any).cookies?.refreshToken || req.body?.refreshToken) as string | undefined;
    if (!refresh) throw new AppError(401, 'Refresh token required', 'UNAUTHORIZED');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(refresh, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    } catch {
      throw new AppError(401, 'Invalid refresh token', 'UNAUTHORIZED');
    }
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refresh) } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token expired', 'UNAUTHORIZED');
    }
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user) throw new AppError(401, 'User not found', 'UNAUTHORIZED');
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const authUser = { id: user.id, email: user.email, name: user.name, role: user.role as 'USER' | 'ADMIN' };
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(user.id);
    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date((decoded.exp || 0) * 1000),
      },
    });
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user: authUser, accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch('/me', requireAuth, validateBody(z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()).optional(),
})), async (req, res, next) => {
  try {
    const data = req.body as { name?: string; email?: string };
    if (data.email) {
      const taken = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: req.user!.id } } });
      if (taken) throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, email: true, name: true, role: true },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
