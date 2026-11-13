// Deterministic checks against the actual project CSVs; no browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

class Element {
  constructor() {
    this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.checked = true; this.value = '0'; this.hidden = false;
    this.classList = { add() {}, toggle() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  prepend(node) { this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getBoundingClientRect() { return { left: 0, width: Element.width || 1000, height: 480 }; }
  getContext() {
    return new Proxy({
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} })
    }, { get: (object, key) => object[key] ?? (() => {}) });
  }
}

async function check(file, width = 1000) {
  Element.width = width;
  let now = 0;
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const nodes = {};
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes['#' + id] = new Element();
  if (html.includes('class="metrics"')) nodes['.metrics'] = new Element();
  if (nodes['#variable']) nodes['#variable'].value = 'temp';
  const context = vm.createContext({
    structuredClone, console: { info() {}, error(error) { throw error; } },
    performance: { now: () => now }, matchMedia: () => ({ matches: false }),
    requestAnimationFrame() {}, ResizeObserver: class { observe() {} }, devicePixelRatio: 1,
    fetch: async url => ({ ok: true, text: async () => fs.readFileSync(path.join(root, url), 'utf8') }),
    document: {
      querySelector: selector => nodes[selector] ?? null,
      querySelectorAll: () => nodes['#calendar']?.children ?? [],
      createElement: () => new Element(), createTextNode: text => ({textContent: text}), createElementNS: (_namespace, tag) => { const node = new Element(); node.tagName = tag; return node; }, body: new Element()
    }
  });
  const run = code => vm.runInContext(code, context);
  run(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('ready'), true);
  const original = run('JSON.stringify(data)');
  assert.equal(run('scatterPairs("temp",0).length'), 123);
  assert.equal(run('pairStatistics(scatterPairs("temp",0)).r.toFixed(2)'), '-0.24');
  assert.equal(run('area(28)'), '0.000028 km\u00b2');
  assert.equal(run('area(1113355)'), '1.113355 km\u00b2');
  assert.equal(run('data[4].kelp'), 0);
  assert(run('kelpNote(data[4])').includes('not a confirmed absence'));
  assert.equal(run('data[3].kelp'), null);
  assert(run(`data.every(row => row.kelp === null || Math.abs(Number(area(row.kelp).split(' ')[0].replace(/,/g,'')) * 1e6 - row.kelp) < 0.000001)`));
  assert(Math.abs(run(`pairStatistics(scatterPairs('temp',0)).r - pairStatistics(scatterPairs('temp',0).map(p=>({...p,y:p.y/1e6}))).r`)) < 1e-12);
  for(const id of ['#series','#scatter']) {
    const svg=nodes[id];if(!svg)continue;
    const box=svg.attributes.viewBox.split(' ').map(Number);
    for(const node of svg.children.filter(node=>node.tagName==='text')) {
      assert(Number(node.attributes.x)>=0 && Number(node.attributes.x)<=box[2]);
      assert(Number(node.attributes.y)>=0 && Number(node.attributes.y)<=box[3]);
    }
  }

  if(nodes['#scatter']) {
    for(const key of ['temp','up']) {
      nodes['#variable'].value = key;
      let xRange, yRange;
      for(const lag of [0,1,2]) {
        nodes['#lag'].value=String(lag); run('scatter()');
        assert.equal(run(`scatterPairs('${key}',${lag}).length`), 123-lag);
        if(lag===0){xRange=nodes['#scatter'].dataset.xRange;yRange=nodes['#scatter'].dataset.yRange;}
        else {assert.equal(nodes['#scatter'].dataset.xRange,xRange);assert.equal(nodes['#scatter'].dataset.yRange,yRange);}
      }
    }
    nodes['#variable'].value='temp';nodes['#lag'].value='0';run('scatter()');
  }

  if(nodes['#calendar']) {
    assert(nodes['#calendar'].children.find(node=>node.dataset.i===3).className.includes('missing'));
    assert(nodes['#calendar'].children.find(node=>node.dataset.i===4).className.includes('zero'));
  }
  assert.equal(run('dateLabel(data[0])'),'Jan\u2013Mar 1995 (Q1)');
  const frame = ms => { now += ms; run(`draw(${now})`); };
  const choose = (year, quarter) => run(`select(${(year - 1995) * 4 + quarter - 1}, true)`);
  choose(2006, 3); // Smallest positive kelp: 28 square metres.
  assert.equal(run('visual.values.kelp'), 28);
  assert(run('visual.scene.coverage * 90') >= 3);
  assert(run('visual.scene.coverage * 90') < 5);
  choose(2009, 1);
  assert.equal(run('visual.scene.coverage'), 1);
  choose(1996, 1);
  assert.equal(run('visual.values.kelp'), 0);
  assert.equal(run('visual.scene.coverage'), 0);
  choose(1995, 4);
  assert.equal(run('visual.values.kelp'), null);
  assert.equal(run('visual.scene.coverage'), 0);
  if (nodes['#kelpObservation']) assert.equal(nodes['#kelpObservation'].hidden, false);
  choose(2015, 4); assert(run('visual.scene.warm') > 0);
  choose(2010, 3); assert(run('visual.scene.warm') < 0); // Cold anomaly in summer.
  choose(2006, 2); assert.equal(run('visual.scene.warm'), 0);
  choose(2015, 1); assert(run('visual.scene.current') < 0);
  assert.equal(run('visual.values.up'), -0.025811111);
  if (nodes['#currentLabel']) assert.equal(nodes['#currentLabel'].textContent, '\u2193 Downwelling');
  frame(16); const before = run('currentTravel'); frame(16);
  if (nodes['#ocean']) assert(run('currentTravel') < before);
  choose(2005, 2); assert.equal(run('visual.scene.current'), 1);
  run('select(33)'); frame(180);
  const halfway = run('JSON.stringify(visual)'); run('select(70)');
  assert.equal(run('JSON.stringify(visual)'), halfway);
  frame(900); assert.equal(run('visual.values.kelp'), run('data[70].kelp'));
  run('select(80)'); frame(100);
  const phase = run('motionTime'); nodes['#motion'].checked = false; nodes['#motion'].onchange();
  assert.equal(run('transition'), null); assert.equal(run('visual.values.temp'), run('data[80].temp'));
  frame(5000); assert.equal(run('motionTime'), phase);
  nodes['#motion'].checked = true; nodes['#motion'].onchange(); frame(16);
  if (nodes['#ocean']) assert(Math.abs(run('motionTime') - phase - 0.0096) < 1e-10);
  run('select(123, true)'); nodes['#play'].onclick(); frame(1799); assert.equal(run('idx'), 123);
  frame(1); assert.equal(run('idx'), 0); frame(900); assert.equal(run('transition'), null);
  assert.equal(run('JSON.stringify(data)'), original);
  console.log(`PASS ${file} at ${width}px: real data, warm/cold/neutral, low/high/zero/missing kelp, signed CUTI, interruption, Motion, autoplay, all six comparisons/lags, exact km2 conversion, unchanged observations`);
}
(async () => {
  for (const width of [1000,320]) for (const file of ['ocean-embed.html', 'relationships-embed.html', 'index.html']) await check(file,width);
})().catch(error => { console.error(error); process.exitCode = 1; });
