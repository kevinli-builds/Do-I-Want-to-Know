import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { FeedScreen } from './src/screens/FeedScreen'
import { AskScreen } from './src/screens/AskScreen'
import { MyQuestionsScreen } from './src/screens/MyQuestionsScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'

const Tab = createBottomTabNavigator()

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Feed: { active: 'layers', inactive: 'layers-outline' },
  Ask: { active: 'add-circle', inactive: 'add-circle-outline' },
  'My Questions': { active: 'bar-chart', inactive: 'bar-chart-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              const icon = ICONS[route.name]
              return <Ionicons name={focused ? icon.active : icon.inactive} size={size} color={color} />
            },
            tabBarActiveTintColor: '#6C63FF',
            tabBarInactiveTintColor: '#aaa',
            headerStyle: { backgroundColor: '#fafafa' },
            headerTitleStyle: { fontWeight: '700', color: '#1a1a2e' },
          })}
        >
          <Tab.Screen name="Feed" component={FeedScreen} />
          <Tab.Screen name="Ask" component={AskScreen} />
          <Tab.Screen name="My Questions" component={MyQuestionsScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  )
}
