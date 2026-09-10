"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Play, Square, X, XCircle } from "lucide-react"

import { BodyEditor } from "@/components/body-editor"
import { JsonHighlight } from "@/components/json-highlight"
import type { HeaderPair, HttpMethod } from "@/lib/supabase/types"
import { interpolate, interpolateHeaders, detectPlaceholders as detectFromText, type VariablePair } from "@/lib/variables"

export type RunnerItem = {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderPair[]
  body: string
  itemType: "request" | "separator"
}

type RunOutput = {
  input: string
  status: number | null
  statusText: string
  durationMs: number | null
  ok: boolean
  body: string
  resolvedUrl: string
  resolvedRequestBody?: string
  error?: string
  apiMessage?: string
}

function extractApiMessage(body: string) {
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed?.error === "string") return parsed.error
    if (typeof parsed?.message === "string") return parsed.message
  } catch {
    // ignore
  }
  return ""
}

type CollectionRunnerProps = {
  open: boolean
  collectionName: string
  items: RunnerItem[]
  /** Fixed collection variables (e.g. baseUrl) */
  variables: VariablePair[]
  onClose: () => void
}

function headersToRecord(headers: HeaderPair[]) {
  const record: Record<string, string> = {}
  for (const header of headers) {
    if (!header.enabled || !header.key.trim()) continue
    record[header.key.trim()] = header.value
  }
  return record
}

function formatBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function detectPlaceholders(...texts: string[]) {
  const found = new Set<string>()
  for (const text of texts) {
    for (const key of detectFromText(text || "")) found.add(key)
  }
  return Array.from(found)
}

/** Accepts "a;b;c" or one value per line */
function parseInputValues(raw: string) {
  return raw
    .split(/[;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export function CollectionRunner({
  open,
  collectionName,
  items,
  variables,
  onClose,
}: CollectionRunnerProps) {
  const requests = useMemo(
    () => items.filter((item) => item.itemType !== "separator"),
    [items],
  )

  const [selectedRequestId, setSelectedRequestId] = useState("")
  const [urlTemplate, setUrlTemplate] = useState("")
  const [bodyTemplate, setBodyTemplate] = useState("")
  const [iterateKey, setIterateKey] = useState("orderId")
  const [delayMs, setDelayMs] = useState(500)
  const [inputText, setInputText] = useState("")
  const [running, setRunning] = useState(false)
  const [waitingNext, setWaitingNext] = useState(false)
  const [outputs, setOutputs] = useState<RunOutput[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const stopRef = useRef(false)
  const urlTemplateRef = useRef("")
  const bodyTemplateRef = useRef("")

  const selectedRequest = requests.find((item) => item.id === selectedRequestId) || requests[0] || null

  function setUrl(next: string) {
    urlTemplateRef.current = next
    setUrlTemplate(next)
  }

  function setBody(next: string) {
    bodyTemplateRef.current = next
    setBodyTemplate(next)
  }

  const placeholders = useMemo(() => {
    if (!selectedRequest) return [] as string[]
    return detectPlaceholders(
      urlTemplate,
      bodyTemplate,
      ...selectedRequest.headers.flatMap((header) => [header.key, header.value]),
    )
  }, [selectedRequest, urlTemplate, bodyTemplate])

  const inputValues = useMemo(() => parseInputValues(inputText), [inputText])
  const selectedOutput = selectedIndex != null ? outputs[selectedIndex] : null

  useEffect(() => {
    if (!open) {
      stopRef.current = true
      setRunning(false)
      setWaitingNext(false)
      setCurrentIndex(null)
      return
    }

    setOutputs([])
    setSelectedIndex(null)
    setInputText("")
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!requests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(requests[0]?.id || "")
    }
  }, [open, requests, selectedRequestId])

  useEffect(() => {
    if (!selectedRequest) {
      setUrl("")
      setBody("")
      return
    }
    setUrl(selectedRequest.url || "")
    setBody(selectedRequest.body || "")
  }, [selectedRequest?.id])

  useEffect(() => {
    if (!open) return
    if (placeholders.includes("orderId")) {
      setIterateKey("orderId")
      return
    }
    if (placeholders.includes("skuId")) {
      setIterateKey("skuId")
      return
    }
    if (placeholders[0]) setIterateKey(placeholders[0])
  }, [open, placeholders, selectedRequestId])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !running) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, running, onClose])

  function insertVariableInUrl() {
    const key = iterateKey.trim() || "orderId"
    const token = `{{${key}}}`
    const current = urlTemplateRef.current
    if (!current.trim()) {
      setUrl(token)
      return
    }
    if (current.includes(token) || current.includes(`{${key}}`)) return

    try {
      const parsed = new URL(current)
      const parts = parsed.pathname.split("/").filter(Boolean)
      if (parts.length > 0) {
        parts[parts.length - 1] = token
        parsed.pathname = `/${parts.join("/")}`
        setUrl(parsed.toString())
        return
      }
    } catch {
      // URL relativa / incompleta
    }

    const cleaned = current.replace(/\/+$/, "")
    setUrl(`${cleaned}/${token}`)
  }

  function insertVariableInBody() {
    const key = iterateKey.trim() || "skuId"
    const token = `{{${key}}}`
    const current = bodyTemplateRef.current || ""
    if (!current.trim()) {
      setBody(`{\n  "${key}": "${token}"\n}`)
      return
    }
    if (current.includes(`{{${key}}}`) || current.includes(`{${key}}`)) {
      // already has placeholder — still normalize quoted form
      const normalizeRe = new RegExp(`("${key}"\\s*:\\s*)(\\{\\{${key}\\}\\}|\\{${key}\\}|[^,}\\n]+)`, "i")
      if (normalizeRe.test(current)) {
        setBody(current.replace(normalizeRe, `$1"${token}"`))
      }
      return
    }

    // "key": "value" | "key": value | "key": a, b, c
    const keyRe = new RegExp(`("${key}"\\s*:\\s*)(?:"([^"]*)"|([^,}\\n]+))`, "i")
    if (keyRe.test(current)) {
      setBody(current.replace(keyRe, `$1"${token}"`))
      return
    }

    setBody(current.replace(/\s*\}\s*$/, `,\n  "${key}": "${token}"\n}`))
  }

  function templateHasIterateKey(template: string, key: string) {
    if (!template || !key) return false
    return template.includes(`{{${key}}}`) || template.includes(`{${key}}`)
  }

  async function waitBetweenRequests(ms: number) {
    if (ms <= 0) return
    setWaitingNext(true)
    const started = Date.now()
    while (Date.now() - started < ms) {
      if (stopRef.current) break
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(100, ms)))
    }
    setWaitingNext(false)
  }

  async function runBatch() {
    if (!selectedRequest || running || inputValues.length === 0) return

    const key = iterateKey.trim() || "skuId"
    const latestUrl = (urlTemplateRef.current || selectedRequest.url || "").trim()
    let latestBody = (bodyTemplateRef.current || selectedRequest.body || "").trim()

    if (!latestUrl) return

    const inUrl = templateHasIterateKey(latestUrl, key)
    const inBody = templateHasIterateKey(latestBody, key)

    if (!inUrl && !inBody) {
      // try to auto-fix body: replace literal skuId (even a list) with {{skuId}}
      insertVariableInBody()
      latestBody = (bodyTemplateRef.current || "").trim()
    }

    const stillMissing =
      !templateHasIterateKey(latestUrl, key) && !templateHasIterateKey(latestBody, key)

    if (stillMissing) {
      setOutputs([
        {
          input: key,
          status: 0,
          statusText: "Config",
          durationMs: null,
          ok: false,
          body: "",
          resolvedUrl: latestUrl,
          resolvedRequestBody: latestBody,
          error: `Missing {{${key}}} in the URL or body. Put values in Input (one at a time). In the body use only "skuId": "{{${key}}}".`,
          apiMessage: `Missing {{${key}}} in the URL or body.`,
        },
      ])
      setSelectedIndex(0)
      return
    }

    // sync state if ref is ahead
    setUrl(latestUrl)
    setBody(latestBody)

    stopRef.current = false
    setRunning(true)
    setWaitingNext(false)
    setOutputs([])
    setSelectedIndex(null)

    const nextOutputs: RunOutput[] = []
    const pauseMs = Math.max(0, Number.isFinite(delayMs) ? delayMs : 0)
    const method = selectedRequest.method
    const allowsBody = !["GET", "HEAD"].includes(method)

    for (let index = 0; index < inputValues.length; index += 1) {
      if (stopRef.current) break
      setCurrentIndex(index)

      const value = inputValues[index]
      const runVariables: VariablePair[] = [
        ...variables,
        {
          id: `iterate-${key}`,
          key,
          value,
          enabled: true,
        },
      ]

      const resolvedUrl = interpolate(latestUrl, runVariables)
      const resolvedHeaders = interpolateHeaders(selectedRequest.headers || [], runVariables)
      const resolvedBody = allowsBody ? interpolate(latestBody, runVariables) : ""

      if (allowsBody && !resolvedBody.trim()) {
        const output: RunOutput = {
          input: value,
          status: 0,
          statusText: "Skipped",
          durationMs: null,
          ok: false,
          body: "",
          resolvedUrl,
          resolvedRequestBody: "",
          error: "Empty body in Executer. Paste JSON in the Body field before running.",
          apiMessage: "Empty body in Executer. Paste JSON in the Body field before running.",
        }
        nextOutputs.push(output)
        setOutputs([...nextOutputs])
        setSelectedIndex(nextOutputs.length - 1)
        if (index < inputValues.length - 1 && !stopRef.current) {
          await waitBetweenRequests(pauseMs)
        }
        continue
      }

      try {
        const headerRecord = headersToRecord(resolvedHeaders)
        if (allowsBody && !Object.keys(headerRecord).some((h) => h.toLowerCase() === "content-type")) {
          headerRecord["Content-Type"] = "application/json"
        }

        const proxyResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            url: resolvedUrl,
            headers: headerRecord,
            body: allowsBody ? resolvedBody : "",
          }),
        })
        const payload = await proxyResponse.json()

        if (!proxyResponse.ok) {
          const rawBody = JSON.stringify(payload, null, 2)
          const output: RunOutput = {
            input: value,
            status: proxyResponse.status,
            statusText: "Proxy Error",
            durationMs: null,
            ok: false,
            body: rawBody,
            resolvedUrl,
            resolvedRequestBody: resolvedBody,
            error: payload.error || "Proxy error",
            apiMessage: payload.error || "",
          }
          nextOutputs.push(output)
          setOutputs([...nextOutputs])
          setSelectedIndex(nextOutputs.length - 1)
        } else {
          const status = Number(payload.status) || 0
          const rawBody = formatBody(payload.body || "")
          const output: RunOutput = {
            input: value,
            status,
            statusText: payload.statusText || "",
            durationMs: payload.durationMs ?? null,
            ok: status >= 200 && status < 400,
            body: rawBody,
            resolvedUrl,
            resolvedRequestBody: resolvedBody,
            apiMessage: extractApiMessage(payload.body || ""),
          }
          nextOutputs.push(output)
          setOutputs([...nextOutputs])
          setSelectedIndex(nextOutputs.length - 1)
        }
      } catch (error) {
        const output: RunOutput = {
          input: value,
          status: 0,
          statusText: "Network Error",
          durationMs: null,
          ok: false,
          body: "",
          resolvedUrl,
          resolvedRequestBody: resolvedBody,
          error: error instanceof Error ? error.message : "Request failed",
          apiMessage: error instanceof Error ? error.message : "Request failed",
        }
        nextOutputs.push(output)
        setOutputs([...nextOutputs])
        setSelectedIndex(nextOutputs.length - 1)
      }

      if (index < inputValues.length - 1 && !stopRef.current) {
        await waitBetweenRequests(pauseMs)
      }
    }

    setCurrentIndex(null)
    setWaitingNext(false)
    setRunning(false)
  }

  if (!open) return null

  const passed = outputs.filter((output) => output.ok).length
  const failed = outputs.filter((output) => !output.ok).length
  const previewUrl =
    urlTemplate && inputValues[0]
      ? interpolate(urlTemplate, [
          ...variables,
          { id: "preview", key: iterateKey, value: inputValues[0], enabled: true },
        ])
      : urlTemplate

  const previewBody =
    bodyTemplate && inputValues[0]
      ? interpolate(bodyTemplate, [
          ...variables,
          { id: "preview", key: iterateKey, value: inputValues[0], enabled: true },
        ])
      : bodyTemplate

  const iterateKeySafe = iterateKey.trim() || "skuId"
  const missingIteratePlaceholder =
    !templateHasIterateKey(urlTemplate, iterateKeySafe) &&
    !templateHasIterateKey(bodyTemplate, iterateKeySafe)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 py-6"
      onClick={() => {
        if (!running) onClose()
      }}
    >
      <section
        className="flex max-h-[92vh] w-full max-w-3xl flex-col border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Executer
            </p>
            <h2 className="truncate text-lg font-semibold tracking-tight">{collectionName}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Paste the list in <span className="font-medium text-foreground">Input</span> (
              <span className="font-mono">A; B; C</span>). In URL/body use only{" "}
              <span className="font-mono">{"{{skuId}}"}</span> — one value per run.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          {requests.length === 0 ? (
            <p className="text-xs text-muted-foreground">This collection has no requests.</p>
          ) : (
            <>
              <section className="space-y-3 border border-border p-4">
                <p className="text-xs font-semibold">1. Request</p>
                <select
                  value={selectedRequest?.id || ""}
                  onChange={(event) => setSelectedRequestId(event.target.value)}
                  className="h-10 w-full border border-input bg-background px-3 text-xs outline-none focus:border-primary"
                >
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.method} · {request.name}
                    </option>
                  ))}
                </select>

                <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span>URL</span>
                    <button
                      type="button"
                      onClick={insertVariableInUrl}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Insert {"{{"}
                      {iterateKey || "orderId"}
                      {"}}"}
                    </button>
                  </div>
                  <input
                    value={urlTemplate}
                    onChange={(event) => setUrl(event.target.value)}
                    className="h-10 w-full border border-input bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-primary"
                    placeholder={`https://api.example.com/orders/{{${iterateKey || "orderId"}}}`}
                    spellCheck={false}
                  />
                </label>

                {selectedRequest && !["GET", "HEAD"].includes(selectedRequest.method) && (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={insertVariableInBody}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        Insert {"{{"}
                        {iterateKey || "skuId"}
                        {"}}"} in body
                      </button>
                    </div>
                    <BodyEditor
                      value={bodyTemplate}
                      onChange={setBody}
                      minHeightClassName="min-h-28"
                      placeholder={`{\n  "id": "{{${iterateKey || "orderId"}}}"\n}`}
                    />
                    {inputValues[0] && previewBody && (
                      <p className="line-clamp-3 break-all font-mono text-[10px] text-muted-foreground">
                        Body (1st): {previewBody}
                      </p>
                    )}
                  </div>
                )}

                {missingIteratePlaceholder && (
                  <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-400">
                    Body/URL still missing <span className="font-mono">{"{{" + iterateKeySafe + "}}"}</span>.
                    Do not put the SKU list in the JSON. Use{" "}
                    <button type="button" onClick={insertVariableInBody} className="underline">
                      Insert in body
                    </button>{" "}
                    and keep the list only in Input.
                  </p>
                )}

                {placeholders.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders:{" "}
                    {placeholders.map((key) => (
                      <span key={key} className="mr-1 font-mono text-foreground">
                        {`{{${key}}}`}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600">
                    Still no {"{{variable}}"}. Edit the URL above or use Insert.
                  </p>
                )}
              </section>

              <section className="space-y-3 border border-border p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">2. Input (value list)</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      One value at a time. E.g. <span className="font-mono">72442-711-GG; 72442-711-M; 72442-711-G</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                      Variable
                      <input
                        value={iterateKey}
                        onChange={(event) => setIterateKey(event.target.value.trim() || "orderId")}
                        list="runner-placeholders"
                        className="h-9 w-36 border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
                        placeholder="orderId"
                      />
                      <datalist id="runner-placeholders">
                        {placeholders.map((key) => (
                          <option key={key} value={key} />
                        ))}
                      </datalist>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                      Timer (ms)
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={delayMs}
                        onChange={(event) => setDelayMs(Math.max(0, Number(event.target.value) || 0))}
                        className="h-9 w-28 border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
                        title="Delay between each request"
                      />
                    </label>
                  </div>
                </div>
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  className="min-h-28 w-full resize-y border border-input bg-background p-3 font-mono text-xs leading-6 outline-none focus:border-primary"
                  placeholder={"ABC123; DEF456; GHI789\nor\nABC123\nDEF456\nGHI789"}
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {inputValues.length} value{inputValues.length === 1 ? "" : "s"}
                    {delayMs > 0 ? ` · timer ${delayMs} ms` : " · no timer"}
                    {waitingNext ? " · waiting..." : ""}
                    {previewUrl ? (
                      <>
                        {" "}
                        · 1st example: <span className="font-mono text-foreground">{previewUrl}</span>
                      </>
                    ) : null}
                  </p>
                  {running ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopRef.current = true
                      }}
                      className="flex h-9 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      <Square className="size-3.5" /> Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runBatch()}
                      disabled={
                        !selectedRequest || inputValues.length === 0 || !iterateKey || !urlTemplate.trim()
                      }
                      className="flex h-9 items-center gap-1.5 bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Play className="size-3.5" /> Run {inputValues.length || ""}×
                    </button>
                  )}
                </div>
              </section>

              <section className="border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold">3. Output</p>
                  {outputs.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-emerald-600">{passed} ok</span>
                      {" · "}
                      <span className="text-rose-600">{failed} failed</span>
                    </p>
                  )}
                </div>

                {outputs.length === 0 ? (
                  <p className="px-4 py-5 text-xs text-muted-foreground">
                    Results for each input appear here.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-auto">
                    {outputs.map((output, index) => {
                      const isCurrent = currentIndex === index
                      const selected = selectedIndex === index
                      return (
                        <button
                          key={`${output.input}-${index}`}
                          type="button"
                          onClick={() => setSelectedIndex(index)}
                          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs hover:bg-muted ${
                            selected ? "bg-primary/10" : ""
                          }`}
                        >
                          {isCurrent ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-sky-500" />
                          ) : output.ok ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                          ) : (
                            <XCircle className="size-3.5 shrink-0 text-rose-500" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-mono">{output.input}</span>
                          {output.apiMessage && (
                            <span className="hidden max-w-[220px] truncate text-[10px] text-rose-500 sm:inline">
                              {output.apiMessage}
                            </span>
                          )}
                          {output.durationMs != null && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {output.durationMs} ms
                            </span>
                          )}
                          <span
                            className={`font-mono text-[10px] ${
                              output.ok ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {output.status ?? "—"}
                          </span>
                        </button>
                      )
                    })}
                    {running && waitingNext && (
                      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-sky-500" />
                        Waiting {delayMs} ms before next...
                      </div>
                    )}
                    {running && currentIndex != null && currentIndex >= outputs.length && !waitingNext && (
                      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-sky-500" />
                        Running {inputValues[currentIndex]}...
                      </div>
                    )}
                  </div>
                )}

                {selectedOutput && (
                  <div className="space-y-2 border-t border-border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-medium">{selectedOutput.input}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                          selectedOutput.ok
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-rose-500/15 text-rose-700"
                        }`}
                      >
                        {selectedOutput.status ?? "—"} {selectedOutput.statusText}
                      </span>
                    </div>
                    <p className="break-all font-mono text-[10px] text-muted-foreground">
                      {selectedOutput.resolvedUrl}
                    </p>
                    {selectedOutput.resolvedRequestBody != null && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Request body ({selectedOutput.resolvedRequestBody.length} chars)
                        </p>
                        <pre className="max-h-28 overflow-auto border border-border bg-muted/20 p-2 font-mono text-[10px] leading-4">
                          {selectedOutput.resolvedRequestBody || "(empty)"}
                        </pre>
                      </div>
                    )}
                    {(selectedOutput.error || selectedOutput.apiMessage) && (
                      <p className="text-xs text-rose-600">
                        {selectedOutput.error || selectedOutput.apiMessage}
                      </p>
                    )}
                    <div className="max-h-56 overflow-hidden border border-border">
                      <JsonHighlight value={selectedOutput.body || selectedOutput.error || ""} />
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
