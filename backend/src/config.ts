import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa ter 32+ caracteres'),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY é obrigatória'),
  TRANSCRIPTION_MODEL: z.string().default('gpt-4o-transcribe'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY é obrigatória'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-5-5'),
  DATA_DIR: z.string().default('./data'),
  TRUST_PROXY: z.coerce.number().default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuração inválida:\n', parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const config = parsed.data;
