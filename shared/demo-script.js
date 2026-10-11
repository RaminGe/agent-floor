// A believable, endless stream of agent activity. Used by `agent-floor demo`
// and by the web app when no server is reachable (for example the hosted demo).

const TEAMS = [
  {
    team: 'Checkout redesign',
    task: 'Ship one-page checkout',
    members: [
      { agent: 'atlas', name: 'Atlas', role: 'Lead', source: 'claude-code' },
      { agent: 'pixel', name: 'Pixel', role: 'Frontend', source: 'claude-code', parent: 'atlas' },
      { agent: 'ledger', name: 'Ledger', role: 'Backend', source: 'claude-code', parent: 'atlas' },
      { agent: 'probe', name: 'Probe', role: 'Tests', source: 'claude-code', parent: 'atlas' },
    ],
  },
  {
    team: 'Auth service',
    task: 'Rotate refresh tokens',
    members: [
      { agent: 'warden', name: 'Warden', role: 'Lead', source: 'codex' },
      { agent: 'cipher', name: 'Cipher', role: 'Security', source: 'codex', parent: 'warden' },
      { agent: 'relay', name: 'Relay', role: 'API', source: 'codex', parent: 'warden' },
    ],
  },
  {
    team: 'Docs site',
    task: 'Migrate guides to MDX',
    members: [
      { agent: 'quill', name: 'Quill', role: 'Lead', source: 'cursor' },
      { agent: 'scout', name: 'Scout', role: 'Research', source: 'cursor', parent: 'quill' },
    ],
  },
];

const WORK = {
  Lead: [
    ['TodoWrite', 'Updating the plan'],
    ['Read', 'Reading ARCHITECTURE.md'],
    ['Grep', 'Searching for "TODO(checkout)"'],
    ['Bash', 'Running git diff --stat'],
  ],
  Frontend: [
    ['Edit', 'Editing CheckoutForm.tsx'],
    ['Edit', 'Editing PaymentSheet.tsx'],
    ['Write', 'Writing AddressFields.tsx'],
    ['Bash', 'Running pnpm lint'],
    ['Read', 'Reading tokens.css'],
  ],
  Backend: [
    ['Edit', 'Editing orders/service.py'],
    ['Write', 'Writing migrations/0042_cart.sql'],
    ['Bash', 'Running pytest orders'],
    ['Grep', 'Searching for "def create_order"'],
  ],
  Tests: [
    ['Write', 'Writing checkout.spec.ts'],
    ['Bash', 'Running playwright test'],
    ['Bash', 'Running vitest --run'],
    ['Read', 'Reading coverage report'],
  ],
  Security: [
    ['Grep', 'Searching for "jwt.decode"'],
    ['Read', 'Reading token_store.go'],
    ['Bash', 'Running gosec ./...'],
  ],
  API: [
    ['Edit', 'Editing handlers/refresh.go'],
    ['Bash', 'Running go test ./auth/...'],
    ['Write', 'Writing openapi/refresh.yaml'],
  ],
  Research: [
    ['WebFetch', 'Reading mdxjs.com'],
    ['WebSearch', 'Searching the web for "mdx 3 migration"'],
    ['Read', 'Reading docs/guides/index.md'],
  ],
  Explorer: [
    ['Glob', 'Finding **/*.test.ts'],
    ['Grep', 'Searching for "useCart"'],
    ['Read', 'Reading cart/store.ts'],
  ],
};

const CHAT = {
  Lead: ['Pixel, take the address step', 'Ledger, the order API needs idempotency keys', 'Probe, cover the declined-card path', 'Good. Merge when green.', 'Can you split that PR?'],
  Frontend: ['Form is wired, need the price endpoint', 'Pushed a draft, take a look', 'Which error copy do we use?'],
  Backend: ['Endpoint is live on /v2/orders', 'Migration is reversible', 'Price includes tax now'],
  Tests: ['3 tests failing on Safari', 'All green on CI', 'Found a race in submit'],
  Security: ['Refresh tokens must be single-use', 'Rotation looks safe', 'Please hash the token at rest'],
  API: ['Updated the contract', 'Need the new token format', 'Shipping behind a flag'],
  Research: ['Found the official migration guide', 'Two plugins break on MDX 3', 'Summary is in notes.md'],
  Explorer: ['Found 14 call sites', 'Report ready'],
};

const THINK = ['Planning the next step', 'Reading the failing test', 'Comparing two approaches', 'Checking edge cases', 'Weighing the trade-offs'];

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_TEAMS = ['Payments', 'Search', 'Mobile app', 'Infra', 'Billing', 'Analytics', 'Onboarding', 'Notifications', 'Design system', 'Data pipeline'];
const EXTRA_ROLES = ['Frontend', 'Backend', 'Tests', 'Security', 'API', 'Research'];
const EXTRA_NAMES = ['Orbit', 'Quartz', 'Ember', 'Nimbus', 'Sable', 'Juniper', 'Flint', 'Mosaic', 'Harbor', 'Vesper', 'Cobalt', 'Lumen', 'Tundra', 'Kestrel', 'Onyx', 'Fable', 'Rune', 'Sorrel'];

/**
 * @param {number} [seed]
 * @param {{ agents?: number }} [opts] agents: total agents to reach (stress testing)
 */
export function createScript(seed = Date.now(), opts = {}) {
  const rand = mulberry32(seed);
  const queue = [];
  const all = [];
  const teams = TEAMS.map((t) => ({ ...t, members: [...t.members] }));
  // Stress mode: add generated teams of 4 to 8 agents until we reach the target.
  let count = teams.reduce((n, t) => n + t.members.length, 0);
  for (let i = 0; count < (opts.agents || 0); i++) {
    const team = EXTRA_TEAMS[i % EXTRA_TEAMS.length] + (i >= EXTRA_TEAMS.length ? ` ${Math.floor(i / EXTRA_TEAMS.length) + 1}` : '');
    const size = Math.min(4 + Math.floor(rand() * 5), opts.agents - count);
    const lead = `lead-${i}`;
    const members = [{ agent: lead, name: EXTRA_NAMES[i % EXTRA_NAMES.length], role: 'Lead', source: ['claude-code', 'codex', 'cursor'][i % 3] }];
    for (let m = 1; m < size; m++)
      members.push({ agent: `a-${i}-${m}`, name: EXTRA_NAMES[(i * 3 + m) % EXTRA_NAMES.length], role: EXTRA_ROLES[(i + m) % EXTRA_ROLES.length], source: members[0].source, parent: lead });
    teams.push({ team, task: `Ship ${team.toLowerCase()} v2`, members });
    count += size;
  }

  // Arrivals: leads first, then their crew walks in one by one.
  for (const t of teams) {
    const [lead, ...crew] = t.members;
    const leadEv = { ...lead, team: t.team };
    all.push(leadEv);
    queue.push({ wait: opts.agents ? 150 : 700, events: [{ type: 'join', ...leadEv, status: 'thinking', activity: 'Reading the brief' }] });
    queue.push({ wait: 500, events: [{ type: 'task', agent: lead.agent, team: t.team, task: t.task }] });
    for (const m of crew) {
      const ev = { ...m, team: t.team };
      all.push(ev);
      queue.push({ wait: opts.agents ? 150 : 900, events: [{ type: 'join', ...ev, status: 'thinking', activity: 'Getting briefed', text: pick(CHAT.Lead, rand) }] });
    }
  }

  let helper = null;
  let tick = 0;

  function randomStep() {
    tick++;
    const a = pick(all, rand);
    const r = rand();

    // Now and then a lead spawns a short-lived helper.
    if (!helper && tick % 23 === 0) {
      const lead = all.find((x) => x.role === 'Lead' && x.team === a.team) || all[0];
      helper = { agent: `${lead.agent}-explorer-${tick}`, name: 'Explorer', role: 'Explorer', source: lead.source, team: lead.team, parent: lead.agent, left: 6 };
      return { wait: 900, events: [{ type: 'join', ...helper, status: 'thinking', activity: 'Mapping the codebase', text: 'Find every cart call site' }] };
    }
    if (helper && rand() < 0.35) {
      helper.left--;
      if (helper.left <= 0) {
        const h = helper;
        helper = null;
        return {
          wait: 1200,
          events: [
            { type: 'message', agent: h.agent, to: h.parent, text: 'Report ready', status: 'done' },
            { type: 'status', agent: h.agent, status: 'done', activity: 'Handed back results' },
          ],
        };
      }
      const [tool, activity] = pick(WORK.Explorer, rand);
      return { wait: 700, events: [{ type: 'tool', agent: helper.agent, tool, activity }] };
    }

    if (r < 0.5) {
      const [tool, activity] = pick(WORK[a.role] || WORK.Lead, rand);
      return { wait: 600 + rand() * 900, events: [{ type: 'tool', agent: a.agent, tool, activity }] };
    }
    if (r < 0.72) {
      const mates = all.filter((x) => x.team === a.team && x.agent !== a.agent);
      // One in six messages crosses team lines.
      const pool = rand() < 0.17 ? all.filter((x) => x.team !== a.team) : mates;
      if (!pool.length) return randomStep();
      const to = pick(pool, rand);
      return { wait: 1300, events: [{ type: 'message', agent: a.agent, to: to.agent, text: pick(CHAT[a.role] || CHAT.Lead, rand), status: 'thinking' }] };
    }
    if (r < 0.88) {
      return { wait: 700, events: [{ type: 'status', agent: a.agent, status: 'thinking', activity: pick(THINK, rand) }] };
    }
    if (r < 0.93 && a.role === 'Lead') {
      return { wait: 1600, events: [{ type: 'status', agent: a.agent, status: 'waiting', activity: 'Needs your approval to push' }] };
    }
    if (r < 0.96) {
      return { wait: 900, events: [{ type: 'status', agent: a.agent, status: 'error', activity: 'Tests failed: 2 of 48' }] };
    }
    return { wait: 900, events: [{ type: 'status', agent: a.agent, status: 'idle', activity: 'Waiting on a teammate' }] };
  }

  const speed = opts.agents ? Math.max(0.15, 12 / opts.agents) : 1;
  return {
    next() {
      if (queue.length) return queue.shift();
      const step = randomStep();
      return { ...step, wait: step.wait * speed };
    },
  };
}
