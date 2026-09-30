/**
 * A symlink target as `skills` writes them: relative from the link's folder,
 * which should be its real path (see `link` in ops.ts). Across Windows
 * drives there is no relative way: the target as it is.
 */
function relativeTo(link: string, target: string) {
  const from = link.split("/").slice(0, -1)
  const to = target.split("/")
  if (from[0] !== to[0]) return target
  let common = 0
  while (common < from.length && from[common] === to[common]) common++
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/")
}

export { relativeTo }
