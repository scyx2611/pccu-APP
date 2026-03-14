import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TodoScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerSpacer} />
      
      {/* 待辦事項卡片：超圓角現代風 */}
      <View style={styles.todoCard}>
        <View style={styles.checkboxCircle}>
          <View style={styles.checkboxInner} />
        </View>
        <View style={styles.todoContent}>
          <Text style={styles.todoTitle}>完成 MyCCU 爬蟲</Text>
          <Text style={styles.todoTime}>今天, 23:59</Text>
        </View>
      </View>
      
      <View style={styles.todoCard}>
        <View style={[styles.checkboxCircle, { borderColor: '#E5E5EA' }]}>
        </View>
        <View style={styles.todoContent}>
          <Text style={styles.todoTitle}>明天早八體育課</Text>
          <Text style={styles.todoTime}>明天, 08:00</Text>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F9' },
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 120 },
  bottomSpacer: { height: 140 },
  
  todoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12 },
  checkboxCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#0A7AFF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  checkboxInner: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#0A7AFF' },
  todoContent: { flex: 1 },
  todoTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  todoTime: { fontSize: 14, color: '#8E8E93' }
});
