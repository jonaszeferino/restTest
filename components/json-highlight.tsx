"use client"

import { useMemo } from "react"

type JsonTokenType = "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "plain"

type JsonToken = {
  type: JsonTokenType
  value: string
}

const tokenClassName: Record<JsonTokenType, string> = {
  key: "font-semibold text-[#0369a1] dark:text-[#38bdf8]",
  string: "font-normal text-[#15803d] dark:text-[#4ade80]",
  number: "text-[#b45309] dark:text-[#fbbf24]",
  boolean: "text-[#6d28d9] dark:text-[#a78bfa]",
  null: "text-[#be123c] dark:text-[#fb7185]",
  punctuation: "text-zinc-500 dark:text-zinc-500",
  plain: "text-zinc-700 dark:text-zinc-300",
}

function tokenizeJson(source: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let index = 0
  let expectingKey = false
  const stack: Array<"object" | "array"> = []

  const push = (type: JsonTokenType, value: string) => {
    if (!value) return
    tokens.push({ type, value })
  }

  while (index < source.length) {
    const char = source[index]

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      let end = index + 1
      while (end < source.length && /\s/.test(source[end])) end += 1
      push("plain", source.slice(index, end))
      index = end
      continue
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "object" : "array")
      expectingKey = char === "{"
      push("punctuation", char)
      index += 1
      continue
    }

    if (char === "}" || char === "]") {
      stack.pop()
      const parent = stack[stack.length - 1]
      expectingKey = false
      push("punctuation", char)
      index += 1
      // after closing a nested value, next comma in object expects key
      void parent
      continue
    }

    if (char === ":") {
      expectingKey = false
      push("punctuation", char)
      index += 1
      continue
    }

    if (char === ",") {
      expectingKey = stack[stack.length - 1] === "object"
      push("punctuation", char)
      index += 1
      continue
    }

    if (char === '"') {
      let end = index + 1
      let escaped = false
      while (end < source.length) {
        const current = source[end]
        if (escaped) {
          escaped = false
        } else if (current === "\\") {
          escaped = true
        } else if (current === '"') {
          break
        }
        end += 1
      }
      const value = source.slice(index, Math.min(end + 1, source.length))
      const inObject = stack[stack.length - 1] === "object"
      push(inObject && expectingKey ? "key" : "string", value)
      index = Math.min(end + 1, source.length)
      continue
    }

    if (/[0-9-]/.test(char)) {
      let end = index + 1
      while (end < source.length && /[0-9.eE+-]/.test(source[end])) end += 1
      push("number", source.slice(index, end))
      index = end
      continue
    }

    if (source.startsWith("true", index)) {
      push("boolean", "true")
      index += 4
      continue
    }

    if (source.startsWith("false", index)) {
      push("boolean", "false")
      index += 5
      continue
    }

    if (source.startsWith("null", index)) {
      push("null", "null")
      index += 4
      continue
    }

    push("plain", char)
    index += 1
  }

  return tokens
}

function splitTokensIntoLines(tokens: JsonToken[]): JsonToken[][] {
  const lines: JsonToken[][] = [[]]

  for (const token of tokens) {
    const parts = token.value.split("\n")
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) lines.push([])
      if (part.length > 0) {
        lines[lines.length - 1].push({ type: token.type, value: part })
      }
    })
  }

  return lines.map((line) => (line.length > 0 ? line : [{ type: "plain", value: " " }]))
}

function prepareJsonSource(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return { text: value, isJson: false }

  try {
    return {
      text: JSON.stringify(JSON.parse(trimmed), null, 2),
      isJson: true,
    }
  } catch {
    return { text: value, isJson: false }
  }
}

export function JsonHighlight({
  value,
  emptyLabel = "// Response body will appear here",
}: {
  value?: string | null
  emptyLabel?: string
}) {
  const highlightedLines = useMemo(() => {
    if (!value) {
      return emptyLabel.split("\n").map((line) => [{ type: "plain" as const, value: line || " " }])
    }

    const prepared = prepareJsonSource(value)
    if (!prepared.isJson) {
      return prepared.text.split("\n").map((line) => [{ type: "plain" as const, value: line || " " }])
    }

    return splitTokensIntoLines(tokenizeJson(prepared.text))
  }, [value, emptyLabel])

  return (
    <div className="json-viewer min-h-0 flex-1 overflow-auto">
      <div className="min-w-full py-2">
        {highlightedLines.map((tokens, lineIndex) => (
          <div
            key={`line-${lineIndex}`}
            className="grid grid-cols-[3rem_minmax(0,1fr)] border-l-2 border-transparent hover:border-sky-500/40 hover:bg-sky-500/[0.04]"
          >
            <span className="select-none pr-3 text-right font-mono text-[10px] leading-6 text-zinc-400 dark:text-zinc-600">
              {lineIndex + 1}
            </span>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all pr-4 font-mono text-[12px] leading-6">
              {tokens.map((token, tokenIndex) => (
                <span key={`token-${lineIndex}-${tokenIndex}`} className={tokenClassName[token.type]}>
                  {token.value}
                </span>
              ))}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}
