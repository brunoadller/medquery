import * as SecureStore from 'expo-secure-store';

// SecureStore usa o Keystore (Android) / Keychain (iOS): armazenamento criptografado pelo sistema.
const REFRESH_KEY = 'mc_refresh_token';
const DOCTOR_KEY = 'mc_doctor';

export interface Doctor {
  id: string;
  name: string;
  email: string;
  crm: string;
  crmUf: string;
}

export const saveRefreshToken = (t: string) => SecureStore.setItemAsync(REFRESH_KEY, t);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

export const saveDoctor = (d: Doctor) => SecureStore.setItemAsync(DOCTOR_KEY, JSON.stringify(d));
export async function getDoctor(): Promise<Doctor | null> {
  const raw = await SecureStore.getItemAsync(DOCTOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Doctor;
  } catch {
    return null;
  }
}

export async function clearAll() {
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(DOCTOR_KEY);
}
