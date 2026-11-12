/**
 * RealtimeContext — STOMP WebSocket over SockJS.
 * Replaces Supabase Realtime + Socket.io.
 *
 * Connects with JWT access token on CONNECT frame.
 * Reconnects automatically on token refresh.
 *
 * Topics:
 *   /topic/team.{teamId}.chat           — team chat messages
 *   /topic/hackathon.{id}.updates       — hackathon-scoped events
 *   /user/queue/notifications           — per-user notifications (server-push)
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '../store/authStore'
import { tokenStore } from '../lib/tokenStore'

const WS_URL = `${import.meta.env.VITE_WS_URL ?? ''}/ws`

interface RealtimeContextType {
  isConnected: boolean
  subscribeToTeamChat: (
    teamId: string,
    callback: (msg: ChatEvent) => void
  ) => (() => void) | null
  subscribeToHackathonUpdates: (
    hackathonId: string,
    callback: (event: HackathonEvent) => void
  ) => (() => void) | null
  sendTeamMessage: (teamId: string, content: string) => void
}

export type ChatEvent = {
  id: string
  teamId: string
  userId: string
  content: string
  messageType: string
  fileUrl: string | null
  fileName: string | null
  createdAt: string
}

export type HackathonEvent = {
  event: string
  [key: string]: unknown
}

const Context = createContext<RealtimeContextType | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id)
  const [isConnected, setIsConnected] = useState(false)
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    if (!userId) {
      clientRef.current?.deactivate()
      clientRef.current = null
      setIsConnected(false)
      return
    }

    let active = true
    void Promise.all([import('@stomp/stompjs'), import('sockjs-client')]).then(([{ Client }, { default: SockJS }]) => {
      if (!active) return
      const client = new Client({
        webSocketFactory: () => new SockJS(WS_URL),
        connectHeaders: {
          Authorization: `Bearer ${tokenStore.getAccessToken() ?? ''}`,
        },
        reconnectDelay: 3000,
        onConnect: () => {
          if (!active) return
          setIsConnected(true)
          client.subscribe('/user/queue/notifications', (msg: IMessage) => {
            try {
              const data = JSON.parse(msg.body) as { title: string; message: string }
              notifications.show({ title: data.title, message: data.message, color: 'blue' })
            } catch {}
          })
        },
        onDisconnect: () => { if (active) setIsConnected(false) },
        onWebSocketClose: () => { if (active) setIsConnected(false) },
        onStompError: (frame) => {
          console.error('STOMP error', frame.headers?.message)
        },
      })

      clientRef.current = client
      client.activate()
    }).catch((error: unknown) => {
      if (active) console.error('Failed to load realtime connection', error)
    })

    return () => {
      active = false
      void clientRef.current?.deactivate()
      clientRef.current = null
      setIsConnected(false)
    }
  }, [userId])

  const subscribeToTeamChat = useCallback(
    (teamId: string, callback: (msg: ChatEvent) => void) => {
      const c = clientRef.current
      if (!c?.connected) return null
      const sub: StompSubscription = c.subscribe(
        `/topic/team.${teamId}.chat`,
        (msg: IMessage) => {
          try { callback(JSON.parse(msg.body)) } catch {}
        }
      )
      return () => sub.unsubscribe()
    },
    []
  )

  const subscribeToHackathonUpdates = useCallback(
    (hackathonId: string, callback: (event: HackathonEvent) => void) => {
      const c = clientRef.current
      if (!c?.connected) return null
      const sub: StompSubscription = c.subscribe(
        `/topic/hackathon.${hackathonId}.updates`,
        (msg: IMessage) => {
          try { callback(JSON.parse(msg.body)) } catch {}
        }
      )
      return () => sub.unsubscribe()
    },
    []
  )

  const sendTeamMessage = useCallback((teamId: string, content: string) => {
    clientRef.current?.publish({
      destination: `/app/team.${teamId}.message`,
      body: JSON.stringify({ content }),
    })
  }, [])

  return (
    <Context.Provider
      value={{ isConnected, subscribeToTeamChat, subscribeToHackathonUpdates, sendTeamMessage }}
    >
      {children}
    </Context.Provider>
  )
}

// exported via hooks/useRealtime.ts — do not use directly
export function useRealtime(): RealtimeContextType {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider')
  return ctx
}
