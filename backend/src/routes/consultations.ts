import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { generateReport, transcribe, reportSchema } from '../ai.js';
import { config } from '../config.js';
import { db, type ConsultationRow } from '../db.js';
import { HttpError, getDoctor, requireAuth, wrap } from '../http.js';
import { buildPdf } from '../pdf.js';

export const consultationsRouter = Router();
consultationsRouter.use(requireAuth);

const AUDIO_DIR = path.resolve(config.DATA_DIR, 'audio');
const ALLOWED_EXT = new Set(['.m4a', '.mp4', '.aac', '.wav', '.mp3', '.webm', '.ogg', '.3gp']);

const upload = multer({
  storage: multer.diskStorage({
    destination: AUDIO_DIR,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // limite da API de transcrição
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase()));
  },
});

const idSchema = z.string().uuid();
const createSchema = z.object({ patientName: z.string().trim().min(2, 'Informe o nome do paciente').max(120) });

function load(id: string, doctorId: string): ConsultationRow {
  const row = db
    .prepare('SELECT * FROM consultations WHERE id = ? AND doctor_id = ?')
    .get(idSchema.parse(id), doctorId) as ConsultationRow | undefined;
  if (!row) throw new HttpError(404, 'Consulta não encontrada.'); // inclusive para consultas de outro médico
  return row;
}

function toApi(c: ConsultationRow, withDetails = false) {
  const base = {
    id: c.id,
    patientName: c.patient_name,
    status: c.status,
    createdAt: c.created_at,
    hasAudio: !!c.audio_path,
    error: c.error,
  };
  if (!withDetails) return base;
  return {
    ...base,
    transcript: c.transcript,
    report: c.report_json ? reportSchema.parse(JSON.parse(c.report_json)) : null,
  };
}

const touch = (id: string, fields: Partial<Pick<ConsultationRow, 'status' | 'audio_path' | 'transcript' | 'report_json' | 'error'>>) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE consultations SET ${sets ? sets + ', ' : ''}updated_at = @now WHERE id = @id`).run({ ...fields, now: Date.now(), id });
};

const removeFile = (p: string | null) => (p ? fs.rm(p, { force: true }).catch(() => undefined) : Promise.resolve());

consultationsRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM consultations WHERE doctor_id = ? ORDER BY created_at DESC LIMIT 500')
    .all(getDoctor(res).id) as ConsultationRow[];
  res.json({ consultations: rows.map((r) => toApi(r)) });
});

consultationsRouter.post('/', (req, res) => {
  const { patientName } = createSchema.parse(req.body);
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO consultations (id, doctor_id, patient_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, getDoctor(res).id, patientName, now, now);
  res.status(201).json({ consultation: toApi(load(id, getDoctor(res)), true) });
});

consultationsRouter.get('/:id', (req, res) => {
  res.json({ consultation: toApi(load(req.params.id, getDoctor(res).id), true) });
});

consultationsRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const c = load(req.params.id, getDoctor(res).id);
    await removeFile(c.audio_path);
    db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id);
    res.status(204).end();
  }),
);

consultationsRouter.post(
  '/:id/audio',
  (req, res, next) => {
    // Valida a posse da consulta ANTES de gravar o arquivo no disco.
    try {
      load(req.params.id, getDoctor(res).id);
      next();
    } catch (e) {
      next(e);
    }
  },
  upload.single('audio'),
  wrap(async (req, res) => {
    const doctorId = getDoctor(res).id;
    const c = load(req.params.id, doctorId);
    if (!req.file) throw new HttpError(400, 'Envie um arquivo de áudio válido (.m4a, .mp3, .wav...).');
    if (c.status === 'processando') {
      await removeFile(req.file.path);
      throw new HttpError(409, 'A consulta está sendo processada.');
    }
    await removeFile(c.audio_path); // substitui gravação anterior
    touch(c.id, { audio_path: req.file.path, status: 'audio_enviado', transcript: null, report_json: null, error: null });
    res.json({ consultation: toApi(load(c.id, doctorId), true) });
  }),
);

consultationsRouter.post(
  '/:id/process',
  wrap(async (req, res) => {
    const doctorId = getDoctor(res).id;
    const c = load(req.params.id, doctorId);
    if (!c.audio_path) throw new HttpError(400, 'Grave ou envie o áudio da consulta primeiro.');
    if (c.status === 'processando') throw new HttpError(409, 'A consulta já está sendo processada.');

    touch(c.id, { status: 'processando', error: null });
    try {
      const transcript = c.transcript ?? (await transcribe(c.audio_path));
      touch(c.id, { transcript });
      const report = await generateReport(c.patient_name, transcript);
      touch(c.id, { report_json: JSON.stringify(report), status: 'processada' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao processar a consulta.';
      touch(c.id, { status: 'erro', error: msg });
    }
    res.json({ consultation: toApi(load(c.id, doctorId), true) });
  }),
);

consultationsRouter.get(
  '/:id/pdf',
  wrap(async (req, res) => {
    const doctor = getDoctor(res);
    const c = load(req.params.id, doctor.id);
    if (!c.report_json) throw new HttpError(409, 'O relatório ainda não foi gerado.');

    const pdf = await buildPdf({
      report: reportSchema.parse(JSON.parse(c.report_json)),
      doctorName: doctor.name,
      crm: doctor.crm,
      crmUf: doctor.crm_uf,
      consultationDate: c.created_at,
    });
    const slug = c.patient_name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase()
      .replace(/^-|-$/g, '');
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="consulta-${slug || 'paciente'}.pdf"`,
        'Cache-Control': 'no-store',
      })
      .send(pdf);
  }),
);
