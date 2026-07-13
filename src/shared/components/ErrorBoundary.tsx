import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../providers/theme/ThemeProvider';

type ErrorBoundaryProps = {
  label?: string;
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  info: React.ErrorInfo | null;
};

class ErrorBoundaryBase extends React.Component<
  ErrorBoundaryProps & { theme: any },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, info: null };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { theme, label } = this.props;
    const title = label ? `${label} 發生錯誤` : '畫面發生錯誤';
    const detail = this.state.error?.message || '未知錯誤';
    const stack = this.state.info?.componentStack?.trim();

    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.detail, { color: theme.textSub }]}>{detail}</Text>
        {stack ? <Text style={[styles.stack, { color: theme.textSub }]}>{stack}</Text> : null}
      </View>
    );
  }
}

export default function ErrorBoundary(props: ErrorBoundaryProps) {
  const { theme } = useTheme();
  return <ErrorBoundaryBase {...props} theme={theme} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  detail: { fontSize: 14, marginBottom: 12 },
  stack: { fontSize: 12, lineHeight: 16 },
});
