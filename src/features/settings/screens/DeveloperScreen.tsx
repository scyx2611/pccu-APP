import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getDeveloperDebugEnabled, setDeveloperDebugEnabled } from '../storage/developerSettings';

export default function DeveloperScreen() {
  const { theme } = useTheme();
  const [developerDebugEnabled, setDeveloperDebugEnabledState] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const debugEnabled = await getDeveloperDebugEnabled();
      if (!active) return;
      setDeveloperDebugEnabledState(debugEnabled);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleDeveloperDebugToggle = async (value: boolean) => {
    setDeveloperDebugEnabledState(value);
    await setDeveloperDebugEnabled(value);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>開發者選項</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>開發者模式</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              顯示課表與成績同步預覽，方便測試同步流程與畫面狀態。
            </Text>
          </View>
          <Switch
            value={developerDebugEnabled}
            onValueChange={(value) => void handleDeveloperDebugToggle(value)}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>說明</Text>
      <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          開啟後會顯示給測試用途的同步預覽資訊。一般使用情況下可維持關閉。
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  textWrap: {
    flex: 1,
    paddingRight: 16,
  },
  cellTitle: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 4,
  },
  cellSubtitle: {
    fontSize: 13,
    lineHeight: 18,
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
