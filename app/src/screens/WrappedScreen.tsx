import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getWrapped, syncEmails, WrappedStats } from '../api/client'

const CATEGORY_LABELS: Record<string, string> = {
  order: '📦  Orders',
  subscription: '🔄  Subscriptions',
  travel: '✈️  Travel',
  food: '🍔  Food & Delivery',
  entertainment: '🎬  Entertainment',
  other: '📌  Other',
}

interface Props {
  userId: string
}

export function WrappedScreen({ userId }: Props) {
  const [wrapped, setWrapped] = useState<WrappedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setWrapped(await getWrapped(userId))
    } catch {
      // leave previous data in place on network error
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const result = await syncEmails(userId)
      setSyncMsg(
        result.synced === 0
          ? `Already up to date (${result.total} entries)`
          : `Added ${result.synced} new entries — ${result.total} total`
      )
      await load()
    } catch {
      setSyncMsg('Sync failed — check your connection')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    )
  }

  const stats = wrapped?.stats

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
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Your Wrapped</Text>
        {wrapped?.email && <Text style={s.email}>{wrapped.email}</Text>}
      </View>

      {/* Sync button */}
      <TouchableOpacity style={s.syncBtn} onPress={handleSync} disabled={syncing} activeOpacity={0.85}>
        {syncing
          ? <ActivityIndicator color="#fff" size="small" />
          : (
            <>
              <Ionicons name="sync-outline" size={18} color="#fff" style={s.syncIcon} />
              <Text style={s.syncBtnText}>Sync Emails</Text>
            </>
          )}
      </TouchableOpacity>
      {syncMsg && <Text style={s.syncMsg}>{syncMsg}</Text>}

      {/* Empty state */}
      {!stats ? (
        <View style={s.emptyWrap}>
          <Ionicons name="mail-unread-outline" size={52} color="#ccc" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Tap "Sync Emails" to scan your inbox</Text>
        </View>
      ) : (
        <View style={s.cards}>

          {/* Total spend */}
          <View style={[s.card, s.highlight]}>
            <Text style={s.highlightLabel}>TOTAL TRACKED SPEND</Text>
            <Text style={s.highlightAmount}>
              ${stats.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={s.highlightSub}>{wrapped!.totalEntries} transactions scanned</Text>
          </View>

          {/* Subscriptions */}
          {stats.subscriptionCount > 0 && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Ionicons name="repeat" size={20} color="#FF6584" />
                <Text style={s.cardTitle}>Active Subscriptions</Text>
              </View>
              <Text style={s.bigNum}>{stats.subscriptionCount}</Text>
              <Text style={s.cardSub}>
                {stats.subscriptions.slice(0, 4).join(' · ')}
                {stats.subscriptionCount > 4 ? ` +${stats.subscriptionCount - 4} more` : ''}
              </Text>
            </View>
          )}

          {/* Top vendors */}
          {stats.topVendors.length > 0 && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Ionicons name="trophy-outline" size={20} color="#F7B731" />
                <Text style={s.cardTitle}>Top Vendors</Text>
              </View>
              {stats.topVendors.map((v, i) => (
                <View key={v.vendor} style={s.row}>
                  <Text style={s.rank}>#{i + 1}</Text>
                  <Text style={s.rowLabel}>{v.vendor}</Text>
                  <Text style={s.rowRight}>{v.count}×</Text>
                </View>
              ))}
            </View>
          )}

          {/* Most expensive */}
          {stats.mostExpensive && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Ionicons name="pricetag-outline" size={20} color="#6C63FF" />
                <Text style={s.cardTitle}>Biggest Purchase</Text>
              </View>
              <Text style={s.bigNum}>
                ${(stats.mostExpensive.amount ?? 0).toFixed(2)}
              </Text>
              <Text style={s.cardSub}>
                {stats.mostExpensive.vendor} — {stats.mostExpensive.description}
              </Text>
            </View>
          )}

          {/* Category breakdown */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="pie-chart-outline" size={20} color="#43B89C" />
              <Text style={s.cardTitle}>By Category</Text>
            </View>
            {Object.entries(stats.byCategory)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([cat, data]) => (
                <View key={cat} style={s.row}>
                  <Text style={[s.rowLabel, { flex: 1 }]}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </Text>
                  <Text style={s.rowCount}>{data.count}</Text>
                  {data.spend > 0 && (
                    <Text style={s.rowSpend}>${data.spend.toFixed(0)}</Text>
                  )}
                </View>
              ))}
          </View>

        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { marginTop: 8, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a2e' },
  email: { fontSize: 13, color: '#aaa', marginTop: 4 },

  syncBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  syncIcon: { marginRight: 8 },
  syncBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  syncMsg: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 16 },

  emptyWrap: { alignItems: 'center', paddingTop: 64, gap: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
  emptySub: { fontSize: 15, color: '#888' },

  cards: { gap: 16, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  highlight: { backgroundColor: '#6C63FF' },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  highlightAmount: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 4 },
  highlightSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  bigNum: { fontSize: 36, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#888' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  rank: { width: 28, fontSize: 13, color: '#bbb' },
  rowLabel: { fontSize: 14, color: '#333', fontWeight: '500' },
  rowRight: { fontSize: 14, color: '#888', fontWeight: '600' },
  rowCount: { fontSize: 13, color: '#888', marginRight: 8 },
  rowSpend: { fontSize: 13, color: '#6C63FF', fontWeight: '600', width: 52, textAlign: 'right' },
})
