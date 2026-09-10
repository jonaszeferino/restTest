export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type ItemType = "request" | "separator"

export type HeaderPair = {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type VariablePair = {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      collections: {
        Row: {
          id: string
          workspace_id: string | null
          name: string
          color: string
          variables: VariablePair[]
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          name: string
          color?: string
          variables?: VariablePair[]
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          name?: string
          color?: string
          variables?: VariablePair[]
          position?: number
          created_at?: string
          updated_at?: string
        }
      }
      requests: {
        Row: {
          id: string
          collection_id: string
          name: string
          method: HttpMethod
          url: string
          headers: HeaderPair[]
          body: string
          item_type: ItemType
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          collection_id: string
          name: string
          method: HttpMethod
          url?: string
          headers?: HeaderPair[]
          body?: string
          item_type?: ItemType
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          collection_id?: string
          name?: string
          method?: HttpMethod
          url?: string
          headers?: HeaderPair[]
          body?: string
          item_type?: ItemType
          position?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"]
export type RequestRow = Database["public"]["Tables"]["requests"]["Row"]

export type RequestDto = {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderPair[]
  body: string
  itemType: ItemType
}

export type CollectionDto = {
  id: string
  name: string
  color: string
  variables: VariablePair[]
  items: RequestDto[]
}
