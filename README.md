# MedConsulta

App para médicos gravarem consultas, transcreverem o áudio e gerarem um relatório em PDF com ajuda de IA.

```
medconsulta/
├── backend/   API Node + Express + TypeScript (guarda as chaves das IAs e os dados)
└── mobile/    App React Native (Expo) + setup.sh que monta o projeto
```

## Fluxo

1. Médico se cadastra (nome, e-mail, CRM/UF, senha forte) e faz login.
2. **Nova consulta** cria uma "pasta" com o nome do paciente (ex.: Bruno da Silva).
3. Dentro da pasta, grava a consulta inteira (pausar/continuar disponível).
4. Ao encerrar: o áudio é enviado → transcrito (OpenAI) → interpretado pelo Claude.
5. Relatório gerado, nesta ordem: **paciente → lista de problemas → medicamentos em uso → sugestões e dicas → assinatura do médico** (nome + CRM). Exportável em PDF.

## Segurança implementada

| Camada | O que foi feito |
|---|---|
| Sessão | JWT de acesso de 15 min (HS256, algoritmo fixo, `iss`/`aud`) + **refresh token opaco com rotação** e detecção de reuso (token roubado revoga a família inteira) |
| Senhas | **Argon2id** (parâmetros OWASP); mínimo 12 caracteres, maiúscula, minúscula, número, símbolo; bloqueia sequências, repetições, senhas comuns e nome/e-mail dentro da senha. Mesma regra na troca de senha |
| Troca de senha | Exige senha atual, encerra todas as outras sessões e invalida tokens antigos |
| Força bruta | Bloqueio da conta por 15 min após 5 erros + rate limit por IP + resposta em tempo constante (não revela se o e-mail existe) |
| App | Refresh token no **SecureStore** (Keystore/Keychain); access token só em memória; **biometria/PIN** ao abrir e após 1 min em segundo plano |
| Dados | Toda consulta é filtrada por `doctor_id` (um médico nunca acessa dados de outro); erros internos não vazam detalhes; chaves das IAs só no servidor |

## 1) Rodar o backend

Requer Node 20+.

```bash
cd backend
cp .env.example .env     # preencha JWT_ACCESS_SECRET, OPENAI_API_KEY e ANTHROPIC_API_KEY
npm install
npm run typecheck        # confere os tipos
npm run dev              # http://localhost:3000
```

## 2) Rodar o app

Requer Node 20+ e um celular com **Expo Go** ou um emulador Android.

```bash
bash mobile/setup.sh     # cria medconsulta/app com as versões certas e copia o código
cd app
npx expo start
```

O gravador funciona melhor em um build de desenvolvimento (`npx expo run:android`) do que no Expo Go.
No arquivo `app/.env`, aponte `EXPO_PUBLIC_API_URL` para a API (`10.0.2.2` = seu PC no emulador Android; no celular físico use o IP do PC na rede).

## 3) Publicar na Play Store

1. Suba o backend em um servidor com **HTTPS** (Render, Railway, Fly.io, VPS...). Defina as variáveis do `.env` lá e `TRUST_PROXY=1`. Use disco persistente para `DATA_DIR` (ou migre para Postgres + armazenamento criptografado, veja abaixo).
2. Em `app/app.json` troque `android.package` (ex.: `br.com.suaclinica.medconsulta`) e, em `app/eas.json`, a URL da API.
3. Build: `npm i -g eas-cli && eas login && eas build -p android --profile production` (gera o `.aab`).
4. Crie a conta no Google Play Console, cadastre o app e envie o `.aab` (`eas submit -p android`).
5. Exigências do Google para app de saúde: **política de privacidade** publicada, formulário **Segurança dos dados** (áudio e dados de saúde são coletados e enviados a servidores), declaração de app de saúde e, em contas pessoais novas, teste fechado com ~12 testadores por 14 dias antes de produção.

## O que NÃO está pronto (leia antes de usar com pacientes reais)

- **Recuperação de senha por e-mail** ("esqueci minha senha"): precisa de um provedor de e-mail (Resend, SES...).
- **Assinatura**: o PDF traz o nome e o CRM do médico, mas **não é assinatura digital ICP-Brasil**. Para documentos com validade legal (receitas, atestados) é preciso certificado digital.
- **Revisão do relatório**: hoje o médico lê e compartilha o PDF; falta uma tela para editar o texto antes de gerar o PDF. Vale incluir, já que a IA pode errar.
- **Banco e áudios**: SQLite e arquivos em disco servem para começar. Em produção use Postgres, armazenamento com criptografia em repouso, backups e política de retenção/exclusão dos áudios.
- **LGPD**: áudio de consulta e relatório são **dados sensíveis de saúde**. Você precisa de base legal/consentimento do paciente, contrato (DPA) com OpenAI e Anthropic, e avaliar a transferência internacional de dados. O app já exige a confirmação de consentimento ao criar a consulta, mas isso não substitui o trabalho jurídico. Consulte um advogado/DPO.
- **Gravação em segundo plano**: o app mantém a tela acesa durante a consulta; se o Android encerrar o app em segundo plano, a gravação pode parar.
- **Testes automatizados** e monitoramento.
- Foi escrito sem poder instalar as dependências nem compilar no ambiente de criação; rode `npm run typecheck` (backend) e o `tsc` que o `setup.sh` executa (app) e corrija pequenos ajustes de versão se aparecerem.

## Ajustes rápidos

- Modelo da IA: `CLAUDE_MODEL` no `.env`. Modelo de transcrição: `TRANSCRIPTION_MODEL` (`gpt-4o-transcribe` ou `whisper-1`).
- Tom e regras do relatório: constante `SYSTEM` em `backend/src/ai.ts`.
- Layout do PDF: `backend/src/pdf.ts`.
