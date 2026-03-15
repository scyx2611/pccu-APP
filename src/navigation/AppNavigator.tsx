import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import GradeWebViewScreen from '../screens/GradeWebViewScreen';
import TabNavigator from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isDark, theme } = useTheme();
  
  const NavigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
    },
  };

  return (
    <NavigationContainer theme={NavigationTheme}>
      <Stack.Navigator 
        id={undefined}
        screenOptions={{
          headerShown: false, 
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.bg }
        }}
        initialRouteName="Login"
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        {/* 開啟成績單同步用的 WebView 畫面 */}
        <Stack.Screen name="GradeWebView" component={GradeWebViewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
