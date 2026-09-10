import { NextResponse } from "next/server"

import { updateCollection, getErrorMessage } from "@/lib/supabase/data"

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
      variables: Array.isArray(body.variables) ? body.variables : undefined,
    })
    return NextResponse.json({ collection })
  } catch (error) {
    console.error("[PATCH /api/collections/:id]", error)
    const message = getErrorMessage(error, "Failed to update collection")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
