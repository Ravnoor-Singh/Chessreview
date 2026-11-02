/**
 * ThemeFilterDefs — the inline SVG filter definitions referenced by
 * board tokens (`tokens.filterId`). Rendered once per board surface
 * (board, settings preview, thumbnails); duplicate mounts are harmless
 * because the definitions are identical.
 *
 * All filters are original procedural textures written for this
 * project: feTurbulence noise shaped by feColorMatrix into dark grain,
 * wood streaks, burl swirls or marble veins, composited OVER the
 * square's flat color (which remains the fallback if filters are
 * unsupported). No external assets, no data: URIs — CSP unchanged.
 */
export default function ThemeFilterDefs(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute h-0 w-0"
      style={{ position: 'absolute' }}
    >
      <defs>
        {/* Fine dark grain (stone, sandstone, newspaper). */}
        <filter id="tx-grain" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="11"
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.55 0.55 0.55 0 -0.55"
            result="speck"
          />
          <feComposite in="speck" in2="SourceGraphic" operator="over" />
        </filter>
        {/* Long wood streaks (walnut). */}
        <filter id="tx-wood" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.18"
            numOctaves="3"
            seed="7"
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0.08  0 0 0 0 0.03  0 0 0 0 0  0.5 0.5 0.5 0 -0.35"
            result="streak"
          />
          <feComposite in="streak" in2="SourceGraphic" operator="over" />
        </filter>
        {/* Swirled burl figure (burled wood). */}
        <filter id="tx-burl" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves="4"
            seed="4"
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0.06  0 0 0 0 0.02  0 0 0 0 0  0.6 0.6 0.6 0 -0.5"
            result="swirl"
          />
          <feComposite in="swirl" in2="SourceGraphic" operator="over" />
        </filter>
        {/* Marble: pale veins plus a soft dark cloud (marble light/dark). */}
        <filter id="tx-marble" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="turbulence"
            baseFrequency="0.015 0.032"
            numOctaves="3"
            seed="9"
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -1.9"
            result="vein"
          />
          <feComposite in="vein" in2="SourceGraphic" operator="over" result="veined" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.35 0.35 0.35 0 -0.3"
            result="cloud"
          />
          <feComposite in="cloud" in2="veined" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * The textured-square overlay for one square: an SVG rect painted with
 * the square color and run through the named filter. Rendered inside a
 * `position: relative` square, above the flat background and below
 * highlights/pieces.
 */
export function FilteredSquare({
  filterId,
  color,
}: {
  filterId: string;
  color: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <rect width="100%" height="100%" fill={color} filter={`url(#${filterId})`} />
    </svg>
  );
}
