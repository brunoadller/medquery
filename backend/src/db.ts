import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.join(config.DATA_DIR, 'audio'), { recursive: true });

export const db = new Database(path.join(config.DATA_DIR, 'medconsulta.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  crm TEXT NOT NULL,
  crm_uf TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_doctor ON refresh_tokens(doctor_id);

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'criada', -- criada | audio_enviado | processando | processada | erro
  audio_path TEXT,
  transcript TEXT,
  report_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_doctor ON consultations(doctor_id, created_at DESC);
`);

export interface DoctorRow {
  id: string;
  name: string;
  email: string;
  crm: string;
  crm_uf: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: number;
  created_at: number;
  password_changed_at: number;
}

export interface ConsultationRow {
  id: string;
  doctor_id: string;
  patient_name: string;
  status: 'criada' | 'audio_enviado' | 'processando' | 'processada' | 'erro';
  audio_path: string | null;
  transcript: string | null;
  report_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}
