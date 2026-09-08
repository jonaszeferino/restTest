import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type {
  CollectionDto,
  CollectionRow,
  HeaderPair,
  HttpMethod,
  RequestRow,
} from "@/lib/supabase/types"

function mapRequest(row: RequestRow) {
  return {
    id: row.id,
    name: row.name,
    method: row.method,
    url: row.url,
    headers: Array.isArray(row.headers) ? row.headers : [],
    body: row.body || "",
  }
}

export async function listCollections(): Promise<CollectionDto[]> {
  const supabase = getSupabaseAdmin()

  const { data: collections, error } = await supabase
    .from("collections")
    .select("*")
    .order("position", { ascending: true })

  if (error) throw error

  const collectionRows = (collections || []) as CollectionRow[]
  if (collectionRows.length === 0) {
    return []
  }

  const { data: requests, error: requestsError } = await supabase
    .from("requests")
    .select("*")
    .order("position", { ascending: true })

  if (requestsError) throw requestsError

  const requestRows = (requests || []) as RequestRow[]

  return collectionRows.map((collection) => ({
    id: collection.id,
    name: collection.name,
    color: collection.color,
    items: requestRows.filter((request) => request.collection_id === collection.id).map(mapRequest),
  }))
}

const collectionColors = ["bg-emerald-400", "bg-sky-400", "bg-amber-400", "bg-violet-400", "bg-rose-400"]

export async function createCollection(input: { name: string; color?: string }) {
  const supabase = getSupabaseAdmin()
  const name = input.name.trim()
  if (!name) throw new Error("Collection name is required")

  const { count, error: countError } = await supabase
    .from("collections")
    .select("*", { count: "exact", head: true })

  if (countError) throw countError

  const position = count ?? 0
  const color = input.color || collectionColors[position % collectionColors.length]

  let workspaceId: string | null = null
  const { data: workspace } = await supabase.from("workspaces").select("id").limit(1).maybeSingle()
  if (workspace?.id) {
    workspaceId = workspace.id as string
  } else {
    const { data: createdWorkspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({ name: "Jonas" })
      .select("id")
      .single()
    if (workspaceError) throw workspaceError
    workspaceId = (createdWorkspace as { id: string }).id
  }

  const { data, error } = await supabase
    .from("collections")
    .insert({
      workspace_id: workspaceId,
      name,
      color,
      position,
    })
    .select("*")
    .single()

  if (error) throw error

  const collection = data as CollectionRow
  return {
    id: collection.id,
    name: collection.name,
    color: collection.color,
    items: [],
  } satisfies CollectionDto
}

export async function createRequest(input: {
  collectionId: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderPair[]
  body: string
}) {
  const supabase = getSupabaseAdmin()

  const { data: existing, error: countError } = await supabase
    .from("requests")
    .select("position")
    .eq("collection_id", input.collectionId)
    .order("position", { ascending: false })
    .limit(1)

  if (countError) throw countError

  const existingRows = (existing || []) as Array<{ position: number }>
  const nextPosition = (existingRows[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from("requests")
    .insert({
      collection_id: input.collectionId,
      name: input.name,
      method: input.method,
      url: input.url,
      headers: input.headers,
      body: input.body,
      position: nextPosition,
    })
    .select("*")
    .single()

  if (error) throw error
  return mapRequest(data as RequestRow)
}

export async function updateRequest(
  id: string,
  patch: Partial<{
    name: string
    method: HttpMethod
    url: string
    headers: HeaderPair[]
    body: string
    collection_id: string
  }>,
) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("requests").update(patch).eq("id", id).select("*").single()
  if (error) throw error
  return mapRequest(data as RequestRow)
}

export async function updateCollection(id: string, patch: Partial<{ name: string; color: string }>) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("collections").update(patch).eq("id", id).select("*").single()
  if (error) throw error
  return data as CollectionRow
}

export async function deleteRequest(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("requests").delete().eq("id", id)
  if (error) throw error
}
