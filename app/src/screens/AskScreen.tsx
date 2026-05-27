import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { postQuestion, createUser, QuestionType } from '../api/client'
import { getUserId } from '../lib/userId'

export function AskScreen() {
  const navigation = useNavigation()
  const [userId, setUserId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [type, setType] = useState<QuestionType>('yesno')
  const [options, setOptions] = useState(['', ''])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getUserId().then(async id => {
      await createUser(id)
      setUserId(id)
    })
  }, [])

  function updateOption(i: number, value: string) {
    const next = [...options]
    next[i] = value
    setOptions(next)
  }

  async function handleSubmit() {
    if (!userId || !text.trim()) return
    if (type === 'multiplechoice' && options.filter(o => o.trim()).length < 2) {
      Alert.alert('Add at least 2 options')
      return
    }
    setSubmitting(true)
    try {
      await postQuestion({
        authorId: userId,
        text: text.trim(),
        type,
        options: type === 'multiplechoice' ? options.filter(o => o.trim()) : undefined,
      })
      setText('')
      setOptions(['', ''])
      setType('yesno')
      navigation.navigate('My Questions' as never)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Question</Text>
        <TextInput
          style={s.textInput}
          value={text}
          onChangeText={setText}
          placeholder="What do you want to know?"
          placeholderTextColor="#aaa"
          multiline
          maxLength={200}
        />

        <Text style={s.label}>Answer type</Text>
        <View style={s.toggle}>
          {(['yesno', 'multiplechoice'] as QuestionType[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.toggleOpt, type === t && s.toggleSel]}
              onPress={() => setType(t)}
            >
              <Text style={[s.toggleTxt, type === t && s.toggleTxtSel]}>
                {t === 'yesno' ? 'Yes / No' : 'Multiple choice'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {type === 'multiplechoice' && (
          <>
            <Text style={s.label}>Options</Text>
            {options.map((opt, i) => (
              <TextInput
                key={i}
                style={s.optInput}
                value={opt}
                onChangeText={v => updateOption(i, v)}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor="#aaa"
                maxLength={60}
              />
            ))}
            {options.length < 4 && (
              <TouchableOpacity onPress={() => setOptions([...options, ''])}>
                <Text style={s.addOpt}>+ Add option</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={[s.submit, (!text.trim() || submitting) && s.submitOff]}
          onPress={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          <Text style={s.submitTxt}>{submitting ? 'Posting…' : 'Publish question'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { padding: 24 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 24,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
    color: '#1a1a2e',
  },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleOpt: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  toggleSel: { borderColor: '#6C63FF', backgroundColor: '#f0eeff' },
  toggleTxt: { fontSize: 14, color: '#888', fontWeight: '500' },
  toggleTxtSel: { color: '#6C63FF', fontWeight: '700' },
  optInput: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 8,
    color: '#1a1a2e',
  },
  addOpt: { color: '#6C63FF', fontWeight: '600', marginTop: 4 },
  submit: {
    backgroundColor: '#6C63FF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 36,
  },
  submitOff: { backgroundColor: '#ccc' },
  submitTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
})
