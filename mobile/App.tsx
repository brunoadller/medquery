import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth';
import type { RootStackParamList } from './src/navigation';
import AccountScreen from './src/screens/AccountScreen';
import ConsultationScreen from './src/screens/ConsultationScreen';
import ConsultationsScreen from './src/screens/ConsultationsScreen';
import LockScreen from './src/screens/LockScreen';
import LoginScreen from './src/screens/LoginScreen';
import NewConsultationScreen from './src/screens/NewConsultationScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { colors } from './src/ui';

const Stack = createNativeStackNavigator<RootStackParamList>();

const header = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' as const },
};

function Routes() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (status === 'locked') return <LockScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={header}>
        {status === 'signedIn' ? (
          <>
            <Stack.Screen name="Consultations" component={ConsultationsScreen} options={{ title: 'Minhas consultas' }} />
            <Stack.Screen name="NewConsultation" component={NewConsultationScreen} options={{ title: 'Nova consulta' }} />
            <Stack.Screen name="Consultation" component={ConsultationScreen} options={{ title: 'Consulta' }} />
            <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Minha conta' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Cadastro do médico' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Routes />
    </AuthProvider>
  );
}
