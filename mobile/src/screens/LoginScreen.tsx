import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import type { RootStackParamList } from '../navigation';
import { Button, ErrorBox, Field, PasswordField, Screen, colors } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: 40, marginBottom: 28 }}>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>MedConsulta</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>Registro inteligente de consultas</Text>
      </View>

      <ErrorBox message={error} />
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="voce@clinica.com.br"
      />
      <PasswordField label="Senha" value={password} onChangeText={setPassword} />

      <Button title="Entrar" onPress={submit} loading={loading} disabled={!email || !password} />

      <Pressable onPress={() => navigation.navigate('Register')} style={{ alignItems: 'center', marginTop: 18 }}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Sou médico e quero me cadastrar</Text>
      </Pressable>
    </Screen>
  );
}
