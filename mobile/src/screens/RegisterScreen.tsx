import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { passwordIsOk } from '../passwordRules';
import { Button, ErrorBox, Field, PasswordChecklist, PasswordField, Screen, colors } from '../ui';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [crm, setCrm] = useState('');
  const [crmUf, setCrmUf] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[] | undefined>();
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const valid =
    name.trim().length >= 5 && /\S+@\S+\.\S+/.test(email) && /^\d{4,8}$/.test(crm) && crmUf.length === 2 &&
    passwordIsOk(password) && password === confirm && agree;

  const submit = async () => {
    setError(null);
    setDetails(undefined);
    setLoading(true);
    try {
      await signUp({ name: name.trim(), email: email.trim().toLowerCase(), crm, crmUf, password });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setDetails(e.details);
      } else {
        setError('Não foi possível concluir o cadastro.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ErrorBox message={error} details={details} />
      <Field label="Nome completo" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 2 }}>
          <Field label="CRM" value={crm} onChangeText={(t) => setCrm(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={8} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="UF" value={crmUf} onChangeText={(t) => setCrmUf(t.toUpperCase().replace(/[^A-Z]/g, ''))} autoCapitalize="characters" maxLength={2} />
        </View>
      </View>

      <PasswordField label="Senha" value={password} onChangeText={setPassword} textContentType="newPassword" />
      <PasswordChecklist password={password} />
      <PasswordField label="Confirmar senha" value={confirm} onChangeText={setConfirm} textContentType="newPassword" />
      {mismatch ? <Text style={{ color: colors.danger, marginTop: -8, marginBottom: 12 }}>As senhas não coincidem.</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 }}>
        <Switch value={agree} onValueChange={setAgree} />
        <Text style={{ flex: 1, color: colors.text }}>
          Sou médico(a) habilitado(a) e usarei o app apenas com o consentimento dos pacientes, conforme a LGPD.
        </Text>
      </View>

      <Button title="Criar conta" onPress={submit} loading={loading} disabled={!valid} />
    </Screen>
  );
}
