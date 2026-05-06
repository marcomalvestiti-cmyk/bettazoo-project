'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_URL } from '@/lib/api'
import { useAccount } from 'wagmi'

type Message = {
  id: string
  sender: string
  text: string
  ts: number
}

// Deterministic color per sender address
const CHAT_COLORS = [
  'text-purple-400',
  'text-fuchsia-400',
  'text-sky-400',
  'text-emerald-400',
  'text-amber-400',
  'text-rose-400',
  'text-violet-400',
  'text-cyan-400',
]

function getSenderColor(sender: string): string {
  let h = 0
  for (let i = 0; i < sender.length; i++) {
    h = (h * 31 + sender.charCodeAt(i)) & 0xffff
  }
  return CHAT_COLORS[h % CHAT_COLORS.length]
}

type Props = {
  room: string
  /** Pass viewers count to show in header */
  viewers?: number
}

export default function LiveChat({ room, viewers = 1247 }: Props) {
  const { address } = useAccount()
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', sender: '0xSystem', text: 'Benvenuto nella chat live! 🎮', ts: Date.now() },
  ])
  const [input, setInput] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] })
    socketRef.current = socket
    socket.emit('join', room)
    socket.on('chat:message', (msg: Message) => {
      setMessages((prev) => [...prev, msg])
    })
    return () => { socket.disconnect() }
  }, [room])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    if (!input.trim() || !socketRef.current) return
    const msg: Message = {
      id: String(Date.now()),
      sender: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Ospite',
      text: input.trim(),
      ts: Date.now(),
    }
    setMessages((prev) => [...prev, msg])
    socketRef.current.emit('chat:message', { room, ...msg })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-[#2b2d31]">

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
        <span className="text-sm font-extrabold text-white">Chat</span>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="font-bold text-zinc-400">{viewers.toLocaleString('it-IT')}</span>
          <span>spettatori</span>
        </div>
      </div>

      {/* ── Message bubbles ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => {
          const isSystem = m.sender === '0xSystem'
          const color    = isSystem ? 'text-zinc-500' : getSenderColor(m.sender)
          return (
            <div key={m.id} className="space-y-1">
              {/* Sender + timestamp */}
              <div className="flex items-baseline gap-1.5 px-1">
                <span className={`text-[11px] font-extrabold leading-none ${color}`}>
                  {m.sender}
                </span>
                <span className="text-[10px] text-zinc-700 leading-none">
                  {new Date(m.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {/* Bubble */}
              <div className={`
                inline-block max-w-[92%] px-3 py-2 text-xs leading-relaxed
                rounded-2xl rounded-tl-sm
                ${isSystem
                  ? 'bg-zinc-800/40 text-zinc-500 italic border border-zinc-800'
                  : 'bg-[#383a40] text-zinc-200'
                }
              `}>
                {m.text}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-3 py-3 border-t border-zinc-800 shrink-0 space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={address ? 'Invia un messaggio…' : 'Connetti wallet per chattare'}
            className="flex-1 bg-[#313338] border border-zinc-700 rounded-2xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="
              px-4 py-2 text-xs font-extrabold rounded-2xl
              bg-purple-600 hover:bg-purple-500 text-white
              border-b-2 border-b-purple-900
              active:border-b-0 active:translate-y-0.5
              disabled:opacity-40 disabled:border-b-0
              transition-all duration-75
            "
          >
            Chat
          </button>
        </div>
        <p className="text-[10px] text-zinc-700 text-center">
          Trattate gli altri utenti con rispetto ✌️
        </p>
      </div>
    </div>
  )
}
