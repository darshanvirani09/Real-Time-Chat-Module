import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'
import chatReducer from '../features/chat/store/chatSlice'
import usersReducer from '../features/users/store/usersSlice'
import networkReducer from './network/networkSlice'

export const store = configureStore({
    reducer: {
        chat: chatReducer,
        users: usersReducer,
        network: networkReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false, // Performance optimization for large states
        }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
