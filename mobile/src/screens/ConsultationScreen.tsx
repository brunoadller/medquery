import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { ApiError, getValidAccessToken, request } from '../api';
import { useAuth } from '../auth';
import { API_URL } from '../config';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBox, Screen, SectionTitle, colors } from '../ui';
import { STATUS_LABEL, formatDate, type ConsultationSummary } from './ConsultationsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Consultation'>;

interface Report {
  paciente: string;
  problemas: string[];
  medicamentos: { nome: string; posologia: string }[];
  sugestoes: string[];
}
interface Detail extends ConsultationSummary {
  transcript: string | null;
  report: Report | null;
  error: string | null;
}

// Mono 16 kHz / 32 kbps: voz clara e ~240 KB por minuto (cabe ~100 min no limite de 25 MB da transcrição).
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 32000 };

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

type Phase = 'idle' | 'recording' | 'paused';
type Busy = null | 'enviando' | 'processando' | 'pdf';

export default function ConsultationScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { doctor } = useAuth();

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recState = useAudioRecorderState(recorder, 500);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [reRecord, setReRecord] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const load = useCallback(async () => {
    try {
      const { consultation } = await request<{ consultation: Detail }>(`/consultations/${id}`);
      setDetail(consultation);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível carregar a consulta.');
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => deactivateKeepAwake('consulta');
  }, [load]);

  useEffect(() => {
    if (detail) navigation.setOptions({ title: detail.patientName });
  }, [detail?.patientName, navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Impede sair da tela no meio da gravação (perderia o áudio)
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (phaseRef.current === 'idle') return;
        e.preventDefault();
        Alert.alert('Gravação em andamento', 'Encerre a gravação antes de sair desta tela.');
      }),
    [navigation],
  );

  // Se o app foi fechado durante o processamento, acompanha o andamento no servidor
  useEffect(() => {
    if (detail?.status !== 'processando' || busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [detail?.status, busy, load]);

  const runProcess = useCallback(async () => {
    setBusy('processando');
    setError(null);
    try {
      const { consultation } = await request<{ consultation: Detail }>(`/consultations/${id}/process`, {
        method: 'POST',
        timeoutMs: 6 * 60_000,
      });
      setDetail(consultation);
      setReRecord(false);
      if (consultation.status === 'erro') setError(consultation.error ?? 'Falha ao processar a consulta.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao processar a consulta.');
      void load();
    } finally {
      setBusy(null);
    }
  }, [id, load]);

  const sendAndProcess = useCallback(
    async (uri: string) => {
      setBusy('enviando');
      setError(null);
      setPendingUri(uri);
      try {
        const form = new FormData();
        form.append('audio', { uri, name: 'consulta.m4a', type: 'audio/mp4' } as unknown as Blob);
        await request(`/consultations/${id}/audio`, { form, timeoutMs: 10 * 60_000 });
        setPendingUri(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Falha ao enviar o áudio.');
        setBusy(null);
        return;
      }
      await runProcess();
    },
    [id, runProcess],
  );

  const start = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microfone', 'Permita o uso do microfone nas configurações do aparelho para gravar a consulta.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      void activateKeepAwakeAsync('consulta'); // tela acesa durante a consulta
    } catch {
      setError('Não foi possível iniciar a gravação.');
    }
  };

  const pause = () => {
    recorder.pause();
    setPhase('paused');
  };
  const resume = () => {
    recorder.record();
    setPhase('recording');
  };

  const stop = async () => {
    try {
      await recorder.stop();
    } catch {
      /* já parado */
    }
    const uri = recorder.uri;
    deactivateKeepAwake('consulta');
    setPhase('idle');
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    if (!uri) {
      setError('A gravação não gerou áudio. Tente novamente.');
      return;
    }
    await sendAndProcess(uri);
  };

  const confirmReRecord = () =>
    Alert.alert('Regravar consulta?', 'O áudio e o relatório atuais serão substituídos quando você encerrar a nova gravação.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Regravar', style: 'destructive', onPress: () => setReRecord(true) },
    ]);

  const sharePdf = async () => {
    setBusy('pdf');
    setError(null);
    try {
      const token = await getValidAccessToken();
      const dest = `${FileSystem.cacheDirectory}consulta-${id}.pdf`;
      const r = await FileSystem.downloadAsync(`${API_URL}/consultations/${id}/pdf`, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status !== 200) throw new Error('pdf');
      if (!(await Sharing.isAvailableAsync())) throw new Error('share');
      await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Relatório da consulta' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível gerar ou compartilhar o PDF.');
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Excluir consulta?', 'A pasta, o áudio e o relatório serão apagados definitivamente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await request(`/consultations/${id}`, { method: 'DELETE' });
            navigation.goBack();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Não foi possível excluir.');
          }
        },
      },
    ]);

  if (!detail) {
    return (
      <Screen>
        <ErrorBox message={error} />
        {!error ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
      </Screen>
    );
  }

  const status = STATUS_LABEL[detail.status];
  const processing = busy === 'enviando' || busy === 'processando' || detail.status === 'processando';
  const showRecorder = !detail.report || reRecord;

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{detail.patientName}</Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>{formatDate(detail.createdAt)}</Text>
        <Text style={{ color: status.color, fontWeight: '600', marginTop: 4 }}>{status.text}</Text>
      </Card>

      <ErrorBox message={error} />

      {processing ? (
        <Card>
          <ActivityIndicator />
          <Text style={{ textAlign: 'center', marginTop: 10, color: colors.text, fontWeight: '600' }}>
            {busy === 'enviando' ? 'Enviando o áudio…' : 'Transcrevendo e gerando o relatório…'}
          </Text>
          <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 4 }}>
            Pode levar alguns minutos. Mantenha o app aberto.
          </Text>
        </Card>
      ) : null}

      {!processing && showRecorder ? (
        <Card>
          <SectionTitle>Gravação da consulta</SectionTitle>
          <Text style={{ fontSize: 40, fontWeight: '700', textAlign: 'center', color: phase === 'recording' ? colors.danger : colors.text, marginVertical: 8 }}>
            {mmss(phase === 'idle' ? 0 : recState.durationMillis)}
          </Text>
          {phase === 'recording' ? <Text style={{ textAlign: 'center', color: colors.danger, marginBottom: 8 }}>● Gravando</Text> : null}
          {phase === 'paused' ? <Text style={{ textAlign: 'center', color: colors.warn, marginBottom: 8 }}>Pausado</Text> : null}

          {phase === 'idle' ? <Button title="● Iniciar gravação" onPress={start} /> : null}
          {phase === 'recording' ? <Button title="Pausar" variant="secondary" onPress={pause} /> : null}
          {phase === 'paused' ? <Button title="Continuar gravação" variant="secondary" onPress={resume} /> : null}
          {phase !== 'idle' ? <Button title="■ Encerrar e gerar relatório" variant="danger" onPress={stop} /> : null}

          {phase === 'idle' && pendingUri ? <Button title="Tentar enviar de novo" onPress={() => void sendAndProcess(pendingUri)} /> : null}
          {phase === 'idle' && !pendingUri && detail.hasAudio && detail.status !== 'processada' ? (
            <Button title="Processar áudio já enviado" variant="secondary" onPress={() => void runProcess()} />
          ) : null}
        </Card>
      ) : null}

      {detail.report && !processing ? (
        <>
          <Card>
            <SectionTitle>Paciente</SectionTitle>
            <Text style={{ color: colors.text }}>{detail.report.paciente}</Text>
          </Card>

          <Card>
            <SectionTitle>Lista de problemas</SectionTitle>
            {detail.report.problemas.length ? (
              detail.report.problemas.map((p, i) => (
                <Text key={i} style={{ color: colors.text, marginBottom: 4 }}>• {p}</Text>
              ))
            ) : (
              <Text style={{ color: colors.muted }}>Nenhum problema identificado.</Text>
            )}
          </Card>

          <Card>
            <SectionTitle>Medicamentos em uso</SectionTitle>
            {detail.report.medicamentos.length ? (
              detail.report.medicamentos.map((m, i) => (
                <Text key={i} style={{ color: colors.text, marginBottom: 4 }}>
                  • <Text style={{ fontWeight: '700' }}>{m.nome}</Text> — {m.posologia || 'não informada'}
                </Text>
              ))
            ) : (
              <Text style={{ color: colors.muted }}>Nenhum medicamento em uso foi citado.</Text>
            )}
          </Card>

          <Card>
            <SectionTitle>Sugestões e dicas</SectionTitle>
            {detail.report.sugestoes.length ? (
              detail.report.sugestoes.map((s, i) => (
                <Text key={i} style={{ color: colors.text, marginBottom: 4 }}>• {s}</Text>
              ))
            ) : (
              <Text style={{ color: colors.muted }}>Sem sugestões adicionais.</Text>
            )}
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
              Geradas por IA a partir do conteúdo da consulta. Revise antes de usar: a decisão clínica é sua.
            </Text>
          </Card>

          <Card>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Assinatura</Text>
            <Text style={{ color: colors.text, fontWeight: '700', marginTop: 2 }}>Dr(a). {doctor?.name}</Text>
            <Text style={{ color: colors.muted }}>CRM {doctor?.crm}/{doctor?.crmUf}</Text>
          </Card>

          <Button title="Gerar PDF e compartilhar" onPress={sharePdf} loading={busy === 'pdf'} />

          {detail.transcript ? (
            <Pressable onPress={() => setShowTranscript((v) => !v)} style={{ paddingVertical: 12 }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição completa'}
              </Text>
              {showTranscript ? <Text style={{ color: colors.text, marginTop: 8 }}>{detail.transcript}</Text> : null}
            </Pressable>
          ) : null}

          {!showRecorder ? <Button title="Regravar consulta" variant="secondary" onPress={confirmReRecord} /> : null}
        </>
      ) : null}

      {phase === 'idle' && !processing ? (
        <View style={{ marginTop: 20 }}>
          <Button title="Excluir consulta" variant="secondary" onPress={confirmDelete} />
        </View>
      ) : null}
    </Screen>
  );
}
