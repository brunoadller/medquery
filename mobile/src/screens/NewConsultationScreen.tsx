import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { ApiError, request } from '../api';
import type { RootStackParamList } from '../navigation';
import { Button, ErrorBox, Field, Screen, colors } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConsultation'>;

export default function NewConsultationScreen({ navigation }: Props) {
  const [patientName, setPatientName] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setLoading(true);
    try {
      const { consultation } = await request<{ consultation: { id: string } }>('/consultations', {
        body: { patientName: patientName.trim() },
      });
      navigation.replace('Consultation', { id: consultation.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível criar a consulta.');
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ErrorBox message={error} />
      <Field
        label="Nome do paciente"
        value={patientName}
        onChangeText={setPatientName}
        autoCapitalize="words"
        placeholder="Ex.: Bruno da Silva"
        autoFocus
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 }}>
        <Switch value={consent} onValueChange={setConsent} />
        <Text style={{ flex: 1, color: colors.text }}>O paciente foi informado e autorizou a gravação e o uso de IA na consulta.</Text>
      </View>
      <Button title="Criar pasta da consulta" onPress={create} loading={loading} disabled={patientName.trim().length < 2 || !consent} />
    </Screen>
  );
}
