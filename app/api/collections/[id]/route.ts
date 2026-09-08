import { NextResponse } from "next/server"

import { updateCollection } from "@/lib/supabase/data"

type Params = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const collection = await updateCollection(id, {
      name: body.name,
      color: body.color,
    })
    return NextResponse.json({ collection })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update collection"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
