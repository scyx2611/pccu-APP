import React from 'react';
import { Redirect } from 'expo-router';

export default function ScheduleRootScreen() {
  return <Redirect href="/(tabs)/home/schedule" />;
}
