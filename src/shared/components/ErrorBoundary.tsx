import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../providers/theme/ThemeProvider';
import { reportBoundaryError } from '../observability/errorReporting';

type ErrorBoundaryProps = {
  label?: string;
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  retryCount: number;
};

class ErrorBoundaryBase extends React.Component<
  ErrorBoundaryProps & { theme: ReturnType<typeof useTheme>['theme'] },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    reportBoundaryError({
      errorName: error.name || 'Error',
      boundary: this.props.label ?? 'unknown',
      retryCount: this.state.retryCount,
    });
  }

  private retry = (): void => {
    this.setState((state) => ({ hasError: false, retryCount: state.retryCount + 1 }));
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
    }

    const { theme } = this.props;
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.text }]}>畫面暫時無法顯示</Text>
        <Text style={[styles.detail, { color: theme.textSub }]}>請重試，或稍後再開啟此畫面。</Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.retry}
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.retryText}>重試</Text>
        </Pressable>
      </View>
    );
  }
}

export default function ErrorBoundary(props: ErrorBoundaryProps) {
  const { theme } = useTheme();
  return <ErrorBoundaryBase {...props} theme={theme} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  detail: { fontSize: 14, marginBottom: 20, textAlign: 'center' },
  retryButton: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
