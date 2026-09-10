import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type {
  CollectionDto,
  CollectionRow,
  HeaderPair,
  HttpMethod,
  ItemType,
  RequestDto,
  RequestRow,
  VariablePair,
} from "@/lib/supabase/types"

function mapVariables(value: unknown): VariablePair[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is VariablePair =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as VariablePair).id === "string" &&
      typeof (item as VariablePair).key === "string",
  )
}

function mapRequest(row: RequestRow): RequestDto {
  return {
    id: row.id,
    name: row.name,
    method: row.method,
    url: row.url,
    headers: Array.isArray(row.headers) ? row.headers : [],
    body: row.body || "",
    itemType: row.item_type === "separator" ? "separator" : "request",
  }
}

function mapCollection(row: CollectionRow, items: RequestDto[] = []): CollectionDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    variables: mapVariables((row as CollectionRow & { variables?: unknown }).variables),
    items,
  }
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

function isMissingColumnError(error: unknown, column: string) {
  const message = getErrorMessage(error, "")
  return message.toLowerCase().includes(column.toLowerCase())
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

  return collectionRows.map((collection) =>
    mapCollection(
      collection,
      requestRows.filter((request) => request.collection_id === collection.id).map(mapRequest),
    ),
  )
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

  const baseRow = {
    workspace_id: workspaceId,
    name,
    color,
    position,
  }

  let result = await supabase
    .from("collections")
    .insert({ ...baseRow, variables: [] })
    .select("*")
    .single()

  if (result.error && isMissingColumnError(result.error, "variables")) {
    result = await supabase.from("collections").insert(baseRow).select("*").single()
  }

  if (result.error) throw result.error
  return mapCollection(result.data as CollectionRow, [])
}

export async function createRequest(input: {
  collectionId: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderPair[]
  body: string
  itemType?: ItemType
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
  const itemType = input.itemType || "request"

  const baseRow = {
    collection_id: input.collectionId,
    name: input.name,
    method: itemType === "separator" ? ("GET" as HttpMethod) : input.method,
    url: itemType === "separator" ? "" : input.url,
    headers: itemType === "separator" ? [] : input.headers,
    body: itemType === "separator" ? "" : input.body,
    position: nextPosition,
  }

  let result = await supabase
    .from("requests")
    .insert({ ...baseRow, item_type: itemType })
    .select("*")
    .single()

  if (result.error && isMissingColumnError(result.error, "item_type")) {
    if (itemType === "separator") {
      throw new Error(
        "To use separators, run the SQL in supabase/migrations/002_variables_and_separators.sql in Supabase.",
      )
    }
    result = await supabase.from("requests").insert(baseRow).select("*").single()
  }

  if (result.error) throw result.error
  return mapRequest(result.data as RequestRow)
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
    item_type: ItemType
  }>,
) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("requests").update(patch).eq("id", id).select("*").single()
  if (error) throw error
  return mapRequest(data as RequestRow)
}

export async function updateCollection(
  id: string,
  patch: Partial<{ name: string; color: string; variables: VariablePair[] }>,
) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("collections").update(patch).eq("id", id).select("*").single()
  if (error) {
    if (patch.variables && isMissingColumnError(error, "variables")) {
      throw new Error(
        "To save variables, run the SQL in supabase/migrations/002_variables_and_separators.sql in Supabase.",
      )
    }
    throw error
  }
  return mapCollection(data as CollectionRow)
}

export async function deleteRequest(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("requests").delete().eq("id", id)
  if (error) throw error
}
