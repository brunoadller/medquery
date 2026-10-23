// URL da API. Defina em mobile/.env:  EXPO_PUBLIC_API_URL=https://api.seudominio.com.br
// No emulador Android, 10.0.2.2 aponta para o localhost do seu computador.
// Em produção (Play Store) use SEMPRE https: o Android bloqueia http puro em apps de release.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000').replace(/\/$/, '');
