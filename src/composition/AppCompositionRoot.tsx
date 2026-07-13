import React from 'react';
import { ThemeProvider } from '../providers/theme/ThemeProvider';
import ErrorBoundary from '../shared/components/ErrorBoundary';
import RootNavigation from './RootNavigation';

export default function AppCompositionRoot() {
  return (
    <ThemeProvider>
      <ErrorBoundary label="root">
        <RootNavigation />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
