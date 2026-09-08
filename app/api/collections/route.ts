import { NextResponse } from "next/server"

import { createCollection, listCollections } from "@/lib/supabase/data"

export async function GET() {
  try {
    const collections = await listCollections()
    return NextResponse.json({ collections })
  } catch (error) {
    console.error("[GET /api/collections]", error)
    const message = error instanceof Error ? error.message : "Failed to load collections"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name || "").trim()
    if (!name) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 })
    }

    const collection = await createCollection({
      name,
      color: typeof body.color === "string" ? body.color : undefined,
    })

    return NextResponse.json({ collection }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/collections]", error)
    const message = error instanceof Error ? error.message : "Failed to create collection"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
