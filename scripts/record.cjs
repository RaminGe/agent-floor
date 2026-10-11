// Records a marketing video of the real interface. Nothing is generated: it is
// the actual app, driven by a script, captured frame by frame off-screen and
// streamed into ffmpeg.
//
//   FFMPEG=/path/to/ffmpeg npx electron scripts/record.cjs out.mp4
//
// Needs a running floor (agent-floor start). Uses the in-browser demo agents.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.on('uncaughtException', (e) => console.error('[record] uncaught', e));
// REC_W / REC_H are CSS pixels, REC_SCALE the device pixel ratio.
// Reels: REC_W=540 REC_H=960 REC_SCALE=2 gives a sharp 1080x1920 phone layout.
const CSS_W = Number(process.env.REC_W) || 1920;
const CSS_H = Number(process.env.REC_H) || 1080;
const SCALE = Number(process.env.REC_SCALE) || 1;
app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE));
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const FPS = 30;
const W = CSS_W * SCALE;
const H = CSS_H * SCALE;
const PORTRAIT = CSS_H > CSS_W;
const out = path.resolve(process.argv[2] || 'marketing/agent-floor.mp4');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PORT = Number(process.env.AGENT_FLOOR_PORT) || 4317;
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

// Captions and cards, styled like the app's own glass UI.
const OVERLAY_CSS = `
  .stats, .demo-note, .hint, .mode { display: none !important; }
  #rec { position: fixed; inset: 0; z-index: 50; pointer-events: none; font-family: 'Geist Variable', system-ui, sans-serif; }
  #rec .rc {
    position: absolute; inset: 0; display: grid; place-items: center; text-align: center;
    background: radial-gradient(ellipse at center, rgba(12,15,20,0.55), rgba(12,15,20,0.82));
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    color: #f4f6f8; opacity: 0; transition: opacity 900ms ease;
  }
  #rec .rc.on { opacity: 1; }
  #rec .rc .inner { transform: translateY(14px) scale(0.985); transition: transform 1200ms cubic-bezier(0.22,1,0.36,1); }
  #rec .rc.on .inner { transform: none; }
  #rec .mark { display: inline-grid; grid-template-columns: 34px 34px; gap: 7px; margin-bottom: 34px; }
  #rec .mark i { width: 34px; height: 34px; border-radius: 10px; background: #8a94a6; }
  #rec .mark i:first-child { background: #ff5f2e; }
  #rec h1 { margin: 0; font-size: min(112px, 13vw); line-height: 1.02; letter-spacing: -0.035em; font-weight: 750; }
  #rec .sub { margin-top: 22px; font-size: min(34px, 4.6vw); color: rgba(244,246,248,0.72); letter-spacing: -0.01em; font-weight: 500; }
  #rec .cmd {
    display: inline-block; margin-top: 44px; padding: 18px 30px; border-radius: 999px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.16);
    font: 600 min(32px, 4.4vw)/1 'Geist Mono Variable', ui-monospace, monospace; color: #fff;
  }
  #rec .url { margin-top: 22px; font: 500 24px/1 'Geist Mono Variable', ui-monospace, monospace; color: rgba(244,246,248,0.6); }
  #rec .cap {
    position: absolute; left: 50%; bottom: 120px; transform: translate(-50%, 18px);
    padding: 22px 34px; border-radius: 26px; max-width: 1200px; text-align: center;
    background: rgba(255,255,255,0.86); color: #141821;
    backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
    border: 1px solid rgba(255,255,255,0.8);
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -18px rgba(20,28,44,0.45);
    font-size: 40px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15;
    opacity: 0; transition: opacity 500ms ease, transform 700ms cubic-bezier(0.22,1,0.36,1);
  }
  #rec .cap.on { opacity: 1; transform: translate(-50%, 0); }
  @media (orientation: portrait) {
    /* Phones: captions sit at the top, clear of the bottom sheet and team dock. */
    #rec .cap { bottom: auto; top: 118px; width: calc(100vw - 32px); max-width: none; padding: 16px 18px; border-radius: 20px; font-size: 22px; transform: translate(-50%, -12px); }
    #rec .cap small { font-size: 15px !important; margin-top: 6px !important; }
    #rec .mark { grid-template-columns: 22px 22px; gap: 5px; margin-bottom: 22px; }
    #rec .mark i { width: 22px; height: 22px; border-radius: 7px; }
    #rec .cmd { padding: 12px 20px; margin-top: 30px; }
    #rec .url { font-size: 14px; }
    .topbar { top: 16px !important; }
  }
  #rec .cap small { display: block; margin-top: 8px; font-size: 24px; font-weight: 500; color: #586172; letter-spacing: -0.005em; }
  :root[data-theme='dark'] #rec .cap { background: rgba(26,30,38,0.88); color: #eef1f5; border-color: rgba(255,255,255,0.1); }
  :root[data-theme='dark'] #rec .cap small { color: #a3acbb; }
`;

const OVERLAY_HTML = `
  <div class="rc" id="title"><div class="inner">
    <div class="mark"><i></i><i></i><i></i><i></i></div>
    <h1>Agent Floor</h1>
    <div class="sub">A live 3D office for your coding agents</div>
  </div></div>
  <div class="cap" id="cap"></div>
  <div class="rc" id="outro"><div class="inner">
    <div class="mark"><i></i><i></i><i></i><i></i></div>
    <h1>Agent Floor</h1>
    <div class="sub">Open source. Runs on your machine.</div>
    <div class="cmd">npm i -g agent-floor</div>
    <div class="url">github.com/develop212/agent-floor</div>
  </div></div>
`;

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Raw BGRA frames in, H.264 out. ffmpeg encodes on its own cores.
  const ff = spawn(FFMPEG, [
    '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    // Hardware H.264 on macOS keeps up in real time; libx264 elsewhere.
    ...(process.platform === 'darwin'
      ? ['-c:v', 'h264_videotoolbox', '-b:v', '24M', '-maxrate', '30M', '-profile:v', 'high']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16']),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((r) => ff.on('close', (code) => (console.error('[record] ffmpeg exited', code), r())));
  ff.stdin.on('error', (e) => console.error('[record] ffmpeg stdin', e.message));

  const win = new BrowserWindow({
    width: CSS_W,
    height: CSS_H,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, partition: `rec-${Date.now()}` },
  });
  win.webContents.setFrameRate(FPS);

  // Frame capture: place each painted frame on a fixed 30 fps timeline,
  // repeating the last frame if a paint is late, so playback speed is exact.
  let t0 = 0;
  let recording = false;
  let last = -1;
  let lastFrame = null;
  let repeats = 0;
  win.webContents.on('paint', (_e, _dirty, image) => {
    if (!recording) return;
    const idx = Math.round(((performance.now() - t0) / 1000) * FPS);
    if (idx <= last) return;
    const size = image.getSize();
    // If the encoder falls behind, hold the previous frame rather than queueing gigabytes.
    if (ff.stdin.writableLength > 400 * 1024 * 1024) return;
    const frame = (size.width !== W ? image.resize({ width: W, height: H, quality: 'good' }) : image).toBitmap();
    for (let i = last + 1; i < idx && lastFrame; i++) {
      ff.stdin.write(lastFrame);
      repeats++;
    }
    ff.stdin.write(frame);
    last = idx;
    lastFrame = frame;
  });

  await win.loadURL(`http://127.0.0.1:${PORT}/?demo&stats&rec`);
  await win.webContents.insertCSS(OVERLAY_CSS);
  const js = (code) => win.webContents.executeJavaScript(code);
  await js(`(() => { const d = document.createElement('div'); d.id = 'rec'; d.innerHTML = ${JSON.stringify(OVERLAY_HTML)}; document.body.append(d); })()`);
  const caption = (text, sub = '') =>
    js(`(() => { const c = document.getElementById('cap'); c.classList.remove('on'); setTimeout(() => { c.innerHTML = ${JSON.stringify(text)} + (${JSON.stringify(sub)} ? '<small>' + ${JSON.stringify(sub)} + '</small>' : ''); c.classList.add('on'); }, ${text ? 420 : 0}); })()`);
  const hideCaption = () => js(`document.getElementById('cap').classList.remove('on')`);
  const ev = (o) => js(`__store.applyLocal(${JSON.stringify(o)})`);

  // ------------------------------------------------------------ the script
  await js(`(() => { const t = document.getElementById('title'); t.style.transition = 'none'; t.querySelector('.inner').style.transition = 'none'; t.classList.add('on'); t.offsetWidth; setTimeout(() => { t.style.transition = ''; t.querySelector('.inner').style.transition = ''; }, 50); })()`);
  await wait(0.6);
  t0 = performance.now();
  recording = true;

  await wait(4.2);
  await js(`document.getElementById('title').classList.remove('on')`);
  await wait(1.0);
  await caption('Every coding agent gets a character and a desk.', 'They walk in the moment a session starts.');
  await wait(7.5);

  await js(`__floor.focusTeam('checkout-redesign')`);
  await caption('Each team works in its own office.', 'Helpers get briefed with a paper plane and report back the same way.');
  await wait(8);

  await js(`__floor.focusAgent('ledger')`);
  await ev({ type: 'tool', agent: 'ledger', tool: 'Edit', activity: 'Editing orders/service.py', ts: Date.now() });
  await caption('Their screens show exactly what they are doing.', 'Every tool call, live: edits, tests, searches, shell commands.');
  await wait(7);

  await js(`__store.select('pixel')`);
  await ev({ type: 'tool', agent: 'pixel', tool: 'Edit', activity: 'Editing CheckoutForm.tsx', ts: Date.now() });
  await caption('Click anyone for live status and history.');
  await wait(7);

  // Frame the two offices that face each other across the corridor.
  await js(`(() => { __store.select(null); const a = __floor.rooms.get('checkout-redesign').center, b = __floor.rooms.get('auth-service').center; const t = a.clone().add(b).multiplyScalar(0.5); t.y = 0.8; const p = t.clone(); if (${PORTRAIT}) { p.x += 2; p.y += 24; p.z += 13; } else { p.x += 9; p.y += 17; p.z += 15; } __floor.flyTo(t, p, null); })()`);
  await caption('Watch work move between teams.', 'Messages fly as paper planes, coloured by the sender’s team.');
  await wait(1.2);
  await ev({ type: 'message', agent: 'relay', to: 'ledger', text: 'New token format is live', ts: Date.now() });
  await wait(2.2);
  await ev({ type: 'message', agent: 'ledger', to: 'probe', text: 'Price includes tax now', ts: Date.now() });
  await wait(2.2);
  await ev({ type: 'message', agent: 'warden', to: 'atlas', text: 'Auth is ready for checkout', ts: Date.now() });
  await wait(2.6);

  await js(`__floor.focusTeam('auth-service')`);
  await ev({ type: 'status', agent: 'warden', status: 'waiting', activity: 'Needs your approval to push', ts: Date.now() });
  await caption('And they raise a hand when they need you.');
  await wait(7);

  // Portrait: orbit one lit office; landscape: the whole building.
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' })); ${PORTRAIT ? "__floor.focusTeam('checkout-redesign')" : '__floor.frameAll()'}`);
  await caption('Day shift. Night shift.', 'Desk lamps and monitors glow after dark.');
  await wait(3.5);
  await js(`__floor.controls.autoRotate = true; __floor.controls.autoRotateSpeed = 0.6`);
  await wait(4);
  await js(`__floor.controls.autoRotate = false`);

  await hideCaption();
  await js(`__hud.openSheet()`);
  await caption('Works with Claude Code, Codex, Cursor, or anything that speaks HTTP.');
  await wait(2.6);
  await js(`document.querySelector('.tab[data-tab="codex"]').click()`);
  await wait(2.2);
  await js(`document.querySelector('.tab[data-tab="cursor"]').click()`);
  await wait(2.2);
  await js(`document.querySelector('.tab[data-tab="http"]').click()`);
  await wait(2.2);
  await hideCaption();
  await js(`__hud.closeSheet()`);
  await wait(0.6);

  await js(`document.getElementById('outro').classList.add('on')`);
  await wait(6.5);

  recording = false;
  ff.stdin.end();
  await done;
  console.log(`recorded ${last + 1} frames (${((last + 1) / FPS).toFixed(1)} s, ${repeats} repeated) into ${out}`);
  app.quit();
});
