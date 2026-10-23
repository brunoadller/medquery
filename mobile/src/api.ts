import { API_URL } from './config';
import * as storage from './storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}

const OFFLINE = 'Sem conexão com o servidor. Verifique a internet e tente novamente.';

// O access token (curto) fica só na memória; o refresh token fica no SecureStore.
let accessToken: string | null = null;
let onExpired: (() => void) | null = null;
let refreshing: Promise<'ok' | 'denied' | 'offline'> | null = null;

export const setSessionExpiredHandler = (fn: () => void) => {
  onExpired = fn;
};

export async function setSession(access: string, refresh: string) {
  accessToken = access;
  await storage.saveRefreshToken(refresh);
}

export async function clearSession() {
  accessToken = null;
  await storage.clearAll();
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function doRefresh(): Promise<'ok' | 'denied' | 'offline'> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return 'denied';
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/auth/refresh`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
      20_000,
    );
    if (res.status === 401) {
      await clearSession();
      return 'denied';
    }
    if (!res.ok) return 'offline';
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await setSession(data.accessToken, data.refreshToken);
    return 'ok';
  } catch {
    return 'offline';
  }
}

// Várias chamadas simultâneas compartilham UMA renovação (o refresh token só vale uma vez).
const refreshSession = () => {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
};

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const auth = opts.auth ?? true;

  const send = async () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await fetchWithTimeout(
        `${API_URL}${path}`,
        {
          method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
          headers,
          body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        },
        opts.timeoutMs ?? 30_000,
      );
    } catch {
      throw new ApiError(0, OFFLINE);
    }
  };

  const handleRefresh = async () => {
    const r = await refreshSession();
    if (r === 'denied') {
      onExpired?.();
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }
    if (r === 'offline') throw new ApiError(0, OFFLINE);
  };

  if (auth && !accessToken) await handleRefresh();

  let res = await send();
  if (res.status === 401 && auth) {
    await handleRefresh();
    res = await send();
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { message?: string; details?: string[] } | null;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Erro inesperado.', data?.details);
  return data as T;
}

/** Garante um access token válido (renova se preciso) para downloads feitos fora do fetch. */
export async function getValidAccessToken(): Promise<string> {
  await request('/auth/me');
  return accessToken as string;
}
