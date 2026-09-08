import { NextResponse } from "next/server"

type ProxyPayload = {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProxyPayload
    const method = (payload.method || "GET").toUpperCase()
    const url = payload.url?.trim()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 })
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(payload.headers || {})) {
      if (!key.trim()) continue
      headers.set(key, value)
    }

    const startedAt = Date.now()
    const upstream = await fetch(url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : payload.body || undefined,
      redirect: "follow",
    })

    const responseBody = await upstream.text()
    const responseHeaders: Record<string, string> = {}
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return NextResponse.json({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: responseBody,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
