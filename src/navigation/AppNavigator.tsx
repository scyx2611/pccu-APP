import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import TabNavigator from './TabNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{
          headerShown: false, // iOS 登入頁通常不需要 header
          animation: 'slide_from_right',
        }}
        initialRouteName="Login" // 預設從登入頁開始
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        {/* 登入成功後跳轉進來這裡，呈現底部 Tab */}
        <Stack.Screen name="MainTabs" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
