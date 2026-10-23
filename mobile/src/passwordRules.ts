// Espelho (simplificado) das regras do servidor, só para dar feedback instantâneo.
// A validação que vale é a do servidor, que também barra senhas comuns, sequências e dados pessoais.
export interface Check {
  label: string;
  ok: boolean;
}

export function passwordChecks(pw: string): Check[] {
  return [
    { label: 'Pelo menos 12 caracteres', ok: pw.length >= 12 },
    { label: 'Uma letra minúscula', ok: /[a-z]/.test(pw) },
    { label: 'Uma letra maiúscula', ok: /[A-Z]/.test(pw) },
    { label: 'Um número', ok: /[0-9]/.test(pw) },
    { label: 'Um símbolo (! @ # $ %...)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export const passwordIsOk = (pw: string) => passwordChecks(pw).every((c) => c.ok);
