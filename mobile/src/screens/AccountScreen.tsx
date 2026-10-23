import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { passwordIsOk } from '../passwordRules';
import { Button, Card, ErrorBox, PasswordChecklist, PasswordField, Screen, SectionTitle, colors } from '../ui';

export default function AccountScreen() {
  const { doctor, signOut, changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[] | undefined>();
  const [loading, setLoading] = useState(false);

  const valid = current.length > 0 && passwordIsOk(next) && next === confirm && next !== current;

  const submit = async () => {
    setError(null);
    setDetails(undefined);
    setLoading(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      Alert.alert('Senha alterada', 'As outras sessões foram encerradas por segurança.');
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setDetails(e.details);
      } else {
        setError('Não foi possível alterar a senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Dr(a). {doctor?.name}</Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>CRM {doctor?.crm}/{doctor?.crmUf}</Text>
        <Text style={{ color: colors.muted }}>{doctor?.email}</Text>
      </Card>

      <Card>
        <SectionTitle>Alterar senha</SectionTitle>
        <ErrorBox message={error} details={details} />
        <PasswordField label="Senha atual" value={current} onChangeText={setCurrent} textContentType="password" />
        <PasswordField label="Nova senha" value={next} onChangeText={setNext} textContentType="newPassword" />
        <PasswordChecklist password={next} />
        <PasswordField label="Confirmar nova senha" value={confirm} onChangeText={setConfirm} textContentType="newPassword" />
        {confirm.length > 0 && confirm !== next ? <Text style={{ color: colors.danger, marginBottom: 8 }}>As senhas não coincidem.</Text> : null}
        <Button title="Salvar nova senha" onPress={submit} loading={loading} disabled={!valid} />
      </Card>

      <Button title="Sair da conta" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
