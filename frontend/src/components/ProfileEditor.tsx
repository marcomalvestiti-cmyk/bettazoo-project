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
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-red-500 uppercase tracking-widest">Profile</p>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-slate-400 font-medium">Nickname</label>
          <span className="text-xs text-slate-600">{nickname.length}/{NICKNAME_MAX}</span>
        </div>
        <input
          type="text"
          value={nickname}
          maxLength={NICKNAME_MAX}
          onChange={(e) => { setNickname(e.target.value); setStatus('idle') }}
          placeholder="Your Placer name..."
          className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#B31A1A] transition-colors"
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-slate-400 font-medium">Bio</label>
          <span className="text-xs text-slate-600">{bio.length}/{BIO_MAX}</span>
        </div>
        <textarea
          value={bio}
          maxLength={BIO_MAX}
          rows={3}
          onChange={(e) => { setBio(e.target.value); setStatus('idle') }}
          placeholder="Introduce yourself to other users..."
          className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#B31A1A] transition-colors resize-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {status === 'error' && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}
        {status === 'saved' && (
          <p className="text-xs text-emerald-400">Saved!</p>
        )}
        {status !== 'error' && status !== 'saved' && <span />}

        <button
          onClick={handleSave}
          disabled={status === 'saving' || status === 'loading'}
          className="px-4 py-2 rounded-md text-xs font-semibold bg-[#B31A1A] hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
        >
          {status === 'saving' ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  )
}
