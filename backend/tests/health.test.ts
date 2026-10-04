import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('health', () => {
  it('responds on /api/health', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('marketProvider', 'Yahoo Finance');
  });
});
