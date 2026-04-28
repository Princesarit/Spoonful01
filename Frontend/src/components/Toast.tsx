'use client'

import { useState, useCallback } from 'react'

type ToastType = 'success' | 'error'

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null)

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 2500)
  }, [])

  const toastEl = msg ? (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-xl flex items-center gap-2 pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
        msg.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      <span>{msg.type === 'success' ? '✓' : '✕'}</span>
      <span>{msg.text}</span>
    </div>
  ) : null

  return { showToast, toastEl }
}
