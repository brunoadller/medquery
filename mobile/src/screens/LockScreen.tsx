import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../auth';
import { Button, colors } from '../ui';

/** Tela exibida quando há sessão salva: pede biometria/PIN do aparelho para liberar o app. */
export default function LockScreen() {
  const { unlock, signOut, doctor } = useAuth();

  useEffect(() => {
    unlock();
  }, [unlock]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>MedConsulta</Text>
      <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 28 }}>
        {doctor ? `Dr(a). ${doctor.name}` : 'Sessão protegida'}
      </Text>
      <Button title="Desbloquear" onPress={() => void unlock()} />
      <Button title="Sair da conta" variant="secondary" onPress={() => void signOut()} />
    </View>
  );
}
