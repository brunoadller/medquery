import argon2 from 'argon2';

// Parâmetros recomendados pela OWASP para Argon2id (19 MiB, 2 iterações, 1 thread)
const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON_OPTS);

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Hash falso usado para gastar o mesmo tempo quando o e-mail não existe
// (evita descobrir quais e-mails estão cadastrados pelo tempo de resposta).
export const DUMMY_HASH_PROMISE = argon2.hash('senha-falsa-para-tempo-constante', ARGON_OPTS);

const COMMON = new Set([
  'password', 'senha', 'senha123', 'qwerty', 'abc123', 'admin', 'letmein', 'welcome',
  '123456', '12345678', '123456789', '1234567890', '111111', 'iloveyou', 'medico',
  'medicina', 'doutor', 'doutora', 'brasil', 'corinthians', 'flamengo', 'palmeiras',
  'saopaulo', 'mudar123', 'trocar123',
]);

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function strip(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function hasSequence(pw: string, size = 4): boolean {
  const p = strip(pw);
  for (const seq of SEQUENCES) {
    const rev = [...seq].reverse().join('');
    for (let i = 0; i <= p.length - size; i++) {
      const chunk = p.slice(i, i + size);
      if (seq.includes(chunk) || rev.includes(chunk)) return true;
    }
  }
  return false;
}

/** Retorna a lista de problemas encontrados (vazia = senha aceita). */
export function validatePassword(pw: string, ctx: { email?: string; name?: string } = {}): string[] {
  const errors: string[] = [];
  if (pw.length < 12) errors.push('Use pelo menos 12 caracteres.');
  if (pw.length > 128) errors.push('Use no máximo 128 caracteres.');
  if (!/[a-z]/.test(pw)) errors.push('Inclua uma letra minúscula.');
  if (!/[A-Z]/.test(pw)) errors.push('Inclua uma letra maiúscula.');
  if (!/[0-9]/.test(pw)) errors.push('Inclua um número.');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('Inclua um símbolo (ex.: ! @ # $ %).');
  if (/(.)\1{2,}/.test(pw)) errors.push('Evite repetir o mesmo caractere 3 vezes seguidas.');
  if (hasSequence(pw)) errors.push('Evite sequências como 1234, abcd ou qwer.');

  const plain = strip(pw).replace(/[^a-z0-9]/g, '');
  if ([...COMMON].some((c) => plain === c || (c.length >= 6 && plain.includes(c)))) {
    errors.push('Essa senha é muito comum. Escolha outra.');
  }

  const personal: string[] = [];
  if (ctx.email) personal.push(strip(ctx.email.split('@')[0] ?? ''));
  if (ctx.name) personal.push(...strip(ctx.name).split(/\s+/));
  if (personal.some((t) => t.length >= 4 && plain.includes(t.replace(/[^a-z0-9]/g, '')))) {
    errors.push('Não use seu nome ou e-mail dentro da senha.');
  }
  return errors;
}
