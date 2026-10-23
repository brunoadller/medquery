import * as LocalAuthentication from 'expo-local-authentication';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { request, setSession, setSessionExpiredHandler, clearSession } from './api';
import * as storage from './storage';
import type { Doctor } from './storage';

type Status = 'loading' | 'locked' | 'signedOut' | 'signedIn';

interface SessionResponse {
  doctor: Doctor;
  accessToken: string;
  refreshToken: string;
}

interface RegisterData {
  name: string;
  email: string;
  crm: string;
  crmUf: string;
  password: string;
}

interface AuthContextValue {
  status: Status;
  doctor: Doctor | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: RegisterData) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  unlock: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOCK_AFTER_MS = 60_000; // volta a pedir biometria se o app ficou 1 min em segundo plano

async function deviceLockAvailable() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const applySession = useCallback(async (s: SessionResponse) => {
    await setSession(s.accessToken, s.refreshToken);
    await storage.saveDoctor(s.doctor);
    setDoctor(s.doctor);
    setStatus('signedIn');
  }, []);

  // Sessão expirada/revogada no servidor -> volta para o login
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setDoctor(null);
      setStatus('signedOut');
    });
  }, []);

  // Abertura do app: se há sessão salva, exige biometria/PIN do aparelho antes de entrar
  useEffect(() => {
    (async () => {
      const [token, cached] = await Promise.all([storage.getRefreshToken(), storage.getDoctor()]);
      if (!token || !cached) {
        await clearSession();
        setStatus('signedOut');
        return;
      }
      setDoctor(cached);
      setStatus((await deviceLockAvailable()) ? 'locked' : 'signedIn');
    })();
  }, []);

  // Bloqueio automático ao voltar do segundo plano
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active' && backgroundedAt.current) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > LOCK_AFTER_MS && (await deviceLockAvailable())) {
          setStatus((s) => (s === 'signedIn' ? 'locked' : s));
        }
      }
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      doctor,
      async signIn(email, password) {
        const s = await request<SessionResponse>('/auth/login', { body: { email, password }, auth: false });
        await applySession(s);
      },
      async signUp(data) {
        const s = await request<SessionResponse>('/auth/register', { body: data, auth: false });
        await applySession(s);
      },
      async signOut() {
        const rt = await storage.getRefreshToken();
        if (rt) await request('/auth/logout', { body: { refreshToken: rt }, auth: false }).catch(() => undefined);
        await clearSession();
        setDoctor(null);
        setStatus('signedOut');
      },
      async changePassword(currentPassword, newPassword) {
        const s = await request<SessionResponse>('/auth/change-password', { body: { currentPassword, newPassword } });
        await applySession(s);
      },
      async unlock() {
        const r = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Desbloqueie o MedConsulta',
          cancelLabel: 'Cancelar',
        });
        if (r.success) setStatus('signedIn');
        return r.success;
      },
    }),
    [status, doctor, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
