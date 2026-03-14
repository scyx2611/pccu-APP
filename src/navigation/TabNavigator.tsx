import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import TodoScreen from '../screens/TodoScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// --- 新方案：完全自定義的懸浮毛玻璃 Tab Bar ---
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  // 動態計算底部安全距離，如果沒有 Home Indicator (如舊款 iPhone 或 Android)，給予預設 20 的間距
  const bottomPadding = insets.bottom > 0 ? insets.bottom : 20;

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: bottomPadding }]}>
      {/* 獨立的陰影容器，避免 overflow: hidden 切斷陰影 */}
      <View style={styles.shadowContainer}>
        {/* 核心：完美的毛玻璃膠囊 */}
        <BlurView intensity={90} tint="light" style={styles.glassCapsule}>
          
          {/* 玻璃邊緣的高光反光效果 */}
          <View style={styles.glassHighlight} />

          {/* 渲染所有 Tab 按鈕 */}
          <View style={styles.tabButtonsContainer}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === index;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              // 決定 Icon
              let iconName: any = 'home';
              if (route.name === '首頁') iconName = isFocused ? 'home' : 'home-outline';
              if (route.name === '課表') iconName = isFocused ? 'calendar' : 'calendar-outline';
              if (route.name === '代辦') iconName = isFocused ? 'checkmark-circle' : 'checkmark-circle-outline';
              if (route.name === '設定') iconName = isFocused ? 'options' : 'options-outline';

              return (
                <TouchableOpacity
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  testID={(options as any).tabBarTestID}
                  onPress={onPress}
                  style={styles.tabButton}
                  activeOpacity={0.6}
                >
                  <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
                    <Ionicons 
                      name={iconName} 
                      size={isFocused ? 26 : 24} 
                      color={isFocused ? '#0A7AFF' : '#8E8E93'} 
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      // 將我們手刻的元件交給 tabBar 屬性
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerTransparent: true,
        headerBackground: () => (
          <BlurView tint="light" intensity={85} style={StyleSheet.absoluteFill} />
        ),
        headerTitleStyle: {
          fontSize: 24,
          fontWeight: '800',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tab.Screen name="首頁" component={HomeScreen} />
      <Tab.Screen name="課表" component={ScheduleScreen} />
      <Tab.Screen name="代辦" component={TodoScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center', // 讓膠囊置中
    pointerEvents: 'box-none', // 確保點擊膠囊外部能穿透到後方內容
  },
  shadowContainer: {
    width: '85%', // 膠囊寬度
    maxWidth: 400,
    // 獨立計算的環境空間陰影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  glassCapsule: {
    height: 64,
    borderRadius: 32, // 完美半圓膠囊
    overflow: 'hidden', // 將 BlurView 限制在圓角內
    backgroundColor: 'rgba(255,255,255,0.45)', // 增強底色避免過於透明
  },
  glassHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)', // 高光反射邊緣
    pointerEvents: 'none',
  },
  tabButtonsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(10, 122, 255, 0.1)', // 選中時圖示背後有一層淡藍色光暈
  }
});
