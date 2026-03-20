import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../providers/theme/ThemeProvider';

export default function DebugStamp({ label }: { label: string }) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={[styles.text, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 9999,
  },
  text: {
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
});
