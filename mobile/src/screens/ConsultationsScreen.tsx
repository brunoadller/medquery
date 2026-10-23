import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ApiError, request } from '../api';
import type { RootStackParamList } from '../navigation';
import { Button, ErrorBox, colors } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Consultations'>;

export interface ConsultationSummary {
  id: string;
  patientName: string;
  status: 'criada' | 'audio_enviado' | 'processando' | 'processada' | 'erro';
  createdAt: number;
  hasAudio: boolean;
}

export const STATUS_LABEL: Record<ConsultationSummary['status'], { text: string; color: string }> = {
  criada: { text: 'Aguardando gravação', color: colors.muted },
  audio_enviado: { text: 'Áudio enviado', color: colors.warn },
  processando: { text: 'Processando…', color: colors.warn },
  processada: { text: 'Relatório pronto', color: colors.ok },
  erro: { text: 'Erro — tentar de novo', color: colors.danger },
};

export const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ConsultationsScreen({ navigation }: Props) {
  const [items, setItems] = useState<ConsultationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Account')} hitSlop={10}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Conta</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await request<{ consultations: ConsultationSummary[] }>('/consultations');
      setItems(data.consultations);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível carregar as consultas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={<ErrorBox message={error} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={{ alignItems: 'center', marginTop: 80 }}>
              <Text style={{ fontSize: 44 }}>📂</Text>
              <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>
                Nenhuma consulta ainda.{'\n'}Toque em “Nova consulta” para criar a primeira pasta.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const s = STATUS_LABEL[item.status];
          return (
            <Pressable
              onPress={() => navigation.navigate('Consultation', { id: item.id })}
              style={({ pressed }) => ({
                backgroundColor: '#fff',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 30 }}>📁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{item.patientName}</Text>
                <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{formatDate(item.createdAt)}</Text>
                <Text style={{ color: s.color, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{s.text}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 20 }}>
        <Button title="+ Nova consulta" onPress={() => navigation.navigate('NewConsultation')} />
      </View>
    </View>
  );
}
