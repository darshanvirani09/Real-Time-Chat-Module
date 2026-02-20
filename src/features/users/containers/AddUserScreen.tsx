import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import type { RootStackParamList } from '../../../app/navigation/types'
import { useAppDispatch } from '../../../app/store'
import { upsertUser } from '../store/usersSlice'
import { socketService } from '../../../services/socket/socketService'

type Props = NativeStackScreenProps<RootStackParamList, 'AddUser'>

const AddUserScreen = ({ navigation }: Props) => {
  const dispatch = useAppDispatch()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')

  const canSave = useMemo(() => name.trim().length > 0 && mobile.trim().length > 0, [name, mobile])

  const onSave = async () => {
    if (!canSave) return

    try {
      await socketService.ensureConnected(8000)
      const ack = await socketService.emitWithAck<{ ok: boolean; user?: any; error?: string }>(
        'user:upsert',
        { name, mobile },
        5000
      )

      if (!ack?.ok || !ack.user) {
        Alert.alert('Failed', ack?.error ?? 'Unable to add user')
        return
      }

      dispatch(upsertUser(ack.user))
      navigation.goBack()
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Unable to add user')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter name"
          style={styles.input}
        />

        <Text style={styles.label}>Mobile Number</Text>
        <TextInput
          value={mobile}
          onChangeText={setMobile}
          placeholder="Enter mobile number"
          keyboardType="phone-pad"
          style={styles.input}
        />

        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          style={[styles.button, !canSave && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Save</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#A0A0A0',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
})

export default AddUserScreen
