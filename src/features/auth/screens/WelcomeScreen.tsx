import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';

type WelcomeScreenProps = {
  onStart: () => void;
};

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={[theme.ambient1 || theme.bg, theme.ambient2 || theme.bg, theme.bg]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.badge, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
          <AppSymbol
            name="sparkles"
            size={18}
            tintColor={theme.primary}
            fallback={<Text style={{ color: theme.primary }}>+</Text>}
          />
          <Text style={[styles.badgeText, { color: theme.primary }]}>PCCU 校園資訊助手</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          把課表、成績和校園資訊收進同一個 app。
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSub }]}>
          登入 PCCU 帳號後，會自動整理課表與成績，首頁也能直接看到下節課和成績摘要。
        </Text>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
              <AppSymbol name="clock.fill" size={18} tintColor={theme.primary} fallback="表" />
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>智慧課表同步</Text>
              <Text style={[styles.featureText, { color: theme.textSub }]}>
                保留上次快取，更新完成後自動刷新。
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(255, 149, 0, 0.14)' }]}>
              <AppSymbol
                name="graduationcap.fill"
                size={18}
                tintColor={theme.warning}
                fallback="績"
              />
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>成績單快速整理</Text>
              <Text style={[styles.featureText, { color: theme.textSub }]}>
                歷年學期資料直接展開，不用再翻頁查看。
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(52, 199, 89, 0.14)' }]}>
              <AppSymbol name="house.fill" size={18} tintColor={theme.success} fallback="首" />
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>首頁快速總覽</Text>
              <Text style={[styles.featureText, { color: theme.textSub }]}>
                下節課、成績摘要和常用資訊都能一眼看到。
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={onStart}
        >
          <Text style={styles.primaryButtonText}>開始登入</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  heroCard: {
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 18,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  featureList: {
    marginTop: 24,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureCopy: {
    flex: 1,
    paddingTop: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 28,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
