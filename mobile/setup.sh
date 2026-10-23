#!/usr/bin/env bash
# Cria o projeto Expo com as versões certas de cada biblioteca e copia o código do app para dentro dele.
# Uso (dentro da pasta medconsulta/):  bash mobile/setup.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$SRC/../app"

npx create-expo-app@latest "$DEST" --template blank-typescript --no-install
cd "$DEST"
npm install

# "expo install" escolhe a versão compatível com o SDK do Expo instalado
npx expo install \
  expo-audio expo-secure-store expo-local-authentication expo-file-system expo-sharing expo-keep-awake \
  @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

cp -R "$SRC/src" ./src
cp "$SRC/App.tsx" ./App.tsx
cp "$SRC/app.json" ./app.json
cp "$SRC/eas.json" ./eas.json
cp "$SRC/.env.example" ./.env.example
[ -f .env ] || cp .env.example .env

npx tsc --noEmit || echo "Atenção: há erros de tipo acima; veja o README."
echo
echo "Pronto! Entre em medconsulta/app e rode:  npx expo start"
