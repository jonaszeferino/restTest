import { NextResponse } from "next/server"

import { createRequest, getErrorMessage } from "@/lib/supabase/data"
import type { HeaderPair, HttpMethod, ItemType } from "@/lib/supabase/types"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const collectionId = String(body.collectionId || "")
    const name = String(body.name || "").trim()
    const method = String(body.method || "GET").toUpperCase() as HttpMethod
    const url = String(body.url || "")
    const headers = (Array.isArray(body.headers) ? body.headers : []) as HeaderPair[]
    const requestBody = String(body.body || "")
    const itemType = (body.itemType === "separator" ? "separator" : "request") as ItemType

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
      itemType,
    })

    return NextResponse.json({ request: saved }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/requests]", error)
    const message = getErrorMessage(error, "Failed to create request")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
