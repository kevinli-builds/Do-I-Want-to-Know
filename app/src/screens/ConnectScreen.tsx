import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { Ionicons } from '@expo/vector-icons'
import { getConnectUrl } from '../api/client'

interface Props {
  userId: string
  onConnected: () => void
}

const BULLETS = [
  'Only reads order & subscription email subjects',
  'Never accesses personal messages',
  'Your data stays private and is never sold',
]

export function ConnectScreen({ userId, onConnected }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      await WebBrowser.openBrowserAsync(getConnectUrl(userId))
      // Browser closes after OAuth — let App re-check connection status
      onConnected()
    } catch {
      // user cancelled or error — just reset
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Icon */}
        <View style={s.iconWrap}>
          <Ionicons name="mail" size={52} color="#6C63FF" />
        </View>

        <Text style={s.title}>Do I Want To Know?</Text>
        <Text style={s.subtitle}>
          Connect your Gmail and get a personal "Wrapped" — a year-in-review of your spending,
          subscriptions, and orders.
        </Text>

        {/* Trust bullets */}
        <View style={s.bullets}>
          {BULLETS.map(line => (
            <View key={line} style={s.bullet}>
              <Ionicons name="checkmark-circle" size={20} color="#43B89C" />
              <Text style={s.bulletText}>{line}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={s.btn}
          onPress={handleConnect}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#fff" style={s.btnIcon} />
              <Text style={s.btnText}>Connect Gmail</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.legal}>
          By connecting you agree to our{' '}
          <Text style={s.link}>Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7ff' },
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#eeeeff',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  bullets: { gap: 14, marginBottom: 44 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bulletText: { fontSize: 15, color: '#333', flex: 1, lineHeight: 22 },
  btn: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  btnIcon: { marginRight: 10 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  legal: { fontSize: 13, color: '#aaa', textAlign: 'center', lineHeight: 20 },
  link: { color: '#6C63FF' },
})
