/** Read and write nested input values by dotted path, like "operations.monthly_rent". */

type Tree = Record<string, unknown>

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (typeof cur !== 'object' || cur === null) return undefined
    return (cur as Tree)[key]
  }, obj)
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  if (!head) return obj
  const tree = obj as unknown as Tree
  const child = rest.length ? setPath(tree[head] ?? {}, rest.join('.'), value) : value
  return { ...tree, [head]: child } as T
}
