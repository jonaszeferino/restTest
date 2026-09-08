import { NextResponse } from "next/server"

import { createRequest } from "@/lib/supabase/data"
import type { HeaderPair, HttpMethod } from "@/lib/supabase/types"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const collectionId = String(body.collectionId || "")
    const name = String(body.name || "").trim()
    const method = String(body.method || "GET").toUpperCase() as HttpMethod
    const url = String(body.url || "")
    const headers = (Array.isArray(body.headers) ? body.headers : []) as HeaderPair[]
    const requestBody = String(body.body || "")

    if (!collectionId || !name) {
      return NextResponse.json({ error: "collectionId and name are required" }, { status: 400 })
    }

    const saved = await createRequest({
      collectionId,
      name,
      method,
      url,
      headers,
      body: requestBody,
    })

    return NextResponse.json({ request: saved }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create request"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
