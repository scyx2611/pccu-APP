import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ThemeMode, useTheme } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';

export default function AppearanceScreen() {
  const { mode, setMode, theme } = useTheme();

  const options: Array<{
    key: ThemeMode;
    title: string;
    subtitle: string;
  }> = [
    {
      key: 'system',
      title: '系統',
      subtitle: '依照 iPhone 目前的深淺色設定自動切換。',
    },
    {
      key: 'light',
      title: '淺色',
      subtitle: '固定使用淺色外觀顯示整個 App。',
    },
    {
      key: 'dark',
      title: '深色',
      subtitle: '固定使用深色外觀顯示整個 App。',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>外觀模式</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
        {options.map((option, index) => (
          <React.Fragment key={option.key}>
            <TouchableOpacity style={styles.optionRow} onPress={() => setMode(option.key)}>
              <View style={styles.optionTextWrap}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>{option.title}</Text>
                <Text style={[styles.optionSubtitle, { color: theme.textSub }]}>{option.subtitle}</Text>
              </View>
              <View style={styles.checkmarkWrap}>
                {mode === option.key ? (
                  <AppSymbol
                    name="checkmark"
                    size={18}
                    tintColor={theme.primary}
                    fallback={<Text style={{ color: theme.primary }}>✓</Text>}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
            {index < options.length - 1 ? (
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>說明</Text>
      <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          「系統」模式會跟隨 iOS 的外觀切換；若你手動選擇淺色或深色，App 會立即套用該主題。
        </Text>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 36,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insetGroup: {
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionTextWrap: {
    flex: 1,
    paddingRight: 16,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  checkmarkWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  noteCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
  },
  bottomSpacer: { height: 80 },
});
