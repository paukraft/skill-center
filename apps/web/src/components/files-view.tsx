import { Editor } from "@pierre/diffs/edit"
import {
  EditProvider,
  File,
  type EditorFactory,
  type FileEditCompleteEvent,
} from "@pierre/diffs/react"
import { FileTree, useFileTree } from "@pierre/trees/react"
import { useEffect, useRef, useState } from "react"

import { Button, Spinner } from "@/components/ui"
import { codeTheme, useDark } from "@/lib/theme"

/**
 * A skill's folder, read: its files as a tree (trees.software) beside the
 * open one, highlighted (diffs.com). SKILL.md opens first. When the skill is
 * the user's own, the open file can be edited in place.
 */

type FilesSource = {
  /** Paths relative to the skill folder. */
  files: string[]
  /** Null when the file is not text. */
  read(path: string): Promise<string | null>
  /** Present when the files may be changed. */
  write?(path: string, text: string): Promise<void>
}

const MAIN = "SKILL.md"

// Spelled out: both render in shadow roots, where the page's font utilities do not reach.
const SANS = '"Geist Variable", -apple-system, sans-serif'
const MONO = '"Geist Mono Variable", ui-monospace, monospace'

/** Code panes in the app's paper and ink rather than the theme's own. */
const CODE_STYLE = {
  "--diffs-font-family": MONO,
  "--diffs-header-font-family": SANS,
  "--diffs-font-size": "12.5px",
  "--diffs-line-height": "1.7",
  "--diffs-light-bg": "var(--card)",
  "--diffs-dark-bg": "var(--card)",
} as React.CSSProperties

const TREE_STYLE = {
  "--trees-bg-override": "transparent",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-selected-bg-override": "color-mix(in oklab, var(--foreground) 6%, transparent)",
  "--trees-border-color-override": "transparent",
  "--trees-font-family-override": SANS,
  "--trees-font-size-override": "12.5px",
} as React.CSSProperties

const createEditor: EditorFactory<undefined, undefined> = (type, options, key) =>
  new Editor(type, options, key)

function FilesView({ source }: { source: FilesSource }) {
  const first = source.files.includes(MAIN) ? MAIN : (source.files[0] ?? null)
  const [picked, setPicked] = useState(first)
  // The list can change underneath (an edit elsewhere); a file gone falls back to the first.
  const open = picked && source.files.includes(picked) ? picked : first
  const hasTree = source.files.length > 1

  return (
    <div className="flex h-full min-h-0">
      {hasTree && (
        <Tree
          // The tree takes its paths once; a different list is a new tree.
          key={source.files.join("\n")}
          files={source.files}
          selected={open}
          onSelect={(path) => source.files.includes(path) && setPicked(path)}
        />
      )}
      <div className="min-w-0 flex-1">
        {open ? <OpenFile key={open} path={open} source={source} /> : null}
      </div>
    </div>
  )
}

function Tree({
  files,
  selected,
  onSelect,
}: {
  files: string[]
  selected: string | null
  onSelect: (path: string) => void
}) {
  const { model } = useFileTree({
    paths: files,
    initialExpansion: "open",
    flattenEmptyDirectories: true,
    initialSelectedPaths: selected ? [selected] : [],
    density: "compact",
    onSelectionChange: (paths) => paths[0] && onSelect(paths[0]),
  })
  return (
    <div className="w-[220px] shrink-0 py-2 pl-2">
      <FileTree model={model} style={{ ...TREE_STYLE, height: "100%" }} />
    </div>
  )
}

function OpenFile({ path, source }: { path: string; source: FilesSource }) {
  const dark = useDark()
  // Undefined while loading; null when the file is not text.
  const [contents, setContents] = useState<string | null>()
  const [mode, setMode] = useState<"reading" | "editing" | "saving">("reading")
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const reading = mode === "reading"

  // Read again whenever the source is renewed, but never over an edit in progress.
  useEffect(() => {
    if (!reading) return
    let live = true
    void source.read(path).then((text) => live && setContents(text))
    return () => {
      live = false
    }
  }, [path, source, reading])

  // Leaving edit mode hands over the final document: saved when the user
  // chose Save, dropped when they cancelled.
  function onEditComplete(event: FileEditCompleteEvent<undefined, undefined>) {
    if (!saving.current || !source.write) return "reject" as const
    saving.current = false
    const text = event.file.contents
    setContents(text)
    // A failed save goes back to editing, so the draft is not read over.
    void source.write(path, text).then(
      () => setMode("reading"),
      (caught: Error) => {
        setError(caught.message)
        setMode("editing")
      },
    )
    return "accept" as const
  }

  function finish(save: boolean) {
    saving.current = save
    setError(null)
    setMode(save ? "saving" : "reading")
  }

  if (contents === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }

  const editing = mode === "editing"
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        <span className="min-w-0 flex-1 truncate font-mono text-caption text-muted-foreground">
          {path}
        </span>
        {error && <span className="text-caption text-danger">{error}</span>}
        {source.write &&
          contents !== null &&
          (editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => finish(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => finish(true)}>
                Save
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              busy={mode === "saving"}
              onClick={() => setMode("editing")}
            >
              Edit
            </Button>
          ))}
      </div>
      {contents === null ? (
        <div className="grid min-h-0 flex-1 place-items-center text-note text-muted-foreground">
          Binary file
        </div>
      ) : (
        <div className="scroll-quiet min-h-0 flex-1" data-selectable>
          <EditProvider createEditor={createEditor}>
            <File
              file={{ name: path, contents }}
              edit={editing}
              onEditComplete={onEditComplete}
              style={CODE_STYLE}
              options={{
                ...codeTheme(dark),
                disableFileHeader: true,
                overflow: "wrap",
              }}
            />
          </EditProvider>
        </div>
      )}
    </div>
  )
}

export { FilesView, type FilesSource }
