'use client'

import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useState } from 'react'

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <button
      className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-[color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:text-foreground active:scale-[0.96]"
      onClick={handleCopy}
      type="button"
    >
      <span
        className="absolute transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
        style={{
          opacity: copied ? 0 : 1,
          transform: copied ? 'scale(0.25)' : 'scale(1)',
          filter: copied ? 'blur(4px)' : 'blur(0px)',
        }}
      >
        <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
      </span>
      <span
        className="absolute transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
        style={{
          opacity: copied ? 1 : 0,
          transform: copied ? 'scale(1)' : 'scale(0.25)',
          filter: copied ? 'blur(0px)' : 'blur(4px)',
        }}
      >
        <HugeiconsIcon className="text-emerald-500" icon={Tick02Icon} size={14} strokeWidth={1.5} />
      </span>
    </button>
  )
}
