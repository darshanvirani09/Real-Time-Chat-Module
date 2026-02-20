import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAppDispatch, useAppSelector } from '../store'
import { clearBanner, selectNetworkBanner } from '../network/networkSlice'

export const NetworkBanner = () => {
  const dispatch = useAppDispatch()
  const banner = useAppSelector(selectNetworkBanner)
  if (!banner) return null

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, banner.type === 'offline' ? styles.offline : styles.restored]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => dispatch(clearBanner())} style={styles.container}>
        <View style={styles.dot} />
        <Text style={styles.text}>{banner.message}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    borderBottomWidth: 1,
  },
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111',
    opacity: 0.65,
  },
  offline: {
    backgroundColor: '#FFE5E5',
    borderBottomColor: '#FFB3B3',
  },
  restored: {
    backgroundColor: '#E6F7EC',
    borderBottomColor: '#BCE6C9',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
  },
})
