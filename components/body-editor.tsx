"use client"

import { useMemo, useRef } from "react"
import { Sparkles } from "lucide-react"

type BodyEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeightClassName?: string
  disabled?: boolean
}

function countLines(value: string) {
  if (!value) return 1
  return value.split("\n").length
}

export function BodyEditor({
  value,
  onChange,
  placeholder = "{ }",
  minHeightClassName = "min-h-36",
  disabled = false,
}: BodyEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineCount = useMemo(() => countLines(value), [value])
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => index + 1),
    [lineCount],
  )

  function prettyBody() {
    const trimmed = value.trim()
    if (!trimmed) return

    const tokens: string[] = []
    const masked = trimmed.replace(/\{\{[^{}]+\}\}|\{[a-zA-Z0-9_.-]+\}/g, (token) => {
      const index = tokens.length
      tokens.push(token)
      return `"__VAR_${index}__"`
    })

    try {
      let formatted = JSON.stringify(JSON.parse(masked), null, 2)
      tokens.forEach((token, index) => {
        formatted = formatted.replaceAll(`"__VAR_${index}__"`, token)
      })
      onChange(formatted)
      return
    } catch {
      // fall through
    }

    try {
      onChange(JSON.stringify(JSON.parse(trimmed), null, 2))
    } catch {
      // keep current text when JSON is invalid
    }
  }

  function syncScroll() {
    const textarea = textareaRef.current
    if (!textarea) return
    const gutter = textarea.parentElement?.querySelector("[data-line-gutter]") as HTMLElement | null
    if (!gutter) return
    gutter.scrollTop = textarea.scrollTop
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Request body</span>
        <button
          type="button"
          onClick={prettyBody}
          disabled={disabled || !value.trim()}
          className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Sparkles className="size-3.5" />
          Pretty
        </button>
      </div>
      <div
        className={`grid grid-cols-[3rem_minmax(0,1fr)] overflow-hidden border border-input bg-muted/20 ${minHeightClassName}`}
      >
        <div
          data-line-gutter
          aria-hidden
          className="overflow-hidden border-r border-border bg-muted/40 py-3 text-right font-mono text-[10px] leading-5 text-zinc-400 dark:text-zinc-600"
        >
          {lineNumbers.map((line) => (
            <div key={line} className="px-2">
              {line}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          className="h-full min-h-[9rem] w-full resize-y bg-transparent px-3 py-3 font-mono text-xs leading-5 outline-none disabled:opacity-50"
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
