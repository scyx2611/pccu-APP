import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import ScheduleScreen from '../../../src/features/schedule/screens/ScheduleScreen';

export default function HomeScheduleScreen() {
  const iosHeaderMenu: NativeStackNavigationOptions['unstable_headerRightItems'] =
    Platform.OS === 'ios'
      ? () => [
          {
            type: 'menu',
            label: '更多選項',
            icon: { type: 'sfSymbol', name: 'ellipsis' },
            variant: 'plain',
            accessibilityLabel: '更多選項',
            accessibilityHint: '開啟測試功能選單',
            menu: {
              title: '測試功能',
              items: [
                {
                  type: 'action',
                  label: '功能 1',
                  onPress: () => Alert.alert('測試功能', '你選了功能 1'),
                },
                {
                  type: 'action',
                  label: '功能 2',
                  onPress: () => Alert.alert('測試功能', '你選了功能 2'),
                },
                {
                  type: 'action',
                  label: '功能 3',
                  onPress: () => Alert.alert('測試功能', '你選了功能 3'),
                },
              ],
            },
          },
        ]
      : undefined;

  const showAndroidMenu = () => {
    Alert.alert('測試功能', '選擇一個選項', [
      { text: '功能 1', onPress: () => Alert.alert('測試功能', '你選了功能 1') },
      { text: '功能 2', onPress: () => Alert.alert('測試功能', '你選了功能 2') },
      { text: '功能 3', onPress: () => Alert.alert('測試功能', '你選了功能 3') },
      { text: '取消', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '完整課表',
          unstable_headerRightItems: iosHeaderMenu,
          headerRight:
            Platform.OS !== 'ios'
              ? () => (
                  <Pressable
                    onPress={showAndroidMenu}
                    style={styles.menuButton}
                    accessibilityLabel="更多選項"
                  >
                    <Text style={styles.menuButtonText}>⋯</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
      <ScheduleScreen />
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  menuButtonText: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '600',
  },
});
