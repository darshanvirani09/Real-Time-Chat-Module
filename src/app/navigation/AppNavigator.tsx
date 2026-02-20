import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { RootStackParamList } from './types'
import UsersListScreen from '../../features/users/containers/UsersListScreen'
import AddUserScreen from '../../features/users/containers/AddUserScreen'
import ChatScreen from '../../features/chat/containers/ChatScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()

export const AppNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Users">
      <Stack.Screen name="Users" component={UsersListScreen} options={{ title: 'Users' }} />
      <Stack.Screen name="AddUser" component={AddUserScreen} options={{ title: 'Add User' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}
