import { NextResponse } from "next/server"

import { deleteRequest, updateRequest } from "@/lib/supabase/data"
import type { HeaderPair, HttpMethod } from "@/lib/supabase/types"

type Params = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()

    const patch: {
      name?: string
      method?: HttpMethod
      url?: string
      headers?: HeaderPair[]
      body?: string
      collection_id?: string
    } = {}

    if (typeof body.name === "string") patch.name = body.name
    if (typeof body.method === "string") patch.method = body.method.toUpperCase() as HttpMethod
    if (typeof body.url === "string") patch.url = body.url
    if (Array.isArray(body.headers)) patch.headers = body.headers
    if (typeof body.body === "string") patch.body = body.body
    if (typeof body.collectionId === "string") patch.collection_id = body.collectionId

    const saved = await updateRequest(id, patch)
    return NextResponse.json({ request: saved })
  } catch (error) {
    console.error("[PATCH /api/requests/:id]", error)
    const message = error instanceof Error ? error.message : "Failed to update request"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    await deleteRequest(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/requests/:id]", error)
    const message = error instanceof Error ? error.message : "Failed to delete request"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
