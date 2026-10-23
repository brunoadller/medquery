import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

const ISSUER = 'medconsulta-api';
const AUDIENCE = 'medconsulta-app';

/** Access token: JWT curto (15 min por padrão), assinado com HS256 e validado com algoritmo fixo. */
export function signAccessToken(doctorId: string): string {
  return jwt.sign({}, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: doctorId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: config.ACCESS_TTL_MIN * 60,
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): { sub: string; iat: number } | null {
  try {
    const p = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof p === 'object' && typeof p.sub === 'string' && typeof p.iat === 'number') {
      return { sub: p.sub, iat: p.iat };
    }
    return null;
  } catch {
    return null;
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Refresh token: valor aleatório opaco (384 bits). No banco guardamos só o hash,
 * então um vazamento do banco não entrega sessões utilizáveis.
 */
export function issueRefreshToken(doctorId: string, familyId: string = crypto.randomUUID()) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO refresh_tokens (id, doctor_id, family_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), doctorId, familyId, sha256(raw), now + config.REFRESH_TTL_DAYS * 86_400_000, now);
  return { token: raw, familyId };
}

interface RefreshRow {
  id: string;
  doctor_id: string;
  family_id: string;
  expires_at: number;
  used_at: number | null;
  revoked_at: number | null;
}

/**
 * Rotação: cada refresh token só vale uma vez. Se um token já usado aparecer de novo
 * (sinal de roubo), toda a família de sessões é revogada.
 */
export const rotateRefreshToken = db.transaction((raw: string) => {
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha256(raw)) as RefreshRow | undefined;
  const now = Date.now();
  if (!row || row.revoked_at || row.expires_at < now) return null;

  if (row.used_at) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(now, row.family_id);
    return null;
  }
  db.prepare('UPDATE refresh_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
  const next = issueRefreshToken(row.doctor_id, row.family_id);
  return { doctorId: row.doctor_id, refreshToken: next.token };
});

export function revokeFamilyByToken(raw: string) {
  const row = db.prepare('SELECT family_id FROM refresh_tokens WHERE token_hash = ?').get(sha256(raw)) as
    | { family_id: string }
    | undefined;
  if (row) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(Date.now(), row.family_id);
  }
}

export function revokeAllForDoctor(doctorId: string) {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE doctor_id = ? AND revoked_at IS NULL').run(Date.now(), doctorId);
}
