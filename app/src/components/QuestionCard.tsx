import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Question, answerQuestion } from '../api/client'
import { ResultBar } from './ResultBar'

interface Props {
  question: Question
  userId: string
}

function safeParseOptions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const MC_COLORS = ['#6C63FF', '#FF6584', '#43B89C', '#F7B731']
const YESNO = { yes: '#43B89C', no: '#FF6584' }

export function QuestionCard({ question, userId }: Props) {
  const [answered, setAnswered] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, number> | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const options: string[] = safeParseOptions(question.options)

  async function handleAnswer(value: string) {
    if (answered || loading) return
    setLoading(true)
    try {
      const data = await answerQuestion(question.id, userId, value)
      setResults(data.results)
      setTotal(data.total)
      setAnswered(value)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{question.text}</Text>

      {!answered ? (
        <View style={styles.choices}>
          {question.type === 'yesno' ? (
            <>
              <Btn label="Yes" color={YESNO.yes} onPress={() => handleAnswer('yes')} />
              <Btn label="No" color={YESNO.no} onPress={() => handleAnswer('no')} />
            </>
          ) : (
            options.map((opt, i) => (
              <Btn key={i} label={opt} color={MC_COLORS[i % MC_COLORS.length]} onPress={() => handleAnswer(String(i))} />
            ))
          )}
          {loading && <ActivityIndicator style={{ marginTop: 12 }} color="#6C63FF" />}
        </View>
      ) : (
        <View style={styles.results}>
          <Text style={styles.tally}>
            {total} {total === 1 ? 'response' : 'responses'}
          </Text>
          {question.type === 'yesno'
            ? (['yes', 'no'] as const).map(k => (
                <ResultBar
                  key={k}
                  label={k[0].toUpperCase() + k.slice(1)}
                  count={results?.[k] ?? 0}
                  total={total}
                  color={YESNO[k]}
                  highlighted={answered === k}
                />
              ))
            : options.map((opt, i) => (
                <ResultBar
                  key={i}
                  label={opt}
                  count={results?.[String(i)] ?? 0}
                  total={total}
                  color={MC_COLORS[i % MC_COLORS.length]}
                  highlighted={answered === String(i)}
                />
              ))}
        </View>
      )}
    </View>
  )
}

function Btn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    margin: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  question: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 28,
    lineHeight: 30,
  },
  choices: { gap: 12 },
  btn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  results: { gap: 4 },
  tally: { fontSize: 13, color: '#888', marginBottom: 12 },
})
