"use client"

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Moon,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react"

import { JsonHighlight } from "@/components/json-highlight"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

const NEW_COLLECTION_ID = "__new__"

type HeaderPair = {
  id: string
  key: string
  value: string
  enabled: boolean
}

type CollectionItem = {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderPair[]
  body: string
}

type Collection = {
  id: string
  name: string
  color: string
  items: CollectionItem[]
}

type ParsedCurl = {
  method: HttpMethod
  url: string
  name: string
  headers: HeaderPair[]
  body: string
}

type AuthType = "No Auth" | "Bearer Token" | "Basic Auth"

type ContextMenuState =
  | { type: "collection"; collectionId: string; x: number; y: number }
  | { type: "request"; collectionId: string; requestId: string; x: number; y: number }

type RenameTarget =
  | { type: "collection"; collectionId: string }
  | { type: "request"; collectionId: string; requestId: string }

function createHeader(key = "", value = "", enabled = true): HeaderPair {
  return {
    id: `hdr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    value,
    enabled,
  }
}

const tabs = ["Params", "Authorization", "Headers", "Body", "Scripts", "Settings"]

const methodStyles: Record<HttpMethod, string> = {
  GET: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  POST: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  PUT: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  PATCH: "border-violet-500/40 bg-violet-500/10 text-violet-600",
  DELETE: "border-rose-500/40 bg-rose-500/10 text-rose-600",
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide ${methodStyles[method]}`}
    >
      {method}
    </span>
  )
}

const httpMethods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

function extractQuotedOrPlain(flagPattern: string, source: string): string[] {
  const values: string[] = []
  const regex = new RegExp(`${flagPattern}\\s+(['"])([\\s\\S]*?)\\1|${flagPattern}\\s+(\\S+)`, "gi")
  let match: RegExpExecArray | null
  while ((match = regex.exec(source)) !== null) {
    values.push(match[2] ?? match[3] ?? "")
  }
  return values
}

function decodeBasicAuth(value: string): { username: string; password: string } | null {
  const match = value.match(/^Basic\s+(.+)$/i)
  if (!match) return null
  try {
    const decoded = atob(match[1].trim())
    const separator = decoded.indexOf(":")
    if (separator === -1) return { username: decoded, password: "" }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return null
  }
}

function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function parseCurl(input: string): ParsedCurl | null {
  const normalized = input
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!/^curl\b/i.test(normalized)) return null

  let method: HttpMethod | null = null
  const methodMatch = normalized.match(/(?:--request|-X)\s+['"]?([A-Za-z]+)['"]?/i)
  if (methodMatch) {
    const nextMethod = methodMatch[1].toUpperCase()
    if (httpMethods.includes(nextMethod as HttpMethod)) {
      method = nextMethod as HttpMethod
    }
  }

  let url = ""
  const urlFlagMatch = normalized.match(/--url\s+(['"])(.+?)\1|--url\s+(\S+)/i)
  if (urlFlagMatch) {
    url = urlFlagMatch[2] || urlFlagMatch[3] || ""
  } else {
    const quotedUrlMatch = normalized.match(/['"](https?:\/\/[^'"]+)['"]/)
    const plainUrlMatch = normalized.match(/https?:\/\/[^\s'\\"]+/)
    url = quotedUrlMatch?.[1] || plainUrlMatch?.[0] || ""
  }

  url = url.replace(/[\\,;]+$/, "")
  if (!url) return null

  const headerValues = [
    ...extractQuotedOrPlain("(?:--header|-H)", normalized),
  ]

  const headers = headerValues
    .map((header) => {
      const separator = header.indexOf(":")
      if (separator === -1) return createHeader(header.trim(), "")
      return createHeader(header.slice(0, separator).trim(), header.slice(separator + 1).trim())
    })
    .filter((header) => header.key)

  const dataValues = extractQuotedOrPlain("(?:--data-raw|--data-binary|--data|-d)", normalized)
  const hasDataFlag = /(?:--data-raw|--data-binary|--data|-d)\b/i.test(normalized)
  const body = dataValues[0] ?? ""

  if (!method) {
    method = hasDataFlag && body.length > 0 ? "POST" : "GET"
  }

  let name = "Imported request"
  try {
    const pathname = new URL(url).pathname
    const segment = pathname.split("/").filter(Boolean).at(-1)
    name = segment ? `${method} ${segment}` : `${method} request`
  } catch {
    name = `${method} request`
  }

  return { method, url, name, headers, body }
}

function headersToRecord(headers: HeaderPair[]) {
  const record: Record<string, string> = {}
  for (const header of headers) {
    if (!header.enabled || !header.key.trim()) continue
    record[header.key.trim()] = header.value
  }
  return record
}

function formatResponseBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export default function RestClient() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [collectionsError, setCollectionsError] = useState("")
  const [savingRequest, setSavingRequest] = useState(false)
  const [activeCollectionId, setActiveCollectionId] = useState("")
  const [activeRequestId, setActiveRequestId] = useState("")
  const [method, setMethod] = useState<HttpMethod>("GET")
  const [url, setUrl] = useState("")
  const [requestName, setRequestName] = useState("")
  const [headers, setHeaders] = useState<HeaderPair[]>([])
  const [body, setBody] = useState("")
  const [authType, setAuthType] = useState<AuthType>("No Auth")
  const [authToken, setAuthToken] = useState("")
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [showAuthPassword, setShowAuthPassword] = useState(false)
  const [activeTab, setActiveTab] = useState("Params")
  const [response, setResponse] = useState("{")
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [responseStatusText, setResponseStatusText] = useState("")
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [responseCopied, setResponseCopied] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [snippetOpen, setSnippetOpen] = useState(true)
  const [expanded, setExpanded] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [curlInput, setCurlInput] = useState("")
  const [curlError, setCurlError] = useState("")
  const [targetCollectionId, setTargetCollectionId] = useState("")
  const [newCollectionName, setNewCollectionName] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingRequest, setDeletingRequest] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [isDirty, setIsDirty] = useState(false)
  const [savingChanges, setSavingChanges] = useState(false)
  const [saveError, setSaveError] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const curlInputRef = useRef<HTMLTextAreaElement>(null)

  const activeCollection = collections.find((collection) => collection.id === activeCollectionId)
  const activeRequest = activeCollection?.items.find((item) => item.id === activeRequestId)

  const curl = useMemo(() => {
    const parts = [`curl --request ${method}`, `  --url '${url}'`]
    for (const header of headers) {
      if (!header.enabled || !header.key.trim()) continue
      parts.push(`  --header '${header.key}: ${header.value}'`)
    }
    if (body && !["GET", "HEAD"].includes(method)) {
      parts.push(`  --data '${body.replace(/'/g, `'\\''`)}'`)
    }
    return parts.join(" \\\n")
  }, [method, url, headers, body])

  function applyAuthFromHeaders(nextHeaders: HeaderPair[]) {
    const authHeader = nextHeaders.find(
      (header) => header.enabled && header.key.toLowerCase() === "authorization",
    )

    if (!authHeader) {
      setAuthType("No Auth")
      setAuthToken("")
      setAuthUsername("")
      setAuthPassword("")
      return
    }

    const basic = decodeBasicAuth(authHeader.value)
    if (basic) {
      setAuthType("Basic Auth")
      setAuthUsername(basic.username)
      setAuthPassword(basic.password)
      setAuthToken("")
      return
    }

    const bearer = authHeader.value.match(/^Bearer\s+(.+)$/i)
    if (bearer) {
      setAuthType("Bearer Token")
      setAuthToken(bearer[1])
      setAuthUsername("")
      setAuthPassword("")
      return
    }

    setAuthType("No Auth")
    setAuthToken("")
    setAuthUsername("")
    setAuthPassword("")
  }

  function syncRequestFields(patch: Partial<CollectionItem>) {
    if (!activeCollectionId || !activeRequestId) return
    setCollections((current) =>
      current.map((collection) =>
        collection.id !== activeCollectionId
          ? collection
          : {
              ...collection,
              items: collection.items.map((item) =>
                item.id === activeRequestId ? { ...item, ...patch } : item,
              ),
            },
      ),
    )
    setIsDirty(true)
    setSaveError("")
  }

  function updateRequestName(nextName: string) {
    setRequestName(nextName)
    syncRequestFields({ name: nextName })
  }

  async function saveActiveRequest() {
    if (!activeRequestId || !activeCollectionId) return

    const nextName = requestName.trim() || "Untitled request"
    setSavingChanges(true)
    setSaveError("")

    try {
      const response = await fetch(`/api/requests/${activeRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          method,
          url,
          headers,
          body,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Failed to save request")

      setRequestName(nextName)
      setCollections((current) =>
        current.map((collection) =>
          collection.id !== activeCollectionId
            ? collection
            : {
                ...collection,
                items: collection.items.map((item) =>
                  item.id === activeRequestId
                    ? { ...item, name: nextName, method, url, headers, body }
                    : item,
                ),
              },
        ),
      )
      setIsDirty(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save request")
    } finally {
      setSavingChanges(false)
    }
  }

  async function loadCollections() {
    setLoadingCollections(true)
    setCollectionsError("")
    try {
      const response = await fetch("/api/collections")
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Failed to load collections")

      const nextCollections = (payload.collections || []) as Collection[]
      setCollections(nextCollections)

      const firstCollection = nextCollections[0]
      if (!firstCollection) return

      setActiveCollectionId(firstCollection.id)
      setTargetCollectionId(firstCollection.id)
      setExpanded([firstCollection.id])

      const firstRequest = firstCollection.items[0]
      if (firstRequest) {
        setActiveRequestId(firstRequest.id)
        setRequestName(firstRequest.name)
        setMethod(firstRequest.method)
        setUrl(firstRequest.url)
        setHeaders(firstRequest.headers)
        setBody(firstRequest.body)
        applyAuthFromHeaders(firstRequest.headers)
        setIsDirty(false)
      }
    } catch (error) {
      setCollectionsError(error instanceof Error ? error.message : "Failed to load collections")
    } finally {
      setLoadingCollections(false)
    }
  }

  useEffect(() => {
    if (!loggedIn) return
    void loadCollections()
  }, [loggedIn])

  function upsertAuthorizationHeader(value: string | null) {
    setHeaders((current) => {
      const withoutAuth = current.filter((header) => header.key.toLowerCase() !== "authorization")
      const next = value ? [...withoutAuth, createHeader("Authorization", value)] : withoutAuth
      syncRequestFields({ headers: next })
      return next
    })
  }

  function toggleDarkMode() {
    setDarkMode((current) => {
      const next = !current
      const root = document.documentElement
      root.classList.toggle("dark", next)
      root.classList.toggle("light", !next)
      window.localStorage.setItem("restest-theme", next ? "dark" : "light")
      return next
    })
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("restest-theme")
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const enabled = stored ? stored === "dark" : prefersDark
    setDarkMode(enabled)
    const root = document.documentElement
    root.classList.toggle("dark", enabled)
    root.classList.toggle("light", !enabled)
  }, [])

  useEffect(() => {
    if (!renaming) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renaming])

  useEffect(() => {
    if (!showDeleteConfirm) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDeleteConfirm()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showDeleteConfirm, deletingRequest])

  useEffect(() => {
    if (!showNewRequest) return
    curlInputRef.current?.focus()
  }, [showNewRequest])

  useEffect(() => {
    if (!showNewRequest) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowNewRequest(false)
        setCurlInput("")
        setCurlError("")
        setNewCollectionName("")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showNewRequest])

  useEffect(() => {
    if (!contextMenu) return

    function closeMenu() {
      setContextMenu(null)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu()
    }

    window.addEventListener("click", closeMenu)
    window.addEventListener("scroll", closeMenu, true)
    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("click", closeMenu)
      window.removeEventListener("scroll", closeMenu, true)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [contextMenu])

  function toggleCollection(id: string) {
    setExpanded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function selectRequest(collectionId: string, item: CollectionItem) {
    setActiveCollectionId(collectionId)
    setActiveRequestId(item.id)
    setRequestName(item.name)
    setMethod(item.method)
    setUrl(item.url)
    setHeaders(item.headers)
    setBody(item.body)
    applyAuthFromHeaders(item.headers)
    setIsDirty(false)
    setSaveError("")
    setSent(false)
    setResponse("{")
    setResponseStatus(null)
    setResponseStatusText("")
    setResponseTime(null)
  }

  function openContextMenu(event: MouseEvent, target: ContextMenuState) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(target)
  }

  function startRename(target: RenameTarget, currentName: string) {
    setContextMenu(null)
    setRenameValue(currentName)
    setRenaming(target)
  }

  function commitRename() {
    if (!renaming) return
    const nextName = renameValue.trim()
    if (!nextName) {
      setRenaming(null)
      return
    }

    const target = renaming
    setCollections((current) =>
      current.map((collection) => {
        if (target.type === "collection" && collection.id === target.collectionId) {
          return { ...collection, name: nextName }
        }
        if (target.type === "request" && collection.id === target.collectionId) {
          return {
            ...collection,
            items: collection.items.map((item) =>
              item.id === target.requestId ? { ...item, name: nextName } : item,
            ),
          }
        }
        return collection
      }),
    )
    setRenaming(null)

    void (async () => {
      try {
        if (target.type === "collection") {
          await fetch(`/api/collections/${target.collectionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: nextName }),
          })
          return
        }

        await fetch(`/api/requests/${target.requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        })
      } catch {
        // local rename already applied
      }
    })()
  }

  function cancelRename() {
    setRenaming(null)
    setRenameValue("")
  }

  function openNewRequestModal(collectionId?: string) {
    setContextMenu(null)
    setCurlInput("")
    setCurlError("")
    setNewCollectionName("")
    setTargetCollectionId(collectionId || activeCollectionId || collections[0]?.id || "")
    setShowNewRequest(true)
  }

  function closeNewRequestModal() {
    setShowNewRequest(false)
    setCurlInput("")
    setCurlError("")
    setNewCollectionName("")
  }

  function openDeleteConfirm() {
    if (!activeRequestId || !activeRequest) return
    setDeleteError("")
    setShowDeleteConfirm(true)
  }

  function closeDeleteConfirm() {
    if (deletingRequest) return
    setShowDeleteConfirm(false)
    setDeleteError("")
  }

  async function confirmDeleteRequest() {
    if (!activeRequestId || !activeCollectionId) return

    const requestId = activeRequestId
    const collectionId = activeCollectionId

    setDeletingRequest(true)
    setDeleteError("")

    try {
      const response = await fetch(`/api/requests/${requestId}`, { method: "DELETE" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Failed to delete request")

      const remainingItems =
        collections
          .find((collection) => collection.id === collectionId)
          ?.items.filter((item) => item.id !== requestId) || []

      setCollections((current) =>
        current.map((collection) =>
          collection.id === collectionId
            ? { ...collection, items: collection.items.filter((item) => item.id !== requestId) }
            : collection,
        ),
      )

      if (remainingItems[0]) {
        selectRequest(collectionId, remainingItems[0])
      } else {
        setActiveRequestId("")
        setRequestName("")
        setMethod("GET")
        setUrl("")
        setHeaders([])
        setBody("")
        applyAuthFromHeaders([])
        setIsDirty(false)
        setSent(false)
        setResponse("{")
        setResponseStatus(null)
        setResponseStatusText("")
        setResponseTime(null)
      }

      setShowDeleteConfirm(false)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete request")
    } finally {
      setDeletingRequest(false)
    }
  }

  async function createRequestFromCurl() {
    const parsed = parseCurl(curlInput)
    if (!parsed) {
      setCurlError("Cole um cURL válido. Por enquanto só aceitamos curl.")
      return
    }

    setSavingRequest(true)
    setCurlError("")

    try {
      const wantsNewCollection =
        collections.length === 0 || targetCollectionId === NEW_COLLECTION_ID
      let collectionId = wantsNewCollection
        ? ""
        : targetCollectionId || activeCollectionId || collections[0]?.id || ""
      let createdCollection: Collection | null = null

      if (wantsNewCollection || !collectionId) {
        const folderName = newCollectionName.trim()
        if (!folderName) {
          setCurlError("Informe o nome da collection (pasta) antes de salvar a request.")
          setSavingRequest(false)
          return
        }

        const collectionResponse = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName }),
        })
        const collectionPayload = await collectionResponse.json()
        if (!collectionResponse.ok) {
          throw new Error(collectionPayload.error || "Failed to create collection")
        }

        createdCollection = collectionPayload.collection as Collection
        collectionId = createdCollection.id
        setTargetCollectionId(createdCollection.id)
        setActiveCollectionId(createdCollection.id)
      } else {
        const targetExists = collections.some((collection) => collection.id === collectionId)
        if (!targetExists) {
          setCurlError("A collection selecionada não existe mais.")
          setSavingRequest(false)
          return
        }
      }

      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          name: parsed.name,
          method: parsed.method,
          url: parsed.url,
          headers: parsed.headers,
          body: parsed.body,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Failed to save request")

      const newRequest = payload.request as CollectionItem
      setCollections((current) => {
        const hasCollection = current.some((collection) => collection.id === collectionId)
        const base =
          hasCollection || !createdCollection ? current : [...current, { ...createdCollection, items: [] }]

        return base.map((collection) =>
          collection.id === collectionId
            ? { ...collection, items: [...collection.items, newRequest] }
            : collection,
        )
      })
      setExpanded((current) => (current.includes(collectionId) ? current : [...current, collectionId]))
      selectRequest(collectionId, newRequest)
      closeNewRequestModal()
    } catch (error) {
      setCurlError(error instanceof Error ? error.message : "Failed to save request")
    } finally {
      setSavingRequest(false)
    }
  }

  async function runRequest() {
    setSending(true)
    setSent(true)
    setResponse("// Sending request...")
    setResponseStatus(null)
    setResponseStatusText("")
    setResponseTime(null)

    try {
      const proxyResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url,
          headers: headersToRecord(headers),
          body,
        }),
      })

      const payload = await proxyResponse.json()
      if (!proxyResponse.ok) {
        setResponseStatus(proxyResponse.status)
        setResponseStatusText("Proxy Error")
        setResponse(JSON.stringify(payload, null, 2))
        return
      }

      setResponseStatus(payload.status)
      setResponseStatusText(payload.statusText || "")
      setResponseTime(payload.durationMs ?? null)
      setResponse(formatResponseBody(payload.body || ""))
    } catch (error) {
      setResponseStatus(0)
      setResponseStatusText("Network Error")
      setResponse(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : "Failed to send request",
          },
          null,
          2,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  function copyCurl() {
    navigator.clipboard?.writeText(curl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function copyResponse() {
    if (!response) return
    navigator.clipboard?.writeText(response)
    setResponseCopied(true)
    window.setTimeout(() => setResponseCopied(false), 1600)
  }

  if (!loggedIn) {
    return (
      <main className={`${darkMode ? "dark" : "light"} flex min-h-screen items-center justify-center bg-background px-6 text-foreground`}>
        <section className="w-full max-w-md border border-border bg-card p-8 shadow-sm">
          <div className="mb-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center bg-primary text-primary-foreground">
                <Code2 className="size-5" />
              </div>
              <span className="font-mono text-lg font-bold tracking-tight">RESTest</span>
            </div>
            <button
              type="button"
              onClick={toggleDarkMode}
              className="grid size-9 place-items-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            REST workspace
          </p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight">Welcome back.</h1>
          <p className="mb-8 text-sm leading-6 text-muted-foreground">
            Sign in to access your collections and request history.
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (username === "jonaszeferino" && password === "123") setLoggedIn(true)
            }}
          >
            <label className="flex flex-col gap-2 text-xs font-medium">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                placeholder="jonaszeferino"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                placeholder="••••••"
              />
            </label>
            <button
              className="mt-2 flex h-11 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              type="submit"
            >
              Continue <ChevronRight className="size-4" />
            </button>
          </form>
          <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
            Local preview access. Supabase authentication will replace this temporary gate.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className={`${darkMode ? "dark" : "light"} flex h-screen min-w-[1100px] flex-col overflow-hidden bg-background text-foreground`}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-7">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center bg-primary text-primary-foreground">
              <Code2 className="size-4" />
            </div>
            <span className="font-mono text-base font-bold tracking-tight">RESTest</span>
            <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              REST
            </span>
          </div>
          <div className="hidden h-5 w-px bg-border sm:block" />
          <span className="font-mono text-[11px] text-muted-foreground">Workspace / Jonas</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {darkMode ? "Light" : "Dark"}
          </button>
          <button
            onClick={() => setSnippetOpen((current) => !current)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label={snippetOpen ? "Close code snippet" : "Open code snippet"}
          >
            <Code2 className="size-4" /> Code
          </button>
          <button
            className="grid size-8 place-items-center border border-border hover:bg-muted"
            aria-label="Settings"
          >
            <Settings2 className="size-4" />
          </button>
          <div className="flex items-center gap-2 border-l border-border pl-4 text-xs">
            <UserCircle2 className="size-5 text-muted-foreground" /> jonaszeferino{" "}
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-border bg-muted/20">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Collections
            </span>
            <div className="flex gap-1">
              <button className="grid size-6 place-items-center hover:bg-muted" aria-label="Search">
                <Search className="size-3.5" />
              </button>
              <button className="grid size-6 place-items-center hover:bg-muted" aria-label="New collection">
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {loadingCollections && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Loading collections...</p>
            )}
            {!loadingCollections && collectionsError && (
              <div className="space-y-2 px-2 py-3">
                <p className="text-xs text-rose-600">{collectionsError}</p>
                <button
                  type="button"
                  onClick={() => void loadCollections()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            {!loadingCollections && !collectionsError && collections.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No collections yet.</p>
            )}
            {collections.map((collection) => {
              const isCollectionRenaming =
                renaming?.type === "collection" && renaming.collectionId === collection.id

              return (
                <div key={collection.id} className="mb-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (isCollectionRenaming) return
                      setActiveCollectionId(collection.id)
                      toggleCollection(collection.id)
                    }}
                    onKeyDown={(event) => {
                      if (isCollectionRenaming) return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setActiveCollectionId(collection.id)
                        toggleCollection(collection.id)
                      }
                    }}
                    onContextMenu={(event) =>
                      openContextMenu(event, {
                        type: "collection",
                        collectionId: collection.id,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    className="flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left text-xs font-medium hover:bg-muted"
                  >
                    <span className="text-muted-foreground">
                      {expanded.includes(collection.id) ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </span>
                    {expanded.includes(collection.id) ? (
                      <FolderOpen className="size-4 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 text-muted-foreground" />
                    )}
                    {isCollectionRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            commitRename()
                          }
                          if (event.key === "Escape") {
                            event.preventDefault()
                            cancelRename()
                          }
                        }}
                        className="min-w-0 flex-1 border border-primary bg-background px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <span className="truncate">{collection.name}</span>
                    )}
                    <span className={`ml-auto size-1.5 rounded-full ${collection.color}`} />
                  </div>
                  {expanded.includes(collection.id) && (
                    <div className="ml-8 border-l border-border pl-2">
                      {collection.items.map((item) => {
                        const isRequestRenaming =
                          renaming?.type === "request" &&
                          renaming.collectionId === collection.id &&
                          renaming.requestId === item.id

                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (isRequestRenaming) return
                              selectRequest(collection.id, item)
                            }}
                            onKeyDown={(event) => {
                              if (isRequestRenaming) return
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                selectRequest(collection.id, item)
                              }
                            }}
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                type: "request",
                                collectionId: collection.id,
                                requestId: item.id,
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }
                            className={`flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left text-xs ${
                              activeRequestId === item.id
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <MethodBadge method={item.method} />
                            {isRequestRenaming ? (
                              <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(event) => setRenameValue(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={commitRename}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault()
                                    commitRename()
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault()
                                    cancelRename()
                                  }
                                }}
                                className="min-w-0 flex-1 border border-primary bg-background px-1.5 py-0.5 text-xs outline-none"
                              />
                            ) : (
                              <span className="truncate">{item.name}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-border p-3">
            <button
              onClick={() => openNewRequestModal()}
              className="flex h-10 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-wide text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-3.5" /> New
            </button>
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MethodBadge method={method} />
              <input
                value={requestName}
                onChange={(event) => updateRequestName(event.target.value)}
                disabled={!activeRequestId}
                className="min-w-0 flex-1 border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold outline-none hover:border-border focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Untitled request"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                / {activeCollection?.name ?? "Collection"}
              </span>
              {isDirty && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-amber-600">
                  Unsaved
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => openNewRequestModal()}
                className="flex h-8 items-center gap-1.5 bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-3.5" /> New
              </button>
              <button
                onClick={() => void saveActiveRequest()}
                disabled={!activeRequestId || !isDirty || savingChanges}
                className="flex h-8 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-3.5" /> {savingChanges ? "Saving..." : "Save"}
              </button>
              <button
                className="grid size-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-4" />
              </button>
              <button
                onClick={openDeleteConfirm}
                disabled={!activeRequestId}
                className="flex h-8 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          </div>
          {saveError && (
            <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-2 text-xs text-rose-600">
              {saveError}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
            <div className="flex shrink-0 gap-2">
              <select
                value={method}
                onChange={(event) => {
                  const nextMethod = event.target.value as HttpMethod
                  setMethod(nextMethod)
                  syncRequestFields({ method: nextMethod })
                }}
                className={`h-11 w-28 border px-3 font-mono text-xs font-bold outline-none ${methodStyles[method]}`}
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <div className="flex flex-1 border border-input bg-background">
                <input
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    syncRequestFields({ url: event.target.value })
                  }}
                  className="min-w-0 flex-1 bg-transparent px-3 font-mono text-xs outline-none"
                />
                <button
                  className="border-l border-input px-3 text-muted-foreground hover:bg-muted"
                  aria-label="Clear URL"
                  onClick={() => {
                    setUrl("")
                    syncRequestFields({ url: "" })
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <button
                onClick={runRequest}
                disabled={sending || !url.trim()}
                className="flex h-11 items-center gap-2 bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="size-4" /> {sending ? "Sending..." : "Send"}
              </button>
            </div>
            <div className="mt-7 flex shrink-0 items-center gap-7 border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative pb-3 text-xs font-medium ${
                    activeTab === tab
                      ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                  {tab === "Headers" && headers.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                      {headers.filter((header) => header.enabled).length}
                    </span>
                  )}
                  {tab === "Authorization" && authType !== "No Auth" && (
                    <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700">
                      ●
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="max-h-[220px] shrink-0 overflow-auto border-b border-border py-5">
              {activeTab === "Params" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Query parameters</span>
                    <button className="flex items-center gap-1 text-xs text-primary">
                      <Plus className="size-3.5" /> Add parameter
                    </button>
                  </div>
                  <div className="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span />
                    <span>Key</span>
                    <span>Value</span>
                    <span />
                  </div>
                  <div className="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2">
                    <input type="checkbox" defaultChecked className="accent-primary" />
                    <input
                      className="h-9 border border-input bg-background px-2 font-mono text-xs"
                      placeholder="status"
                    />
                    <input
                      className="h-9 border border-input bg-background px-2 font-mono text-xs"
                      placeholder="open"
                    />
                    <button
                      className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"
                      aria-label="Remove parameter"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {activeTab === "Authorization" && (
                <div className="flex max-w-xl flex-col gap-4">
                  <span className="text-xs font-semibold">Authorization</span>
                  <div className="flex flex-col gap-3">
                    <select
                      value={authType}
                      onChange={(event) => {
                        const nextType = event.target.value as AuthType
                        setAuthType(nextType)
                        if (nextType === "No Auth") {
                          upsertAuthorizationHeader(null)
                          return
                        }
                        if (nextType === "Bearer Token") {
                          upsertAuthorizationHeader(authToken ? `Bearer ${authToken}` : "Bearer ")
                          return
                        }
                        upsertAuthorizationHeader(encodeBasicAuth(authUsername, authPassword))
                      }}
                      className="h-9 w-48 border border-input bg-background px-2 text-xs"
                    >
                      <option>No Auth</option>
                      <option>Bearer Token</option>
                      <option>Basic Auth</option>
                    </select>

                    {authType === "Bearer Token" && (
                      <input
                        value={authToken}
                        onChange={(event) => {
                          setAuthToken(event.target.value)
                          upsertAuthorizationHeader(`Bearer ${event.target.value}`)
                        }}
                        className="h-9 w-full border border-input bg-background px-2 font-mono text-xs"
                        placeholder="Token"
                      />
                    )}

                    {authType === "Basic Auth" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
                          Username
                          <input
                            value={authUsername}
                            onChange={(event) => {
                              setAuthUsername(event.target.value)
                              upsertAuthorizationHeader(encodeBasicAuth(event.target.value, authPassword))
                            }}
                            className="h-9 border border-input bg-background px-2 font-mono text-xs text-foreground"
                            placeholder="username"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
                          Password
                          <div className="relative">
                            <input
                              type={showAuthPassword ? "text" : "password"}
                              value={authPassword}
                              onChange={(event) => {
                                setAuthPassword(event.target.value)
                                upsertAuthorizationHeader(encodeBasicAuth(authUsername, event.target.value))
                              }}
                              className="h-9 w-full border border-input bg-background px-2 pr-9 font-mono text-xs text-foreground"
                              placeholder="password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAuthPassword((current) => !current)}
                              className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
                              aria-label={showAuthPassword ? "Hide password" : "Show password"}
                            >
                              {showAuthPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === "Headers" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Request headers</span>
                    <button
                      className="flex items-center gap-1 text-xs text-primary"
                      onClick={() => {
                        const next = [...headers, createHeader()]
                        setHeaders(next)
                        syncRequestFields({ headers: next })
                      }}
                    >
                      <Plus className="size-3.5" /> Add header
                    </button>
                  </div>
                  <div className="grid grid-cols-[24px_1fr_1.4fr_32px] items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span />
                    <span>Key</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {headers.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum header. Importe um cURL ou adicione manualmente.</p>
                  )}
                  {headers.map((header) => (
                    <div key={header.id} className="grid grid-cols-[24px_1fr_1.4fr_32px] items-center gap-2">
                      <input
                        type="checkbox"
                        checked={header.enabled}
                        onChange={(event) => {
                          const next = headers.map((item) =>
                            item.id === header.id ? { ...item, enabled: event.target.checked } : item,
                          )
                          setHeaders(next)
                          syncRequestFields({ headers: next })
                          applyAuthFromHeaders(next)
                        }}
                        className="accent-primary"
                      />
                      <input
                        value={header.key}
                        onChange={(event) => {
                          const next = headers.map((item) =>
                            item.id === header.id ? { ...item, key: event.target.value } : item,
                          )
                          setHeaders(next)
                          syncRequestFields({ headers: next })
                          applyAuthFromHeaders(next)
                        }}
                        className="h-9 border border-input bg-background px-2 font-mono text-xs"
                        placeholder="Header"
                      />
                      <input
                        value={header.value}
                        onChange={(event) => {
                          const next = headers.map((item) =>
                            item.id === header.id ? { ...item, value: event.target.value } : item,
                          )
                          setHeaders(next)
                          syncRequestFields({ headers: next })
                          applyAuthFromHeaders(next)
                        }}
                        className="h-9 border border-input bg-background px-2 font-mono text-xs"
                        placeholder="Value"
                      />
                      <button
                        className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"
                        aria-label="Remove header"
                        onClick={() => {
                          const next = headers.filter((item) => item.id !== header.id)
                          setHeaders(next)
                          syncRequestFields({ headers: next })
                          applyAuthFromHeaders(next)
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "Body" && (
                <textarea
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value)
                    syncRequestFields({ body: event.target.value })
                  }}
                  className="min-h-36 w-full resize-y border border-input bg-muted/20 p-3 font-mono text-xs outline-none"
                  placeholder="{ }"
                />
              )}
              {activeTab === "Scripts" && (
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-semibold">Pre-request script</span>
                  <textarea
                    className="min-h-28 w-full border border-input bg-muted/20 p-3 font-mono text-xs"
                    placeholder="// Add JavaScript to run before the request"
                  />
                </div>
              )}
              {activeTab === "Settings" && (
                <div className="flex flex-col gap-4">
                  <span className="text-xs font-semibold">Request settings</span>
                  <label className="flex items-center gap-3 text-xs">
                    <input type="checkbox" defaultChecked className="accent-primary" /> Follow redirects
                  </label>
                  <label className="flex items-center gap-3 text-xs">
                    <input type="checkbox" className="accent-primary" /> Store response history
                  </label>
                </div>
              )}
            </div>
            <div className="mt-6 flex min-h-0 flex-1 flex-col">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold">Response</span>
                  {sent ? (
                    <>
                      <span
                        className={`px-2 py-1 font-mono text-[10px] font-bold ${
                          responseStatus && responseStatus >= 200 && responseStatus < 300
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : responseStatus && responseStatus >= 400
                              ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {responseStatus === null
                          ? sending
                            ? "..."
                            : "—"
                          : `${responseStatus}${responseStatusText ? ` ${responseStatusText}` : ""}`}
                      </span>
                      {responseTime !== null && (
                        <span className="font-mono text-[10px] text-muted-foreground">{responseTime} ms</span>
                      )}
                    </>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Run a request to see the response
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCurl}
                    className="flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
                  >
                    <Copy className="size-3.5" /> {copied ? "Copied" : "Copy cURL"}
                  </button>
                  <button
                    className="grid size-7 place-items-center border border-border hover:bg-muted"
                    aria-label="Response settings"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-card/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <span className="border-b-2 border-sky-500 py-3 font-mono text-[10px] text-foreground">
                      Pretty
                    </span>
                    <button
                      type="button"
                      onClick={copyResponse}
                      disabled={!sent || !response}
                      className="flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      aria-label="Copy response"
                    >
                      <Copy className="size-3" />
                      {responseCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleDarkMode}
                      className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                      {darkMode ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                      Dark mode
                      <span
                        className={`relative ml-1 h-4 w-7 rounded-full transition-colors ${
                          darkMode ? "bg-primary" : "bg-border"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 size-3 rounded-full bg-background transition-transform ${
                            darkMode ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </span>
                    </button>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      JSON
                    </span>
                  </div>
                </div>
                {sent ? (
                  <JsonHighlight value={response} />
                ) : (
                  <JsonHighlight value={null} emptyLabel="// Response body will appear here" />
                )}
              </div>
            </div>
          </div>
        </section>

        {!snippetOpen && (
          <button
            type="button"
            onClick={() => setSnippetOpen(true)}
            className="absolute right-0 top-1/2 z-20 flex h-28 w-8 -translate-y-1/2 flex-col items-center justify-center gap-2 border border-r-0 border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            aria-label="Open code snippet"
            title="Open code snippet"
          >
            <PanelRightOpen className="size-4" />
            <span className="rotate-180 text-[10px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
              Code
            </span>
          </button>
        )}

        {snippetOpen && (
          <button
            type="button"
            aria-label="Close code snippet backdrop"
            className="absolute inset-0 z-30 bg-background/40"
            onClick={() => setSnippetOpen(false)}
          />
        )}

        <aside
          className={`absolute inset-y-0 right-0 z-40 flex w-[320px] max-w-[90vw] flex-col border-l border-border bg-card shadow-xl transition-transform duration-300 ease-out ${
            snippetOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
          }`}
          aria-hidden={!snippetOpen}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Code snippet
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={copyCurl}
                className="grid size-7 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Copy cURL"
              >
                <Copy className="size-4" />
              </button>
              <button
                onClick={() => setSnippetOpen(false)}
                className="grid size-7 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close code snippet"
                title="Recolher"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
            <Code2 className="size-3.5 text-muted-foreground" />
            <select className="bg-transparent font-mono text-xs outline-none">
              <option>cURL</option>
              <option>JavaScript</option>
              <option>Python</option>
            </select>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[11px] leading-6 text-muted-foreground">
            {curl}
          </pre>
          <div className="mt-auto shrink-0 border-t border-border p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <Sparkles className="size-3.5 text-primary" /> Request tips
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Use collections to organize related requests. Changes are saved automatically in this local preview.
            </p>
          </div>
        </aside>
      </div>

      {showDeleteConfirm && activeRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
          onClick={closeDeleteConfirm}
        >
          <section
            className="w-full max-w-md border border-border bg-card p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="grid size-9 place-items-center border border-rose-500/30 bg-rose-500/10 text-rose-600">
                <Trash2 className="size-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Delete request?</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Tem certeza que deseja excluir{" "}
                  <span className="font-medium text-foreground">{activeRequest.name}</span>
                  {activeCollection ? (
                    <>
                      {" "}
                      da collection <span className="font-medium text-foreground">{activeCollection.name}</span>
                    </>
                  ) : null}
                  ? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="mb-5 border border-border bg-muted/20 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <MethodBadge method={activeRequest.method} />
                <span className="truncate font-medium">{activeRequest.name}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{activeRequest.url}</p>
            </div>

            {deleteError && <p className="mb-4 text-xs text-rose-600">{deleteError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deletingRequest}
                className="h-10 border border-border px-4 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteRequest()}
                disabled={deletingRequest}
                className="flex h-10 items-center gap-2 bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-3.5" />
                {deletingRequest ? "Deleting..." : "Delete request"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showNewRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
          onClick={closeNewRequestModal}
        >
          <section
            className="w-full max-w-xl border border-border bg-card p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  New request
                </p>
                <h2 className="text-lg font-semibold tracking-tight">Import from cURL</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Por enquanto só aceitamos um comando curl. Cole abaixo para criar a request.
                </p>
              </div>
              <button
                onClick={closeNewRequestModal}
                className="grid size-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-medium">Collection</p>
              {collections.length === 0 ? (
                <div className="space-y-3 border border-dashed border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-2">
                    <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Crie a primeira pasta</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Ainda não há collections. Informe um nome para salvar a pasta e, em seguida, a
                        request dentro dela.
                      </p>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
                    Nome da collection
                    <input
                      value={newCollectionName}
                      onChange={(event) => {
                        setNewCollectionName(event.target.value)
                        if (curlError) setCurlError("")
                      }}
                      className="h-10 border border-input bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-primary"
                      placeholder="Ex: Omniplat Staging"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-2">
                  {collections.map((collection) => {
                    const selected = targetCollectionId === collection.id
                    return (
                      <button
                        key={collection.id}
                        type="button"
                        onClick={() => {
                          setTargetCollectionId(collection.id)
                          setNewCollectionName("")
                          if (curlError) setCurlError("")
                        }}
                        className={`flex items-center gap-3 border px-3 py-2.5 text-left text-xs transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Folder className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium">{collection.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {collection.items.length} req
                        </span>
                        <span className={`size-1.5 rounded-full ${collection.color}`} />
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCollectionId(NEW_COLLECTION_ID)
                      if (curlError) setCurlError("")
                    }}
                    className={`flex items-center gap-3 border border-dashed px-3 py-2.5 text-left text-xs transition-colors ${
                      targetCollectionId === NEW_COLLECTION_ID
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <FolderPlus className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 font-medium">New collection</span>
                    <Plus className="size-3.5 shrink-0" />
                  </button>
                  {targetCollectionId === NEW_COLLECTION_ID && (
                    <label className="flex flex-col gap-1.5 border border-border bg-muted/20 p-3 text-[11px] font-medium text-muted-foreground">
                      Nome da collection
                      <input
                        value={newCollectionName}
                        onChange={(event) => {
                          setNewCollectionName(event.target.value)
                          if (curlError) setCurlError("")
                        }}
                        className="h-10 border border-input bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-primary"
                        placeholder="Ex: Omniplat Staging"
                        autoFocus
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-2 text-xs font-medium">
              cURL
              <textarea
                ref={curlInputRef}
                value={curlInput}
                onChange={(event) => {
                  setCurlInput(event.target.value)
                  if (curlError) setCurlError("")
                }}
                className="min-h-40 w-full resize-y border border-input bg-background p-3 font-mono text-xs leading-6 outline-none focus:border-primary"
                placeholder={`curl --request GET \\\n  --url https://api.example.com/v1/items`}
                spellCheck={false}
              />
            </label>

            {curlError && (
              <p className="mt-3 text-xs text-rose-600">{curlError}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={closeNewRequestModal}
                className="h-10 border border-border px-4 text-xs font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void createRequestFromCurl()}
                disabled={savingRequest}
                className="flex h-10 items-center gap-2 bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="size-3.5" />{" "}
                {savingRequest
                  ? "Saving..."
                  : collections.length === 0 || targetCollectionId === NEW_COLLECTION_ID
                    ? newCollectionName.trim()
                      ? `Create in ${newCollectionName.trim()}`
                      : "Create collection & request"
                    : `Create in ${collections.find((collection) => collection.id === targetCollectionId)?.name ?? "collection"}`}
              </button>
            </div>
          </section>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] border border-border bg-card py-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.type === "collection" && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              onClick={() => openNewRequestModal(contextMenu.collectionId)}
            >
              <Plus className="size-3.5 text-muted-foreground" />
              New request
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            onClick={() => {
              if (contextMenu.type === "collection") {
                const collection = collections.find((item) => item.id === contextMenu.collectionId)
                if (!collection) return
                startRename({ type: "collection", collectionId: collection.id }, collection.name)
                return
              }

              const collection = collections.find((item) => item.id === contextMenu.collectionId)
              const request = collection?.items.find((item) => item.id === contextMenu.requestId)
              if (!collection || !request) return
              startRename(
                {
                  type: "request",
                  collectionId: collection.id,
                  requestId: request.id,
                },
                request.name,
              )
            }}
          >
            <Pencil className="size-3.5 text-muted-foreground" />
            Rename
          </button>
        </div>
      )}
    </main>
  )
}
