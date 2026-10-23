import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db, type DoctorRow } from '../db.js';
import { HttpError, getDoctor, requireAuth, wrap } from '../http.js';
import { DUMMY_HASH_PROMISE, hashPassword, validatePassword, verifyPassword } from '../password.js';
import {
  issueRefreshToken,
  revokeAllForDoctor,
  revokeFamilyByToken,
  rotateRefreshToken,
  signAccessToken,
} from '../tokens.js';

export const authRouter = Router();

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(1).max(128);

const registerSchema = z.object({
  name: z.string().trim().min(5, 'Informe o nome completo').max(120),
  email,
  crm: z.string().trim().regex(/^\d{4,8}$/, 'CRM deve ter de 4 a 8 números'),
  crmUf: z.enum(UFS),
  password,
});

const loginSchema = z.object({ email, password });
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
const changeSchema = z.object({ currentPassword: password, newPassword: password });

const publicDoctor = (d: DoctorRow) => ({ id: d.id, name: d.name, email: d.email, crm: d.crm, crmUf: d.crm_uf });

function newSession(d: DoctorRow) {
  return {
    doctor: publicDoctor(d),
    accessToken: signAccessToken(d.id),
    refreshToken: issueRefreshToken(d.id).token,
  };
}

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const problems = validatePassword(body.password, { email: body.email, name: body.name });
    if (problems.length) throw new HttpError(422, 'Senha fraca.', { error: 'senha_fraca', details: problems });

    if (db.prepare('SELECT 1 FROM doctors WHERE email = ?').get(body.email)) {
      throw new HttpError(409, 'Este e-mail já está cadastrado.');
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO doctors (id, name, email, crm, crm_uf, password_hash, created_at, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, body.name, body.email, body.crm, body.crmUf, await hashPassword(body.password), now, now);

    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id) as DoctorRow;
    res.status(201).json(newSession(doctor));
  }),
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const GENERIC = new HttpError(401, 'E-mail ou senha incorretos.');

    const doctor = db.prepare('SELECT * FROM doctors WHERE email = ?').get(body.email) as DoctorRow | undefined;

    if (!doctor) {
      await verifyPassword(await DUMMY_HASH_PROMISE, body.password); // tempo constante
      throw GENERIC;
    }
    if (doctor.locked_until > Date.now()) {
      throw new HttpError(429, 'Muitas tentativas. Tente novamente em alguns minutos.');
    }

    const ok = await verifyPassword(doctor.password_hash, body.password);
    if (!ok) {
      const attempts = doctor.failed_attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        db.prepare('UPDATE doctors SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(Date.now() + LOCK_MS, doctor.id);
      } else {
        db.prepare('UPDATE doctors SET failed_attempts = ? WHERE id = ?').run(attempts, doctor.id);
      }
      throw GENERIC;
    }

    db.prepare('UPDATE doctors SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(doctor.id);
    res.json(newSession(doctor));
  }),
);

authRouter.post(
  '/refresh',
  wrap((req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const rotated = rotateRefreshToken(refreshToken);
    if (!rotated) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');

    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(rotated.doctorId) as DoctorRow | undefined;
    if (!doctor) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');

    res.json({ accessToken: signAccessToken(doctor.id), refreshToken: rotated.refreshToken });
  }),
);

authRouter.post(
  '/logout',
  wrap((req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) revokeFamilyByToken(parsed.data.refreshToken);
    res.status(204).end();
  }),
);

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ doctor: publicDoctor(getDoctor(res)) });
});

authRouter.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const doctor = getDoctor(res);
    const body = changeSchema.parse(req.body);

    if (!(await verifyPassword(doctor.password_hash, body.currentPassword))) {
      throw new HttpError(401, 'Senha atual incorreta.');
    }
    if (body.newPassword === body.currentPassword) {
      throw new HttpError(422, 'A nova senha deve ser diferente da atual.', {
        error: 'senha_fraca',
        details: ['A nova senha deve ser diferente da atual.'],
      });
    }
    const problems = validatePassword(body.newPassword, { email: doctor.email, name: doctor.name });
    if (problems.length) throw new HttpError(422, 'Senha fraca.', { error: 'senha_fraca', details: problems });

    db.prepare('UPDATE doctors SET password_hash = ?, password_changed_at = ?, failed_attempts = 0 WHERE id = ?').run(
      await hashPassword(body.newPassword),
      Date.now(),
      doctor.id,
    );
    // Encerra todas as outras sessões e entrega uma sessão nova a este aparelho.
    revokeAllForDoctor(doctor.id);
    const fresh = db.prepare('SELECT * FROM doctors WHERE id = ?').get(doctor.id) as DoctorRow;
    res.json(newSession(fresh));
  }),
);
