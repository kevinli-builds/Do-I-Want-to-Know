import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  label: string
  count: number
  total: number
  color: string
  highlighted?: boolean
}

export function ResultBar({ label, count, total, color, highlighted }: Props) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)

  return (
    <View style={styles.row}>
      <Text style={[styles.label, highlighted && styles.bold]}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.pct, highlighted && styles.bold]}>{pct}%</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  label: { width: 64, fontSize: 14, color: '#333' },
  bold: { fontWeight: '700' },
  track: {
    flex: 1,
    height: 20,
    backgroundColor: '#eee',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  fill: { height: '100%', borderRadius: 10 },
  pct: { width: 36, fontSize: 13, color: '#555', textAlign: 'right' },
})
