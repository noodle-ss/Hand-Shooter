// ═══════════════════════════════════════════════════
// window-spawner.js — HTML-in-Canvas browser window factory
// ═══════════════════════════════════════════════════

/**
 * Browser window templates — different fake websites
 */
const TEMPLATES = [
  {
    url: 'stackoverflow.com/questions/42069',
    title: 'Why is my code not working? - Stack Overflow',
    favicon: '📋',
    bodyColor: '#f6f6f6',
    content: `
      <div style="font-family:Arial,sans-serif;padding:10px;background:#fff;border-left:3px solid #f48024;">
        <div style="font-size:13px;font-weight:bold;color:#333;">Why does my JavaScript not work?</div>
        <div style="font-size:11px;color:#666;margin-top:4px;">Asked 2 hours ago · Modified today</div>
        <div style="font-size:11px;color:#999;margin-top:6px;">I tried everything but nothing works. Please help.</div>
        <div style="background:#f0f0f0;padding:6px;margin-top:6px;font-family:monospace;font-size:10px;border-radius:3px;">console.log("help");</div>
      </div>`
  },
  {
    url: 'github.com/user/awesome-repo',
    title: 'awesome-repo — GitHub',
    favicon: '🐙',
    bodyColor: '#0d1117',
    content: `
      <div style="font-family:Segoe UI,sans-serif;padding:10px;background:#0d1117;color:#e6edf3;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">📦</span>
          <span style="font-size:13px;font-weight:600;">awesome-repo</span>
          <span style="font-size:9px;border:1px solid #30363d;padding:1px 6px;border-radius:10px;color:#8b949e;">Public</span>
        </div>
        <div style="font-size:11px;color:#8b949e;margin-top:6px;">A collection of awesome things</div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:#8b949e;">
          <span>⭐ 4.2k</span><span>🍴 312</span><span>👁 89</span>
        </div>
      </div>`
  },
  {
    url: 'twitter.com/elonmusk/status',
    title: 'Elon Musk on X',
    favicon: '🐦',
    bodyColor: '#000',
    content: `
      <div style="font-family:Segoe UI,sans-serif;padding:10px;background:#000;color:#e7e9ea;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:14px;">🚀</div>
          <div>
            <div style="font-size:12px;font-weight:bold;">Elon Musk</div>
            <div style="font-size:10px;color:#71767b;">@elonmusk</div>
          </div>
        </div>
        <div style="font-size:12px;margin-top:8px;line-height:1.4;">Just mass deployed the new rocket. Gonna be huge! 🚀🔥</div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:#71767b;">
          <span>💬 42K</span><span>🔄 128K</span><span>❤️ 890K</span>
        </div>
      </div>`
  },
  {
    url: 'youtube.com/watch?v=dQw4w9',
    title: 'Never Gonna Give You Up - YouTube',
    favicon: '▶️',
    bodyColor: '#0f0f0f',
    content: `
      <div style="font-family:Roboto,sans-serif;padding:10px;background:#0f0f0f;color:#fff;">
        <div style="background:#272727;height:60px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px;">▶️</div>
        <div style="font-size:12px;font-weight:600;margin-top:8px;">Never Gonna Give You Up</div>
        <div style="font-size:10px;color:#aaa;margin-top:2px;">Rick Astley · 1.5B views · 15 years ago</div>
      </div>`
  },
  {
    url: 'reddit.com/r/programming',
    title: 'r/programming - Reddit',
    favicon: '🤖',
    bodyColor: '#1a1a1b',
    content: `
      <div style="font-family:Verdana,sans-serif;padding:10px;background:#1a1a1b;color:#d7dadc;">
        <div style="font-size:13px;font-weight:bold;color:#ff4500;">r/programming</div>
        <div style="background:#272729;padding:8px;border-radius:4px;margin-top:6px;">
          <div style="font-size:11px;font-weight:600;">TIL you can shoot browser windows with your hand</div>
          <div style="font-size:9px;color:#818384;margin-top:4px;">Posted by u/hand_shooter · 2h · 🔺 4.2k</div>
        </div>
      </div>`
  },
  {
    url: 'wikipedia.org/wiki/Canvas',
    title: 'HTML canvas - Wikipedia',
    favicon: '📖',
    bodyColor: '#fff',
    content: `
      <div style="font-family:Georgia,serif;padding:10px;background:#fff;color:#333;">
        <div style="font-size:16px;font-weight:normal;border-bottom:1px solid #a2a9b1;padding-bottom:4px;">HTML canvas element</div>
        <div style="font-size:10px;line-height:1.5;margin-top:6px;color:#555;">
          The canvas element is part of HTML5 and allows for dynamic, scriptable rendering of 2D shapes and bitmap images. It is a low level, procedural model that updates a bitmap.
        </div>
      </div>`
  },
  {
    url: 'chat.openai.com',
    title: 'ChatGPT',
    favicon: '🤖',
    bodyColor: '#212121',
    content: `
      <div style="font-family:Söhne,sans-serif;padding:10px;background:#212121;color:#ececec;">
        <div style="font-size:12px;color:#999;text-align:center;margin-bottom:8px;">ChatGPT 4o</div>
        <div style="background:#2f2f2f;padding:8px;border-radius:8px;font-size:11px;line-height:1.4;">
          Hello! How can I help you today? Would you like me to write some code or answer a question?
        </div>
      </div>`
  },
  {
    url: 'docs.google.com/spreadsheets',
    title: 'Untitled spreadsheet - Google Sheets',
    favicon: '📊',
    bodyColor: '#fff',
    content: `
      <div style="font-family:Arial,sans-serif;padding:4px;background:#fff;">
        <table style="border-collapse:collapse;width:100%;font-size:10px;">
          <tr><td style="border:1px solid #e0e0e0;padding:3px 6px;background:#f8f9fa;font-weight:bold;">A</td><td style="border:1px solid #e0e0e0;padding:3px 6px;background:#f8f9fa;font-weight:bold;">B</td><td style="border:1px solid #e0e0e0;padding:3px 6px;background:#f8f9fa;font-weight:bold;">C</td></tr>
          <tr><td style="border:1px solid #e0e0e0;padding:3px 6px;">Hello</td><td style="border:1px solid #e0e0e0;padding:3px 6px;">World</td><td style="border:1px solid #e0e0e0;padding:3px 6px;">42</td></tr>
          <tr><td style="border:1px solid #e0e0e0;padding:3px 6px;">Foo</td><td style="border:1px solid #e0e0e0;padding:3px 6px;">Bar</td><td style="border:1px solid #e0e0e0;padding:3px 6px;">99</td></tr>
        </table>
      </div>`
  }
];

// Cache: imageData per template index
const imageCache = new Map();

/**
 * Generate SVG data URL for a browser-window-like frame
 */
function buildWindowSVG(template, width, height) {
  const chromeH = 32;
  const bodyH = height - chromeH;

  // Escape HTML for embedding in SVG foreignObject
  const svgStr = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <clipPath id="winClip">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" ry="8"/>
    </clipPath>
  </defs>
  <g clip-path="url(#winClip)">
    <!-- Window chrome -->
    <rect x="0" y="0" width="${width}" height="${chromeH}" fill="#1e1e2e"/>
    <!-- Traffic lights -->
    <circle cx="14" cy="${chromeH/2}" r="5" fill="#ff5f57"/>
    <circle cx="30" cy="${chromeH/2}" r="5" fill="#febc2e"/>
    <circle cx="46" cy="${chromeH/2}" r="5" fill="#28c840"/>
    <!-- URL bar -->
    <rect x="60" y="7" width="${width - 74}" height="18" rx="4" fill="#313244"/>
    <foreignObject x="64" y="7" width="${width - 82}" height="18">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:10px;color:#89b4fa;line-height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
        🔒 ${template.url}
      </div>
    </foreignObject>
    <!-- Body -->
    <rect x="0" y="${chromeH}" width="${width}" height="${bodyH}" fill="${template.bodyColor}"/>
    <foreignObject x="0" y="${chromeH}" width="${width}" height="${bodyH}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${bodyH}px;overflow:hidden;">
        ${template.content}
      </div>
    </foreignObject>
    <!-- Border -->
    <rect x="0" y="0" width="${width}" height="${height}" rx="8" ry="8" fill="none" stroke="#45475a" stroke-width="1.5"/>
  </g>
</svg>`;

  return svgStr;
}

/**
 * Create an Image from a template
 * @param {number} templateIndex
 * @param {number} width
 * @param {number} height
 * @returns {Promise<HTMLImageElement>}
 */
export function createWindowImage(templateIndex, width = 260, height = 180) {
  const cacheKey = `${templateIndex}-${width}-${height}`;
  if (imageCache.has(cacheKey)) {
    return Promise.resolve(imageCache.get(cacheKey));
  }

  const template = TEMPLATES[templateIndex % TEMPLATES.length];
  const svgStr = buildWindowSVG(template, width, height);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(cacheKey, img);
      URL.revokeObjectURL(url);  // Safe to revoke — browser has decoded the image
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * @typedef {Object} FloatingWindow
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} rotation
 * @property {number} rotationSpeed
 * @property {number} width
 * @property {number} height
 * @property {number} scale
 * @property {boolean} alive
 * @property {boolean} hit
 * @property {number} hitTimer
 * @property {number} templateIndex
 * @property {HTMLImageElement|null} image
 * @property {number} opacity
 * @property {number} glowIntensity
 */

let nextId = 0;

/**
 * Create a new floating window object
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {FloatingWindow}
 */
export function spawnWindow(canvasW, canvasH) {
  const templateIndex = Math.floor(Math.random() * TEMPLATES.length);
  const w = 220 + Math.random() * 80;
  const h = 150 + Math.random() * 60;
  const scale = 0.7 + Math.random() * 0.5;

  // Spawn within visible screen area so windows are always shootable
  const halfW = (w * scale) / 2;
  const halfH = (h * scale) / 2;
  const padding = 30;

  // Place within safe screen bounds
  const x = padding + halfW + Math.random() * (canvasW - 2 * padding - w * scale);
  const y = padding + halfH + Math.random() * (canvasH * 0.6 - padding - halfH);

  // Gentle random drift — very slow movement
  const vx = (Math.random() - 0.5) * 0.6;
  const vy = (Math.random() - 0.3) * 0.3;

  const win = {
    id: nextId++,
    x, y, vx, vy,
    rotation: (Math.random() - 0.5) * 0.3,
    rotationSpeed: (Math.random() - 0.5) * 0.015,
    width: w,
    height: h,
    scale,
    alive: true,
    hit: false,
    hitTimer: 0,
    templateIndex,
    image: null,
    opacity: 1,
    glowIntensity: 0
  };

  // Async load image
  createWindowImage(templateIndex, Math.round(w), Math.round(h)).then(img => {
    win.image = img;
  });

  return win;
}

export function getTemplateCount() {
  return TEMPLATES.length;
}
