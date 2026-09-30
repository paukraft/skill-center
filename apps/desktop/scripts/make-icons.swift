// Draws the app's images into assets/, where they are kept: the app icon — a
// stack of skill cards, the front one sparked and glowing, on black — which
// electron-builder turns into each platform's format, and the tray icon.
// Needs a Mac; run again only when the drawing changes:
//
//   swift scripts/make-icons.swift
import AppKit

let out = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("assets").path
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

let white = NSColor.white
let silver = NSColor(white: 0.55, alpha: 1)

/// Everything drawn inside this gets a soft white light around it.
func glowing(_ blur: CGFloat, alpha: CGFloat = 0.9, _ body: () -> Void) {
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = white.withAlphaComponent(alpha)
    shadow.shadowBlurRadius = blur
    shadow.set()
    body()
    NSGraphicsContext.restoreGraphicsState()
}

/// A four-point star; `pinch` is how far toward the center its sides curve in.
func sparkle(center c: NSPoint, radius r: CGFloat, pinch: CGFloat) -> NSBezierPath {
    let tips = [NSPoint(x: c.x, y: c.y + r), NSPoint(x: c.x + r, y: c.y), NSPoint(x: c.x, y: c.y - r), NSPoint(x: c.x - r, y: c.y)]
    let pull = { (p: NSPoint) in NSPoint(x: c.x + (p.x - c.x) * pinch, y: c.y + (p.y - c.y) * pinch) }
    let path = NSBezierPath()
    path.move(to: tips[0])
    for i in 1...4 {
        let from = tips[i - 1], to = tips[i % 4]
        path.curve(to: to, controlPoint1: pull(from), controlPoint2: pull(to))
    }
    path.close()
    return path
}

/// A PNG of `size` pixels, drawn by `body` into a context of that many points.
func png(_ size: Int, _ body: (CGFloat) -> Void) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    body(CGFloat(size))
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

func drawIcon(_ s: CGFloat) {
    // Apple's grid: the tile sits inside a 10% margin with a ~22% corner.
    let tileRect = NSRect(x: s * 0.1, y: s * 0.1, width: s * 0.8, height: s * 0.8)
    let tile = NSBezierPath(roundedRect: tileRect, xRadius: s * 0.18, yRadius: s * 0.18)
    // Black, lit from behind the mark, with a faint rim of light at the edge.
    NSGradient(starting: NSColor(white: 0.3, alpha: 1), ending: .black)!.draw(in: tile, relativeCenterPosition: .zero)
    NSGraphicsContext.saveGraphicsState()
    tile.addClip()
    glowing(s * 0.06, alpha: 0.8) {
        white.withAlphaComponent(0.3).setStroke()
        tile.lineWidth = s * 0.012
        tile.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    // Three cards stepping up and back, the group centered on the tile: the
    // back two outlined, the front one silver.
    let step = s * 0.047, radius = s * 0.047, line = s * 0.011
    let front = NSRect(x: s * 0.298, y: s * 0.273, width: s * 0.31, height: s * 0.36)
    for (depth, alpha) in [(2, 0.4), (1, 0.7)] {
        let offset = CGFloat(depth) * step
        let card = NSBezierPath(roundedRect: front.offsetBy(dx: offset, dy: offset), xRadius: radius, yRadius: radius)
        card.lineWidth = line
        glowing(s * 0.03, alpha: alpha * 0.8) {
            NSColor.black.setFill()
            card.fill()
        }
        white.withAlphaComponent(alpha).setStroke()
        card.stroke()
    }
    let card = NSBezierPath(roundedRect: front, xRadius: radius, yRadius: radius)
    card.lineWidth = line * 1.6
    glowing(s * 0.07) {
        white.setFill()
        card.fill()
    }
    NSGradient(starting: white, ending: silver)!.draw(in: card, angle: -60)
    white.setStroke()
    card.stroke()
    NSColor.black.setFill()
    sparkle(center: NSPoint(x: front.midX, y: front.midY), radius: s * 0.1, pinch: 0.26).fill()
}

/// The tray's take on the icon, on an 18-point grid: a card with the sparkle
/// cut out, one more card outlined behind it, in one color.
func drawTray(_ s: CGFloat, _ color: NSColor) {
    let transform = NSAffineTransform()
    transform.scale(by: s / 18)
    transform.concat()
    let back = NSBezierPath(roundedRect: NSRect(x: 6.25, y: 6.25, width: 9.5, height: 10.5), xRadius: 2, yRadius: 2)
    back.lineWidth = 1.5
    color.setStroke()
    back.stroke()

    let frontRect = NSRect(x: 2, y: 1.5, width: 10.5, height: 12)
    // Clear the back card's outline under the front one, with a gap.
    NSGraphicsContext.current?.compositingOperation = .clear
    NSBezierPath(roundedRect: frontRect.insetBy(dx: -1.25, dy: -1.25), xRadius: 3, yRadius: 3).fill()
    NSGraphicsContext.current?.compositingOperation = .sourceOver

    let front = NSBezierPath(roundedRect: frontRect, xRadius: 2, yRadius: 2)
    front.append(sparkle(center: NSPoint(x: frontRect.midX, y: frontRect.midY), radius: 3.6, pinch: 0.26))
    front.windingRule = .evenOdd
    color.setFill()
    front.fill()
}

func save(_ name: String, _ data: Data) {
    try! data.write(to: URL(fileURLWithPath: "\(out)/\(name)"))
}

save("icon.png", png(1024, drawIcon))
// macOS tints a template image itself; Windows and Linux get one for dark
// trays and one for light, each also at 2x.
for (name, color) in [("trayTemplate", NSColor.black), ("tray-dark", NSColor.white), ("tray-light", NSColor.black)] {
    save("\(name).png", png(18) { drawTray($0, color) })
    save("\(name)@2x.png", png(36) { drawTray($0, color) })
}
print("✓ \(out)")
