import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { QuestionWithResults, getMyQuestions } from '../api/client'
import { ResultBar } from '../components/ResultBar'
import { getUserId } from '../lib/userId'

const MC_COLORS = ['#6C63FF', '#FF6584', '#43B89C', '#F7B731']
const YESNO = { yes: '#43B89C', no: '#FF6584' }

function safeParseOptions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function QuestionRow({ q }: { q: QuestionWithResults }) {
  const options: string[] = safeParseOptions(q.options)

  return (
    <View style={s.card}>
      <Text style={s.questionText}>{q.text}</Text>
      <Text style={s.count}>
        {q.answerCount} {q.answerCount === 1 ? 'response' : 'responses'}
      </Text>
      {q.answerCount > 0 &&
        (q.type === 'yesno'
          ? (['yes', 'no'] as const).map(k => (
              <ResultBar
                key={k}
                label={k[0].toUpperCase() + k.slice(1)}
                count={q.results[k] ?? 0}
                total={q.answerCount}
                color={YESNO[k]}
              />
            ))
          : options.map((opt, i) => (
              <ResultBar
                key={i}
                label={opt}
                count={q.results[String(i)] ?? 0}
                total={q.answerCount}
                color={MC_COLORS[i % MC_COLORS.length]}
              />
            )))}
    </View>
  )
}

export function MyQuestionsScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuestionWithResults[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    getUserId().then(setUserId).catch(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setQuestions(await getMyQuestions(userId))
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
      renderItem={({ item }) => <QuestionRow q={item} />}
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
          <Text style={s.emptyIcon}>?</Text>
          <Text style={s.emptyTitle}>No questions yet</Text>
          <Text style={s.emptySub}>Head to Ask to post your first question</Text>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  questionText: { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  count: { fontSize: 13, color: '#888', marginBottom: 12 },
})
