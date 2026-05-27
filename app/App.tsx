import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { getUserId } from './src/lib/userId'
import { upsertUser, UserStatus } from './src/api/client'
import { ConnectScreen } from './src/screens/ConnectScreen'
import { WrappedScreen } from './src/screens/WrappedScreen'

export default function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<UserStatus | null>(null)
  const [loading, setLoading] = useState(true)

  async function init() {
    try {
      const id = await getUserId()
      setUserId(id)
      const s = await upsertUser(id)
      setStatus(s)
    } catch {
      // Backend unreachable on first launch — still proceed with userId
    } finally {
      setLoading(false)
    }
  }

  // Called by ConnectScreen after the user closes the OAuth browser tab
  async function handleConnected() {
    if (!userId) return
    try {
      const s = await upsertUser(userId)
      setStatus(s)
    } catch {}
  }

  useEffect(() => { init() }, [])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {status?.connected && userId
        ? <WrappedScreen userId={userId} />
        : <ConnectScreen userId={userId ?? ''} onConnected={handleConnected} />
      }
    </SafeAreaProvider>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7ff' },
})
