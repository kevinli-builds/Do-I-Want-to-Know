import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Question, getFeed } from '../api/client'
import { QuestionCard } from '../components/QuestionCard'
import { getUserId } from '../lib/userId'

export function FeedScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    getUserId().then(setUserId).catch(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setQuestions(await getFeed(userId))
    } catch {
      // network or server error — leave current list in place
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
    <FlatList
      data={questions}
      keyExtractor={q => q.id}
      renderItem={({ item }) =>
        userId ? <QuestionCard question={item} userId={userId} /> : null
      }
      contentContainerStyle={questions.length === 0 ? s.emptyWrap : s.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load() }}
          tintColor="#6C63FF"
        />
      }
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.emptyIcon}>✓</Text>
          <Text style={s.emptyTitle}>You're all caught up</Text>
          <Text style={s.emptySub}>Pull to refresh or post your own question</Text>
        </View>
      }
    />
  )
}

const s = StyleSheet.create({
  list: { paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyWrap: { flex: 1 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#888', textAlign: 'center' },
})
