import { useEffect, useRef, useState } from "react"
import type * as Three from "three"
import type { SVGLoader as SVGLoaderClass } from "three/addons/loaders/SVGLoader.js"

import type { Logo } from "@/lib/logos"
import { cn } from "@/lib/utils"

/**
 * Extrudes a flat logo SVG into a real 3D mesh (after leweyse/uikit-expt) that
 * tumbles while `active` and springs back to rest. Faces render in the
 * foreground color (or inverted for marks on dark surfaces), facing the camera
 * head-on at rest — so idle it is indistinguishable from the flat mark, and
 * the depth only reveals itself on hover. `className` sizes the mark; the
 * flat fallback SVG and the 3D framing both fill that box.
 *
 * Every instance shares one lazily-created WebGL renderer (browsers cap live
 * contexts well below the number of logos on the page) and blits its frame
 * onto its own small 2d canvas, which is oversized 2x so spinning geometry
 * never clips against the layout slot. three.js loads on idle in its own
 * chunk; the flat SVG renders as fallback until then (and for SSR).
 */

const SPIN_SECONDS = 5

type Gl = {
  THREE: typeof Three
  SVGLoader: typeof SVGLoaderClass
  renderer: Three.WebGLRenderer
}

let glPromise: Promise<Gl> | null = null

const loadGl = () => {
  glPromise ??= Promise.all([
    import("three"),
    import("three/addons/loaders/SVGLoader.js"),
  ]).then(([THREE, { SVGLoader }]) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    return { THREE, SVGLoader, renderer }
  })
  return glPromise
}

// Converts a stroked subpath into a fillable outline (dense samples offset
// perpendicular to the centerline, butt caps) so strokes can extrude too.
function strokeOutlines(
  THREE: Gl["THREE"],
  path: Three.ShapePath,
  width: number
) {
  return path.subPaths.flatMap((subPath) => {
    const raw = subPath.getSpacedPoints(96)
    const points = raw.filter(
      (p, i) => i === 0 || raw[i - 1]!.distanceToSquared(p) > 1e-12
    )
    if (points.length < 2) return []
    const side = (sign: number) =>
      points.map((point, i) => {
        const prev = points[Math.max(0, i - 1)]!
        const next = points[Math.min(points.length - 1, i + 1)]!
        const tangent = next.clone().sub(prev).normalize()
        return new THREE.Vector2(
          point.x - tangent.y * (width / 2) * sign,
          point.y + tangent.x * (width / 2) * sign
        )
      })
    const shape = new THREE.Shape()
    shape.setFromPoints([...side(1), ...side(-1).reverse()])
    return [shape]
  })
}

function parseLogoShapes(
  THREE: Gl["THREE"],
  SVGLoader: Gl["SVGLoader"],
  logo: Logo
) {
  const { paths } = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}">${logo.markup}</svg>`
  )
  return paths.flatMap((path) => {
    const style = path.userData.style as
      | { stroke?: string; strokeWidth?: number }
      | undefined
    return style?.stroke && style.stroke !== "none"
      ? strokeOutlines(THREE, path, style.strokeWidth || 1)
      : path.toShapes()
  })
}

// Extrudes the logo into a centered mesh + contour lines and frames it with
// an orthographic camera at 2x the viewBox — matching the 2x-oversized
// canvas, so at rest the mark fills the host box exactly like the fallback
// SVG does.
function buildScene({ THREE, SVGLoader }: Gl, logo: Logo) {
  const [vbMinX = 0, vbMinY = 0, vbWidth = 1, vbHeight = 1] = logo.viewBox
    .split(" ")
    .map(Number)
  const maxDim = Math.max(vbWidth, vbHeight)
  const camera = new THREE.OrthographicCamera(
    -maxDim,
    maxDim,
    maxDim,
    -maxDim,
    1,
    maxDim * 4
  )
  camera.position.z = maxDim * 2
  const scene = new THREE.Scene()

  const shapes = parseLogoShapes(THREE, SVGLoader, logo)
  const depth = Math.min(vbWidth, vbHeight) * 0.25
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
    curveSegments: 10,
  })
  // Center on the viewBox (not the content bounds) — that is where the
  // fallback SVG places the mark inside its box.
  geometry.translate(
    -(vbMinX + vbWidth / 2),
    -(vbMinY + vbHeight / 2),
    -depth / 2
  )

  // Faces sit behind the contour lines (polygon offset) so edges stay
  // crisp instead of z-fighting with the surface they trace.
  // Double-sided since the y-flip scale below mirrors the face winding.
  const face = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  // Contour lines fade in with the spin (and out at rest, where they
  // would eat thin marks and betray seams between subpaths).
  const edge = new THREE.LineBasicMaterial({ transparent: true, opacity: 0 })
  const edgesGeometry = new THREE.EdgesGeometry(geometry, 20)
  const group = new THREE.Group()
  group.add(
    new THREE.Mesh(geometry, face),
    new THREE.LineSegments(edgesGeometry, edge)
  )
  group.scale.set(1, -1, 1) // SVG's y axis points down
  scene.add(group)

  return {
    scene,
    camera,
    group,
    face,
    edge,
    dispose: () => {
      geometry.dispose()
      edgesGeometry.dispose()
      face.dispose()
      edge.dispose()
    },
  }
}

// Resolves theme tokens (oklch) to rgb via a shared 1px 2d canvas, since
// THREE.Color can't parse oklch strings itself.
let colorProbe: CanvasRenderingContext2D | null = null
function readCssColor(name: string) {
  if (!colorProbe) {
    const probe = document.createElement("canvas")
    probe.width = probe.height = 1
    colorProbe = probe.getContext("2d", { willReadFrequently: true })!
  }
  colorProbe.fillStyle = getComputedStyle(
    document.documentElement
  ).getPropertyValue(name)
  colorProbe.fillRect(0, 0, 1, 1)
  const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}

// One observer on the root class attribute re-themes every live instance
// (shared, like the renderer; module-lifetime, so never disconnected).
const themeListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null
function onThemeChange(listener: () => void) {
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      for (const notify of themeListeners) notify()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
  }
  themeListeners.add(listener)
  return () => {
    themeListeners.delete(listener)
  }
}

/**
 * Hover state for a Logo3D, spread onto the interactive ancestor so hovering
 * anywhere on it tumbles the logo. Mouse/pen only — touch has no hover to
 * leave from.
 */
export function useLogoHover() {
  const [active, setActive] = useState(false)
  return [
    active,
    {
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType !== "touch") setActive(true)
      },
      onPointerLeave: () => setActive(false),
    },
  ] as const
}

export function Logo3D({
  logo,
  label,
  active,
  className,
  inverted = false,
}: {
  logo: Logo
  label?: string
  active: boolean
  className?: string
  /** Swap face/edge colors for marks sitting on a foreground surface. */
  inverted?: boolean
}) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  // Nudges the render loop when `active` flips; set once three has loaded.
  const wakeRef = useRef<(() => void) | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    activeRef.current = active
    wakeRef.current?.()
  }, [active])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let disposed = false
    let dispose: (() => void) | null = null

    async function setup(hostEl: HTMLElement, canvasEl: HTMLCanvasElement) {
      const gl = await loadGl()
      if (disposed) return
      const { renderer } = gl

      const hostSize = hostEl.clientWidth || 24
      const dpr = Math.min(window.devicePixelRatio, 2)
      const px = Math.round(hostSize * 2 * dpr)
      canvasEl.width = px
      canvasEl.height = px
      const ctx = canvasEl.getContext("2d")!

      const {
        scene,
        camera,
        group,
        face,
        edge,
        dispose: disposeScene,
      } = buildScene(gl, logo)

      const blit = () => {
        if (renderer.domElement.width < px) renderer.setSize(px, px, false)
        renderer.setViewport(0, 0, px, px)
        renderer.render(scene, camera)
        ctx.clearRect(0, 0, px, px)
        ctx.drawImage(
          renderer.domElement,
          0,
          renderer.domElement.height - px,
          px,
          px,
          0,
          0,
          px,
          px
        )
      }

      const applyTheme = () => {
        face.color.set(readCssColor(inverted ? "--background" : "--foreground"))
        edge.color.set(readCssColor(inverted ? "--foreground" : "--background"))
        blit()
      }
      const offThemeChange = onThemeChange(applyTheme)

      const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
      const cruise = (2 * Math.PI) / SPIN_SECONDS
      let theta = 0
      let velocity = 0
      let spinVelocity = cruise
      let tilt = 0
      let zoom = 1
      let raf = 0
      let last = 0

      const resting = () =>
        !activeRef.current && theta === 0 && zoom === 1 && tilt === 0

      const frame = (now: number) => {
        const dt = Math.min((now - last) / 1000, 1 / 30)
        last = now
        if (activeRef.current) {
          // Kicked above cruise on entry, decaying into the steady loop.
          // Kick 13x decaying at 3/s: (13-1)/3 = 4 cruise-units extra (288°)
          // plus ~72° of cruise over the same ~1s = one full 360 that has
          // fully slowed to cruise right as the turn completes.
          spinVelocity += (cruise - spinVelocity) * Math.min(1, dt * 3)
          theta += dt * spinVelocity
          velocity = 0
        } else {
          velocity += (-70 * theta - 14 * velocity) * dt
          theta += velocity * dt
          if (Math.abs(theta) < 0.002 && Math.abs(velocity) < 0.002) {
            theta = 0
            velocity = 0
          }
        }
        // Slight grow while hovered, easing both ways.
        const zoomTarget = activeRef.current ? 1.1 : 1
        zoom += (zoomTarget - zoom) * Math.min(1, dt * 8)
        if (Math.abs(zoom - zoomTarget) < 0.001) zoom = zoomTarget
        // Nodding tilt while spinning: cos peaks exactly at the frontal
        // y-phases so the pose never flattens to the camera mid-loop, and
        // alternates looking up/down each half turn. The eased envelope
        // starts the nod gently and lands the flat rest pose on leave.
        const tiltTarget = activeRef.current ? 0.35 : 0
        tilt += (tiltTarget - tilt) * Math.min(1, dt * 6)
        if (!activeRef.current && Math.abs(tilt) < 0.001) tilt = 0
        edge.opacity = Math.min(1, tilt / 0.35)
        group.scale.set(zoom, -zoom, zoom)
        group.rotation.y = theta
        group.rotation.x = -tilt * Math.cos(theta)
        blit()
        raf = resting() ? 0 : requestAnimationFrame(frame)
      }

      wakeRef.current = () => {
        if (stillMotion.matches) return
        if (activeRef.current) spinVelocity = cruise * 13
        if (!activeRef.current && theta !== 0) {
          // Fold completed turns away so the spring home is at most half a
          // turn (same pose: rotation.y is mod 2π and sin is 2π-periodic).
          theta = ((theta + Math.PI) % (2 * Math.PI)) - Math.PI
          velocity = 0
        }
        if (!raf && !resting()) {
          last = performance.now()
          raf = requestAnimationFrame(frame)
        }
      }

      applyTheme()
      setReady(true)

      dispose = () => {
        cancelAnimationFrame(raf)
        offThemeChange()
        wakeRef.current = null
        disposeScene()
      }
    }

    // Defer the three.js chunk until the browser is idle post-hydration.
    const supportsIdle = typeof requestIdleCallback === "function"
    const idle = supportsIdle
      ? requestIdleCallback(() => void setup(host, canvas))
      : window.setTimeout(() => void setup(host, canvas), 200)
    return () => {
      disposed = true
      if (supportsIdle) cancelIdleCallback(idle)
      else clearTimeout(idle)
      dispose?.()
    }
  }, [logo, inverted])

  return (
    <span
      ref={hostRef}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className
      )}
    >
      <svg
        viewBox={logo.viewBox}
        aria-hidden
        className={cn(
          "size-full fill-current transition-opacity duration-200",
          ready && "opacity-0"
        )}
        dangerouslySetInnerHTML={{ __html: logo.markup }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-1/2 h-[200%] w-[200%] transition-opacity duration-200",
          !ready && "opacity-0"
        )}
      />
    </span>
  )
}
