'use client'

import { useEffect, useState } from 'react'
import { fetchProfile, updateProfile } from '@/lib/api'

const NICKNAME_MAX = 30
const BIO_MAX = 200

export default function ProfileEditor({ address }: { address: string }) {
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchProfile(address)
      .then((p) => {
        setNickname(p.nickname)
        setBio(p.bio)
        setStatus('idle')
      })
      .catch(() => setStatus('idle'))
  }, [address])

  async function handleSave() {
    setStatus('saving')
    setErrorMsg('')
    try {
      await updateProfile(address, nickname, bio)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Errore sconosciuto')
      setStatus('error')
    }
  }

  return (
    <div className="bg-[#141419] border border-zinc-800 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-extrabold text-[#e05555] uppercase tracking-widest">Profilo</p>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-zinc-400 font-bold">Nickname</label>
          <span className="text-xs text-zinc-600">{nickname.length}/{NICKNAME_MAX}</span>
        </div>
        <input
          type="text"
          value={nickname}
          maxLength={NICKNAME_MAX}
          onChange={(e) => { setNickname(e.target.value); setStatus('idle') }}
          placeholder="Il tuo nome da Placer..."
          className="w-full bg-[#0f0f16] border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#B31A1A] transition-colors"
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-zinc-400 font-bold">Bio</label>
          <span className="text-xs text-zinc-600">{bio.length}/{BIO_MAX}</span>
        </div>
        <textarea
          value={bio}
          maxLength={BIO_MAX}
          rows={3}
          onChange={(e) => { setBio(e.target.value); setStatus('idle') }}
          placeholder="Presentati agli altri utenti..."
          className="w-full bg-[#0f0f16] border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#B31A1A] transition-colors resize-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {status === 'error' && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}
        {status === 'saved' && (
          <p className="text-xs text-emerald-400">Salvato!</p>
        )}
        {status !== 'error' && status !== 'saved' && <span />}

        <button
          onClick={handleSave}
          disabled={status === 'saving' || status === 'loading'}
          className="px-4 py-2 rounded-xl text-xs font-extrabold bg-[#B31A1A] hover:bg-[#cc2020] border-b-2 border-b-[#6b0d0d] active:border-b-0 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all duration-75 shrink-0"
        >
          {status === 'saving' ? 'Salvataggio...' : 'Salva profilo'}
        </button>
      </div>
    </div>
  )
}
