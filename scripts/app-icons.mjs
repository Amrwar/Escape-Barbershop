/**
 * The phone app's icons and splash, made from the shop's own logo.
 *
 *   node scripts/app-icons.mjs
 *
 * The logo (public/icon-512.png) is white artwork on black. Its brightness is
 * used as a mask, so the artwork can be set in any colour on any ground; the
 * mask is enlarged and its edges re-sharpened rather than the picture simply
 * stretched, since the source is half the size an app icon needs.
 *
 * Everything is the app's Mashrabiya look: indigo ground, a faint amber star
 * lattice, and the logo in cream inside an arched window edged in amber — the
 * same arch as the sign-in door. Writes into mobile/assets.
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "public/icon-512.png");
const OUT = path.join(root, "mobile/assets");

const INDIGO = "#14213d";
const DEEP = "#0d162b";
const CREAM = "#f3ead8";
const AMBER = "#f0b36a";

/** The logo's artwork as an alpha mask at `width` px, edges crisp. */
async function logoMask(width) {
  // The source has a wide black margin; trim it so the artwork fills its place.
  // Flattened onto black first: the source carries an alpha channel, which would
  // otherwise come through as a second value per pixel and stripe the mask.
  const trimmed = await sharp(SOURCE).flatten({ background: "#000000" }).trim({ threshold: 40 }).toBuffer();
  const { data, info } = await sharp(trimmed)
    .greyscale()
    .resize({ width, kernel: "lanczos3" })
    // A steep curve on the brightness: soft upscaled edges become clean ones.
    .linear(2.2, -160)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The logo in one colour, transparent everywhere else. */
async function logoIn(colour, width) {
  const mask = await logoMask(width);
  return sharp({ create: { width: mask.width, height: mask.height, channels: 3, background: colour } })
    .joinChannel(mask.data, { raw: { width: mask.width, height: mask.height, channels: 1 } })
    .png()
    .toBuffer();
}

/** The star lattice as an SVG tile repeated across `size`. */
function lattice(size, cell, opacity) {
  const q = cell / 4;
  const h = cell / 2;
  return `<defs><pattern id="star" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">
    <rect x="${q}" y="${q}" width="${h}" height="${h}" fill="none" stroke="${AMBER}" stroke-width="${cell / 28}"/>
    <rect x="${q}" y="${q}" width="${h}" height="${h}" fill="none" stroke="${AMBER}" stroke-width="${cell / 28}" transform="rotate(45 ${h} ${h})"/>
  </pattern></defs>
  <rect width="${size}" height="${size}" fill="url(#star)" opacity="${opacity}"/>`;
}

/** An arched window: round top, near-square foot, centred in `size`. */
function arch(size, width, height, { fill, stroke, strokeWidth }) {
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  const r = width / 2;
  const foot = width * 0.03;
  const d = `M ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + width} ${y + r} L ${x + width} ${y + height - foot}
    Q ${x + width} ${y + height} ${x + width - foot} ${y + height} L ${x + foot} ${y + height}
    Q ${x} ${y + height} ${x} ${y + height - foot} Z`;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`);

/**
 * The mark: arch and logo on a transparent ground, `size` square, the arch
 * `scale` of the width. The logo sits low in the arch, where a doorway's
 * light falls.
 */
async function mark(size, scale) {
  const archW = Math.round(size * scale);
  const archH = Math.round(archW * 1.18);
  const logoW = Math.round(archW * 0.74);
  const logo = await logoIn(CREAM, logoW);
  const { height: logoH } = await sharp(logo).metadata();
  const archTop = (size - archH) / 2;
  return sharp(svg(size, arch(size, archW, archH, { fill: DEEP, stroke: AMBER, strokeWidth: Math.max(2, size / 170) })))
    .composite([{ input: logo, left: Math.round((size - logoW) / 2), top: Math.round(archTop + archH * 0.58 - logoH / 2) }])
    .png()
    .toBuffer();
}

async function main() {
  const S = 1024;

  // iOS and older Android: one opaque square. The stores refuse transparency.
  const ground = svg(S, `<rect width="${S}" height="${S}" fill="${INDIGO}"/>${lattice(S, 92, 0.11)}`);
  // Composite first, then flatten: sharp composites last in a pipeline, so a
  // flatten in the same one would leave the alpha channel in place.
  const icon = await sharp(ground).composite([{ input: await mark(S, 0.62) }]).png().toBuffer();
  await sharp(icon).flatten({ background: INDIGO }).png().toFile(path.join(OUT, "icon.png"));

  // Android adaptive: the ground and the mark as separate layers. The OS crops
  // to a circle or squircle, so the mark keeps inside the middle two-thirds.
  await sharp(ground).flatten({ background: INDIGO }).png().toFile(path.join(OUT, "android-icon-background.png"));
  await sharp(await mark(S, 0.5)).png().toFile(path.join(OUT, "android-icon-foreground.png"));

  // Android 13 themed icons: the logo alone, one colour, which the OS tints.
  const mono = await logoIn("#ffffff", Math.round(S * 0.5));
  const { height: monoH } = await sharp(mono).metadata();
  await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mono, left: Math.round(S * 0.25), top: Math.round((S - monoH) / 2) }])
    .png()
    .toFile(path.join(OUT, "android-icon-monochrome.png"));

  // The splash: the arch and logo, shown on the indigo set in app.json.
  await sharp(await mark(S, 0.8)).png().toFile(path.join(OUT, "splash-icon.png"));

  // The browser tab, for the web preview.
  await sharp(path.join(OUT, "icon.png")).resize(48, 48).png().toFile(path.join(OUT, "favicon.png"));

  console.log("Wrote icon, Android layers, splash and favicon to mobile/assets");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
