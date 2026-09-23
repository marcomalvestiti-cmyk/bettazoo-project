'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { fetchProfile, updateProfile, type Specialization } from '@/lib/api'
import { SPORTS_TREE, type SportNode } from '@/lib/sportsData'

const NICKNAME_MAX = 30
const BIO_MAX = 200

function getChildren(tree: SportNode[], id: string): SportNode[] {
  for (const node of tree) {
    if (node.id === id) return node.children ?? []
    if (node.children) {
      const found = getChildren(node.children, id)
      if (found.length) return found
    }
  }
  return []
}

export default function ProfileEditor({ address }: { address: string }) {
  const t = useTranslations('ProfileEditor')
  const [nickname, setNickname] = useState('')
  const [bio, setBio]           = useState('')
  const [spec, setSpec]         = useState<Specialization>({ category: '', sport: '', league: '' })
  const [status, setStatus]     = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchProfile(address)
      .then((p) => {
        setNickname(p.nickname)
        setBio(p.bio)
        setSpec(p.specialization)
        setStatus('idle')
      })
      .catch(() => setStatus('idle'))
  }, [address])

  function setCategory(cat: string) {
    setSpec({ category: cat, sport: '', league: '' })
    setStatus('idle')
  }
  function setSport(sport: string) {
    setSpec(s => ({ ...s, sport, league: '' }))
    setStatus('idle')
  }
  function setLeague(league: string) {
    setSpec(s => ({ ...s, league }))
    setStatus('idle')
  }

  const categories  = SPORTS_TREE
  const sports      = spec.category ? getChildren(SPORTS_TREE, spec.category) : []
  const leagues     = spec.sport    ? getChildren(SPORTS_TREE, spec.sport)    : []

  async function handleSave() {
    setStatus('saving')
    setErrorMsg('')
    try {
      await updateProfile(address, nickname, bio, spec)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('unknownError')
      console.error('[ProfileEditor] Save failed:', msg)
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFB01F] transition-colors'
  const selectCls = `${inputCls} cursor-pointer disabled:text-slate-600 disabled:cursor-default`

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">{t('title')}</p>

      {/* Nickname */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-slate-400 font-medium">{t('nickname')}</label>
          <span className="text-xs text-slate-600">{nickname.length}/{NICKNAME_MAX}</span>
        </div>
        <input
          type="text"
          value={nickname}
          maxLength={NICKNAME_MAX}
          onChange={(e) => { setNickname(e.target.value); setStatus('idle') }}
          placeholder={t('nicknamePlaceholder')}
          className={inputCls}
        />
      </div>

      {/* Bio */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-xs text-slate-400 font-medium">{t('bio')}</label>
          <span className="text-xs text-slate-600">{bio.length}/{BIO_MAX}</span>
        </div>
        <textarea
          value={bio}
          maxLength={BIO_MAX}
          rows={2}
          onChange={(e) => { setBio(e.target.value); setStatus('idle') }}
          placeholder={t('bioPlaceholder')}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Specialization */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{t('specialization')}</p>

        <select
          value={spec.category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectCls}
        >
          <option value="">{t('categoryPlaceholder')}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <select
          value={spec.sport}
          onChange={(e) => setSport(e.target.value)}
          disabled={!spec.category}
          className={selectCls}
        >
          <option value="">{t('sportPlaceholder')}</option>
          {sports.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <select
          value={spec.league}
          onChange={(e) => setLeague(e.target.value)}
          disabled={!spec.sport}
          className={selectCls}
        >
          <option value="">{t('leaguePlaceholder')}</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>

        {spec.league && (
          <p className="text-[10px] text-slate-500 font-mono">
            {t('preloadNote')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-xs">
          {status === 'error' && <span className="text-red-400">{errorMsg}</span>}
          {status === 'saved' && <span className="text-emerald-400">{t('saved')}</span>}
        </span>
        <button
          onClick={handleSave}
          disabled={status === 'saving' || status === 'loading'}
          className="px-4 py-2 rounded-md text-xs font-bold bg-[#FFB01F] hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 transition-colors shrink-0"
        >
          {status === 'saving' ? t('savingButton') : t('saveButton')}
        </button>
      </div>
    </div>
  )
}
