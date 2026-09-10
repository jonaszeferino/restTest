export type VariablePair = {
  id: string
  key: string
  value: string
  enabled: boolean
}

export function createVariable(key = "", value = "", enabled = true): VariablePair {
  return {
    id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    value,
    enabled,
  }
}

export function variablesToMap(variables: VariablePair[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const variable of variables) {
    if (!variable.enabled) continue
    const key = variable.key.trim()
    if (!key) continue
    map[key] = variable.value
  }
  return map
}

const DOUBLE_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

export function detectPlaceholders(template: string): string[] {
  if (!template) return []
  const found = new Set<string>()
  for (const match of template.matchAll(DOUBLE_PLACEHOLDER_RE)) {
    if (match[1]) found.add(match[1])
  }
  // also {var} single braces
  for (const match of template.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)) {
    if (match[1]) found.add(match[1])
  }
  return Array.from(found)
}

/**
 * Substitui {{var}} e {var} (somente chaves conhecidas).
 * Use in URL, headers, and body — same rules everywhere.
 */
export function interpolate(template: string, variables: VariablePair[]): string {
  if (!template) return ""
  const map = variablesToMap(variables)
  const keys = Object.keys(map)
  if (keys.length === 0) return template

  let result = template.replace(DOUBLE_PLACEHOLDER_RE, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full,
  )

  // {var} only for known variables (does not break generic JSON)
  const sortedKeys = [...keys].sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const singleRe = new RegExp(`\\{${escaped}\\}`, "g")
    result = result.replace(singleRe, map[key])
  }

  return result
}

/** @deprecated use interpolate — kept for compatibility */
export function interpolateStrict(template: string, variables: VariablePair[]): string {
  return interpolate(template, variables)
}

export function interpolateHeaders<T extends { key: string; value: string; enabled: boolean }>(
  headers: T[],
  variables: VariablePair[],
): T[] {
  return headers.map((header) => ({
    ...header,
    key: interpolate(header.key, variables),
    value: interpolate(header.value, variables),
  }))
}
