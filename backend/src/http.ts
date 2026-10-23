import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { db, type DoctorRow } from './db.js';
import { verifyAccessToken } from './tokens.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Express 4 não captura erros de funções async; este wrapper resolve isso. */
export const wrap =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

/** Exige "Authorization: Bearer <accessToken>" e guarda o médico em res.locals.doctor. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) return next(new HttpError(401, 'Sessão inválida ou expirada.'));

  const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(payload.sub) as DoctorRow | undefined;
  // Tokens emitidos antes da última troca de senha deixam de valer.
  if (!doctor || payload.iat < Math.floor(doctor.password_changed_at / 1000)) {
    return next(new HttpError(401, 'Sessão inválida ou expirada.'));
  }
  res.locals.doctor = doctor;
  next();
};

export const getDoctor = (res: Response) => res.locals.doctor as DoctorRow;

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'dados_invalidos',
      message: 'Confira os dados informados.',
      details: err.issues.map((i) => `${i.path.join('.') || 'campo'}: ${i.message}`),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  // Nunca devolva stack trace nem detalhes internos ao cliente (dados de saúde).
  console.error('Erro interno:', err instanceof Error ? err.message : 'desconhecido');
  return res.status(500).json({ message: 'Erro interno. Tente novamente.' });
}
