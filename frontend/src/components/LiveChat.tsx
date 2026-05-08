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

const CHAT_COLORS = [
  'text-[#e05555]',
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
  viewers?: number
}

export default function LiveChat({ room, viewers = 1247 }: Props) {
  const { address } = useAccount()
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', sender: '0xSystem', text: 'Welcome to the live chat! 🎮', ts: Date.now() },
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
      sender: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Guest',
      text: input.trim(),
      ts: Date.now(),
    }
    setMessages((prev) => [...prev, msg])
    socketRef.current.emit('chat:message', { room, ...msg })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-[#B31A1A] animate-pulse" />
        <span className="text-base font-semibold text-white">Chat</span>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="font-semibold text-slate-400">{viewers.toLocaleString('en-US')}</span>
          <span>viewers</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => {
          const isSystem = m.sender === '0xSystem'
          const color    = isSystem ? 'text-slate-500' : getSenderColor(m.sender)
          return (
            <div key={m.id} className="space-y-1">
              <div className="flex items-baseline gap-1.5 px-1">
                <span className={`text-xs font-semibold leading-none ${color}`}>
                  {m.sender}
                </span>
                <span className="text-[10px] text-slate-700 leading-none">
                  {new Date(m.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={`
                inline-block max-w-[92%] px-3 py-2 text-sm leading-relaxed
                rounded-lg rounded-tl-sm
                ${isSystem
                  ? 'bg-slate-800/40 text-slate-500 italic border border-slate-800'
                  : 'bg-slate-900 text-slate-200'
                }
              `}>
                {m.text}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-slate-800 shrink-0 space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={address ? 'Send a message…' : 'Connect wallet to chat'}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#B31A1A] transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-slate-700 text-center">
          Treat other users with respect ✌️
        </p>
      </div>
    </div>
  )
}
