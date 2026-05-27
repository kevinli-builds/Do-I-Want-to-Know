import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { getUserStats, UserStats } from '../api/client'
import { getUserId } from '../lib/userId'

interface StatCardProps {
  value: number
  label: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
}

function StatCard({ value, label, icon, color }: StatCardProps) {
  return (
    <View style={[s.card, { borderTopColor: color }]}>
      <Ionicons name={icon} size={24} color={color} style={s.cardIcon} />
      <Text style={s.cardValue}>{value}</Text>
      <Text style={s.cardLabel}>{label}</Text>
    </View>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function ProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    getUserId().then(setUserId).catch(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setStats(await getUserStats(userId))
    } catch {
      // network or server error — leave current stats in place
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#6C63FF" /></View>
  }

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load() }}
          tintColor="#6C63FF"
        />
      }
    >
      {/* Avatar */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Ionicons name="person" size={44} color="#6C63FF" />
        </View>
        <Text style={s.handle}>Anonymous Surveyor</Text>
        {stats && (
          <Text style={s.since}>Member since {formatDate(stats.memberSince)}</Text>
        )}
      </View>

      {/* Stat cards */}
      <View style={s.grid}>
        <StatCard
          value={stats?.answeredCount ?? 0}
          label="Answered"
          icon="checkmark-circle-outline"
          color="#43B89C"
        />
        <StatCard
          value={stats?.askedCount ?? 0}
          label="Asked"
          icon="help-circle-outline"
          color="#6C63FF"
        />
        <StatCard
          value={stats?.totalResponsesReceived ?? 0}
          label="Responses received"
          icon="people-outline"
          color="#FF6584"
        />
      </View>

      {/* Engagement ratio nudge */}
      {stats && stats.answeredCount > 0 && stats.askedCount === 0 && (
        <View style={s.nudge}>
          <Ionicons name="bulb-outline" size={18} color="#F7B731" />
          <Text style={s.nudgeText}>
            You've answered {stats.answeredCount} questions — try posting your own!
          </Text>
        </View>
      )}

      {stats && stats.askedCount > 0 && stats.totalResponsesReceived === 0 && (
        <View style={s.nudge}>
          <Ionicons name="time-outline" size={18} color="#aaa" />
          <Text style={s.nudgeText}>
            Waiting on your first response — pull the feed to refresh.
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { alignItems: 'center', marginBottom: 32, marginTop: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f0eeff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  handle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
  since: { fontSize: 13, color: '#aaa', marginTop: 4 },

  grid: { flexDirection: 'row', gap: 12 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardIcon: { marginBottom: 8 },
  cardValue: { fontSize: 28, fontWeight: '800', color: '#1a1a2e' },
  cardLabel: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 },

  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#eee',
  },
  nudgeText: { flex: 1, fontSize: 14, color: '#555', lineHeight: 20 },
})
