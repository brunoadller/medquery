import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { db } from './db.js';
import { errorHandler } from './http.js';
import { authRouter } from './routes/auth.js';
import { consultationsRouter } from './routes/consultations.js';

const app = express();
app.set('trust proxy', config.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors()); // app nativo não usa cookies; a autenticação vai no header Authorization
app.use(express.json({ limit: '50kb' }));

app.use(rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Limite mais duro nas rotas que testam credenciais
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use(['/auth/login', '/auth/register', '/auth/refresh', '/auth/change-password'], authLimiter);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRouter);
app.use('/consultations', consultationsRouter);

app.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
app.use(errorHandler);

// Consultas que ficaram "processando" por queda do servidor voltam para "erro".
db.prepare("UPDATE consultations SET status = 'erro', error = 'Processamento interrompido. Tente novamente.' WHERE status = 'processando'").run();

app.listen(config.PORT, () => console.log(`API MedConsulta em http://localhost:${config.PORT}`));
