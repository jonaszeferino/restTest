"use client"

import { Fragment, useEffect, useMemo, type ReactNode } from "react"

type JsonTokenType = "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "plain"

type JsonToken = {
  type: JsonTokenType
  value: string
}

type MatchRange = {
  start: number
  end: number
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

  return lines.map((line) => (line.length > 0 ? line : [{ type: "plain", value: "" }]))
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

export function getResponseDisplayText(value: string, pretty: boolean) {
  if (!pretty) return value
  return prepareJsonSource(value).text
}

export function findSearchMatches(text: string, query: string): MatchRange[] {
  const trimmed = query.trim()
  if (!trimmed || !text) return []

  const ranges: MatchRange[] = []
  const haystack = text.toLowerCase()
  const needle = trimmed.toLowerCase()
  let index = 0

  while (index < haystack.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    ranges.push({ start: found, end: found + needle.length })
    index = found + Math.max(needle.length, 1)
  }

  return ranges
}

function renderTextWithMatches(
  text: string,
  offset: number,
  matches: MatchRange[],
  activeMatchIndex: number,
  keyPrefix: string,
): ReactNode[] {
  if (!text) return []
  if (matches.length === 0) return [text]

  const end = offset + text.length
  const overlapping = matches
    .map((match, matchIndex) => ({ ...match, matchIndex }))
    .filter((match) => match.start < end && match.end > offset)

  if (overlapping.length === 0) return [text]

  const nodes: ReactNode[] = []
  let cursor = offset

  for (const match of overlapping) {
    const start = Math.max(match.start, offset)
    const stop = Math.min(match.end, end)
    if (start > cursor) {
      nodes.push(text.slice(cursor - offset, start - offset))
    }
    nodes.push(
      <mark
        key={`${keyPrefix}-match-${match.matchIndex}`}
        data-response-match={match.matchIndex}
        className={`rounded-[2px] px-0.5 ${
          match.matchIndex === activeMatchIndex
            ? "bg-amber-400/80 text-zinc-900 dark:bg-amber-300 dark:text-zinc-900"
            : "bg-amber-300/40 text-inherit dark:bg-amber-400/25"
        }`}
      >
        {text.slice(start - offset, stop - offset)}
      </mark>,
    )
    cursor = stop
  }

  if (cursor < end) {
    nodes.push(text.slice(cursor - offset))
  }

  return nodes
}

export function JsonHighlight({
  value,
  emptyLabel = "// Response body will appear here",
  showLineNumbers = true,
  searchQuery = "",
  activeMatchIndex = 0,
  pretty = true,
}: {
  value?: string | null
  emptyLabel?: string
  showLineNumbers?: boolean
  searchQuery?: string
  activeMatchIndex?: number
  pretty?: boolean
}) {
  const { highlightedLines, matches } = useMemo(() => {
    if (!value) {
      return {
        highlightedLines: emptyLabel.split("\n").map((line) => [{ type: "plain" as const, value: line }]),
        matches: [] as MatchRange[],
      }
    }

    const prepared = pretty ? prepareJsonSource(value) : { text: value, isJson: false }
    const displayText = prepared.text
    const lines =
      prepared.isJson && pretty
        ? splitTokensIntoLines(tokenizeJson(prepared.text))
        : displayText.split("\n").map((line) => [{ type: "plain" as const, value: line }])

    return {
      highlightedLines: lines,
      matches: findSearchMatches(displayText, searchQuery),
    }
  }, [value, emptyLabel, pretty, searchQuery])

  useEffect(() => {
    if (!searchQuery.trim() || matches.length === 0) return
    const active = document.querySelector<HTMLElement>(
      `[data-response-match="${activeMatchIndex}"]`,
    )
    active?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeMatchIndex, searchQuery, matches.length, value, pretty])

  let charOffset = 0

  return (
    <div className="json-viewer min-h-0 flex-1 overflow-auto">
      <div className="min-w-full py-2">
        {highlightedLines.map((tokens, lineIndex) => {
          const lineText = tokens.map((token) => token.value).join("")
          const lineNodes = tokens.map((token, tokenIndex) => {
            const content = renderTextWithMatches(
              token.value,
              charOffset,
              matches,
              activeMatchIndex,
              `l${lineIndex}-t${tokenIndex}`,
            )
            charOffset += token.value.length
            return (
              <span key={`token-${lineIndex}-${tokenIndex}`} className={tokenClassName[token.type]}>
                {content.map((node, nodeIndex) => (
                  <Fragment key={`n-${lineIndex}-${tokenIndex}-${nodeIndex}`}>{node}</Fragment>
                ))}
              </span>
            )
          })

          // account for newline between lines (except after last)
          if (lineIndex < highlightedLines.length - 1) {
            charOffset += 1
          }

          return (
            <div
              key={`line-${lineIndex}`}
              className={`border-l-2 border-transparent hover:border-sky-500/40 hover:bg-sky-500/[0.04] ${
                showLineNumbers ? "grid grid-cols-[3rem_minmax(0,1fr)]" : "grid grid-cols-[minmax(0,1fr)]"
              }`}
            >
              {showLineNumbers && (
                <span className="select-none pr-3 text-right font-mono text-[10px] leading-6 text-zinc-400 dark:text-zinc-600">
                  {lineIndex + 1}
                </span>
              )}
              <pre
                className={`min-h-6 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-6 ${
                  showLineNumbers ? "pr-4" : "px-4"
                }`}
              >
                {lineText ? lineNodes : "\u00a0"}
              </pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}
