// A switch tester drawn in an oblique projection. All dimensions below are
// in drawing units; the backing store is scaled to the canvas's CSS size.
const ink = '#27291f';
const ivory = { top: '#f9f5e7', light: '#eee9d7', dark: '#bdbbaa', line: '#626455' };
const red = { top: '#f1704e', light: '#df6245', dark: '#b94a32', line: '#743d2e' };
const chassis = { top: '#dcdcc9', light: '#c2c4af', dark: '#939784', line: '#5b604f' };
const graphite = { top: '#73786b', light: '#545b51', dark: '#393d36', line: '#282e26' };

function project(x, y, z) {
  return [x + .64 * y, -.27 * x + .52 * y - z];
}

function surface(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx, from, to, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Keep corresponding vertices on each ring, including the rounded corners.
function ring(x, y, z, w, d, radius, dish = 0) {
  const points = [];
  for (let corner = 0; corner < 4; corner++) {
    for (let i = 0; i <= 6; i++) {
      const angle = Math.PI / 2 * (corner + i / 6);
      const cx = (corner === 0 || corner === 3 ? 1 : -1) * (w / 2 - radius);
      const cy = (corner < 2 ? 1 : -1) * (d / 2 - radius);
      const dx = cx + Math.cos(angle) * radius;
      const dy = cy + Math.sin(angle) * radius;
      points.push(project(x + dx, y + dy, z - dish * (1 - (2 * dx / w) ** 2)));
      // Intermediate vertices on both long edges model the key's concave dish.
      if (i === 6 && (corner === 0 || corner === 2)) {
        for (let k = 1; k <= 11; k++) {
          const mx = cx * (1 - 2 * k / 12);
          points.push(project(x + mx, y + dy, z - dish * (1 - (2 * mx / w) ** 2)));
        }
      }
    }
  }
  return points;
}

// The two rings form a tapered solid. Draw individual faces from back to front.
function solid(ctx, x, y, bottom, top, palette, outline = 1.35) {
  const lower = ring(x, y, ...bottom);
  const upper = ring(x, y, ...top);
  const faces = lower.map((point, i) => {
    const next = (i + 1) % lower.length;
    const a = lower[i], b = lower[next];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const front = dx < 0;
    return {
      points: [point, b, upper[next], upper[i]],
      depth: a[1] + b[1],
      color: front && dy / dx < .35 ? palette.light : palette.dark,
    };
  });
  faces.sort((a, b) => a.depth - b.depth);
  surface(ctx, lower, palette.dark, ink, outline * 1.7);
  for (const face of faces) surface(ctx, face.points, face.color, face.color, .48);
  surface(ctx, upper, palette.top, ink, outline);
  return { lower, upper };
}

function sideHatching(ctx, x, y, z, palette) {
  for (const face of ['left', 'front']) {
    const front = face === 'front';
    const count = front ? 39 : 56;
    const at = (t, u) => {
      const extent = 56 - 12 * t;
      const dx = front ? u * (extent - 7) : -extent;
      const dy = front ? extent : u * (extent - 7);
      return project(x + dx, y + dy, z + 6 + 39 * t - 2.8 * t * (1 - (dx / extent) ** 2));
    };
    for (let n = 0; n < count; n++) {
      const u = -1 + 2 * n / (count - 1);
      // Shorter cuts towards the center leave a soft reflection in the engraving.
      const length = front ? .24 + .56 * u ** 2 : .69 + .17 * Math.abs(u);
      line(ctx, at(.09, u), at(length, u + .045), palette.line, front ? .57 : .68);
    }
  }
}

function topMark(ctx, x, y, z, draw) {
  ctx.save();
  ctx.transform(1, -.27, .64, .52, ...project(x, y, z));
  draw();
  ctx.restore();
}

function cap(ctx, x, height, letter, accent) {
  const palette = accent ? red : ivory;
  solid(ctx, x, 0, [height, 115, 115, 8], [height + 5, 113, 113, 8], graphite, 1);
  const { lower, upper } = solid(ctx, x, 0,
    [height + 5, 114, 114, 8],
    [height + 46, 88, 88, 9, 2.8], palette, 1.7);
  sideHatching(ctx, x, 0, height, palette);
  // Re-ink the silhouette generators after cutting the hatch lines.
  const extremes = [0, 0];
  lower.forEach(([px], i) => {
    if (px < lower[extremes[0]][0]) extremes[0] = i;
    if (px > lower[extremes[1]][0]) extremes[1] = i;
  });
  for (const i of extremes) line(ctx, lower[i], upper[i], ink, 1.3);
  surface(ctx, ring(x, 0, height + 46.3, 83, 83, 8, 2.8), null,
    accent ? '#ffb18f' : '#fffff2', 1);
  topMark(ctx, x, -2, height + 43.5, () => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px Helvetica, Arial, sans-serif';
    ctx.fillStyle = accent ? '#ffd2aa' : '#fffdf0';
    ctx.fillText(letter, 0, 1);
    ctx.fillStyle = ink;
    ctx.fillText(letter, 0, 0);
    if (letter === 'F' || letter === 'J') {
      ctx.fillStyle = palette.dark;
      ctx.fillRect(-10, 31, 20, 2);
      ctx.fillStyle = palette.top;
      ctx.fillRect(-10, 33, 20, 1);
    }
  });
}

function switchSocket(ctx) {
  solid(ctx, 0, 0, [0, 79, 79, 4], [4, 79, 79, 4], graphite, 1.2);
  solid(ctx, 0, 0, [4, 73, 73, 4], [15, 64, 64, 3], ivory, 1.1);
  surface(ctx, ring(0, 0, 15, 39, 39, 2), '#41453b', ink, .95);
  for (const side of [-1, 1]) {
    surface(ctx, ring(side * 26, 0, 15, 5, 18, 1), '#969a88', ink, .7);
  }
  solid(ctx, 0, 0, [14, 28, 28, 2], [21, 28, 28, 2], red, .85);
  const cross = [[-4,-12],[4,-12],[4,-4],[12,-4],[12,4],[4,4],
    [4,12],[-4,12],[-4,4],[-12,4],[-12,-4],[-4,-4]];
  surface(ctx, cross.map(([x,y]) => project(x,y,24)), red.dark, ink, 1);
  surface(ctx, cross.map(([x,y]) => project(x,y,30)), red.top, ink, 1);
}

function plate(ctx) {
  const shadow = ring(8, 7, -17, 387, 146, 11);
  surface(ctx, shadow, '#df8768', null);
  solid(ctx, 0, 0, [-13, 387, 146, 10], [0, 387, 146, 10], chassis, 1.8);
  surface(ctx, ring(0, 0, .1, 379, 138, 9), null, '#8d9381', .72);
  for (const x of [-183, 183]) {
    for (const y of [-60, 60]) {
      topMark(ctx, x, y, .3, () => {
        ctx.fillStyle = '#e5e6d6';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        line(ctx, [-2, 1.7], [2, -1.7], ink, .9);
      });
    }
  }
  for (let x = -180; x <= 180; x += 3.7) {
    line(ctx, project(x,73,-11), project(x + 2.5,73,-4), '#727a69', .55);
  }
}

const legends = {
  f: ['D', 'F', 'G'],
  j: ['H', 'J', 'K'],
  g: ['F', 'G', 'H'],
};

/** Draw a printable-style study of the selected key on a transparent background. */
export function drawKeyStudy(canvas, command = 'f') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(canvas.ownerDocument.defaultView.devicePixelRatio, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const scale = Math.min(width / 535, height / 339);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale,
    dpr * (width / 2 - 4 * scale), dpr * (height / 2 + 38 * scale));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const letters = legends[command] || legends.f;
  plate(ctx);
  cap(ctx, 122, 6, letters[2], false);
  switchSocket(ctx);
  // Projection lines trace the lifted cap back to the central switch.
  ctx.setLineDash([3, 4]);
  for (const x of [-25, 25]) {
    line(ctx, project(x, -10, 23), project(x, -10, 103), '#717462', .8);
  }
  ctx.setLineDash([]);
  cap(ctx, -122, 6, letters[0], false);
  cap(ctx, 0, 102, letters[1], true);
}
