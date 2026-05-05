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

export default function LiveChat({ room }: { room: string }) {
  const { address } = useAccount()
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', sender: '0xSystem', text: 'Benvenuto nella chat live!', ts: Date.now() },
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col h-72">
      <div className="px-4 py-2.5 border-b border-zinc-800 text-sm font-medium text-zinc-300">
        Chat live
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-xs">
            <span className="font-mono text-emerald-400">{m.sender}</span>
            <span className="text-zinc-500 ml-2 text-[10px]">
              {new Date(m.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <p className="text-zinc-300 mt-0.5">{m.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="px-3 py-2 border-t border-zinc-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Scrivi un messaggio…"
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={sendMessage}
          className="px-3 py-1.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors"
        >
          Invia
        </button>
      </div>
    </div>
  )
}
