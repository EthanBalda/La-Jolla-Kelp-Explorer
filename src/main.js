const $ = selector => document.querySelector(selector);

const seasons = ["Winter", "Spring", "Summer", "Fall"];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const START_YEAR = 1995;
const END_YEAR = 2025;
const QUARTER_COUNT = (END_YEAR - START_YEAR + 1) * 4;
const TRANSITION_MS = 900;
const PLAY_INTERVAL_MS = 1800;

let idx = 0;
let playing = false;
let lastStep = 0;
let ready = false;
let visual = null;
let transition = null;
let motionTime = 0;
let currentTravel = 0;
let previousFrame = null;
let data = [];

const metricKeys = ["kelp", "temp", "up"];

if ($("#motion")) {
  $("#motion").checked = !reduced;
}

const motionEnabled = () => $("#motion")?.checked ?? !reduced;

const mix = (a, b, progress) =>
  progress === 1 ? b : a + (b - a) * progress;

function on(selector, event, handler) {
  const node = $(selector);

  if (node) {
    node[event] = handler;
  }
}

function extent(values) {
  const valid = values.filter(Number.isFinite);

  return valid.length
    ? [Math.min(...valid), Math.max(...valid)]
    : [0, 1];
}

function norm(value, minimum, maximum) {
  if (minimum === maximum) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, (value - minimum) / (maximum - minimum))
  );
}

function fmt(value) {
  return Number.isFinite(value)
    ? Math.round(value).toLocaleString()
    : "Missing";
}

function setText(selector, text) {
  const node = $(selector);

  if (node) {
    node.textContent = text;
  }
}

function setControlsDisabled(disabled) {
  for (const selector of ["#time", "#play", "#variable", "#lag"]) {
    if ($(selector)) {
      $(selector).disabled = disabled;
    }
  }
}

function showStatus(message, error = false) {
  const targets = ["#notice", "#loadStatus"]
    .map($)
    .filter(Boolean);

  if (!targets.length) {
    let status = $("#projectDataStatus");

    if (!status) {
      status = document.createElement("p");
      status.id = "projectDataStatus";
      document.body.prepend(status);
    }

    targets.push(status);
  }

  for (const target of targets) {
    target.textContent = message;
    target.setAttribute("role", error ? "alert" : "status");
  }
}

function anomalies(key) {
  if (key === "temp") {
    return data.map(row => row.temp);
  }

  if (key === "up") {
    return data.map(row => row.upAnomaly);
  }

  const means = [1, 2, 3, 4].map(quarter => {
    const values = data
      .filter(row =>
        row.quarter === quarter &&
        Number.isFinite(row[key])
      )
      .map(row => row[key]);

    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  });

  return data.map(row => {
    const baseline = means[row.quarter - 1];

    return Number.isFinite(row[key]) && baseline !== null
      ? row[key] - baseline
      : null;
  });
}

const quarterMonths = ["Jan\u2013Mar", "Apr\u2013Jun", "Jul\u2013Sep", "Oct\u2013Dec"];
const dateLabel = row => `${quarterMonths[row.quarter - 1]} ${row.year} (Q${row.quarter})`;
const area = value => Number.isFinite(value)
  ? `${(value / 1e6).toLocaleString(undefined, {minimumFractionDigits: 3, maximumFractionDigits: 6})} km\u00b2`
  : "No observation";
const signed = (value, decimals = 2) => Number.isFinite(value)
  ? `${value >= 0 ? "+" : "\u2212"}${Math.abs(value).toFixed(decimals)}` : "No observation";
// Rounded breaks near the 10th, 20th, 40th, 60th and 80th positive-data percentiles.
// Units here are km2; the source observations remain in m2.
const canopyBreaks = [0.002, 0.012, 0.05, 0.13, 0.4];
const canopyColors = ["#edf6cd", "#d4e6a4", "#a7cd7a", "#76ad5b", "#45843f", "#205c33"];
function canopyBand(value) {
  const band = canopyBreaks.findIndex(limit => value / 1e6 <= limit);
  return band < 0 ? canopyColors.length - 1 : band;
}
function kelpNote(row) {
  return row.year === 1996 && row.quarter === 1
    ? " Source flags this quarter as blank despite a reported zero and cloud-free cells; not a confirmed absence. Analytical treatment unchanged pending team review."
    : "";
}
function renderCalendar() {
  const calendar = $("#calendar");
  if (!calendar) return;
  calendar.style.gridTemplateColumns = `repeat(${END_YEAR - START_YEAR + 1}, minmax(0, 1fr))`;
  calendar.replaceChildren();
  const years = $("#heatmapYears");
  years?.replaceChildren();
  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const label = document.createElement("span"); label.textContent = year; years?.append(label);
  }
  const legend = $("#canopyLegend");
  legend?.replaceChildren();
  const entries = [
    ["zero", "Reported zero: 0 km\u00b2", "#a5afb4"],
    ...canopyColors.map((color, i) => ["", `>${i ? canopyBreaks[i - 1] : 0} to ${canopyBreaks[i] ?? `max (${extent(data.map(row => row.kelp))[1] / 1e6})`} km\u00b2`, color]),
    ["missing", "No observation (hatched)", ""]
  ];
  entries.forEach(([kind, label, color]) => {
    const item = document.createElement("span"), swatch = document.createElement("i");
    swatch.className = `canopy-swatch ${kind}`; swatch.style.backgroundColor = color;
    item.append(swatch, document.createTextNode(label)); legend?.append(item);
  });
  for (let quarter = 1; quarter <= 4; quarter++) {
    data.forEach((row, index) => {
      if (row.quarter !== quarter) return;
      const button = document.createElement("button");
      button.className = `calcell${row.kelp === null ? ' missing' : row.kelp === 0 ? ' zero' : ''}`;
      button.dataset.i = index;
      if (row.kelp > 0) button.style.backgroundColor = canopyColors[canopyBand(row.kelp)];
      button.title = `${dateLabel(row)}: ${area(row.kelp)}.${kelpNote(row)}`;
      button.setAttribute("aria-label", button.title);
      button.onclick = () => select(index);
      button.onkeydown = event => {
        const offsets = {ArrowLeft: -4, ArrowRight: 4, ArrowUp: -1, ArrowDown: 1};
        let next = index;
        if (event.key in offsets) {
          if (event.key === 'ArrowUp' && row.quarter === 1 || event.key === 'ArrowDown' && row.quarter === 4) return;
          next += offsets[event.key];
        } else if (event.key === 'Home') next = quarter - 1;
        else if (event.key === 'End') next = data.length - 5 + quarter;
        else return;
        event.preventDefault(); if (next < 0 || next >= data.length) return;
        select(next); calendar.querySelector(`[data-i="${next}"]`)?.focus();
      };
      calendar.append(button);
    });
  }
}

const ns = "http://www.w3.org/2000/svg";

function el(tag, attributes, parent) {
  const node = document.createElementNS(ns, tag);

  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }

  parent.append(node);

  return node;
}

function txt(
  svg,
  x,
  y,
  text,
  color = "#9fb6b7",
  size = 11
) {
  const node = el(
    "text",
    {
      x,
      y,
      fill: color,
      "font-size": size,
      "font-family": "system-ui"
    },
    svg
  );

  node.textContent = text;

  return node;
}

function chartWidth(svg) {
  return Math.max(250, Math.round(svg.getBoundingClientRect().width || 600));
}
function wrappedText(svg, x, y, text, available, size = 13, color = '#e8eee7') {
  const words = text.split(' '); let line = '', lines = 0;
  for (const word of words) {
    if ((line.length + word.length + 1) * size * 0.53 > available && line) {
      txt(svg, x, y + lines++ * (size + 5), line, color, size); line = word;
    } else line += (line ? ' ' : '') + word;
  }
  if (line) txt(svg, x, y + lines++ * (size + 5), line, color, size);
  return lines;
}
function paddedRange(values) {
  const [lo, hi] = extent([...values, 0]); const pad = (hi - lo || 1) * 0.06;
  return [lo - pad, hi + pad];
}
function series() {
  const svg = $('#series'); if (!svg) return;
  svg.replaceChildren();
  const width = chartWidth(svg), left = 58, right = width - 12;
  const panelHeight = 192, plotHeight = 98;
  svg.setAttribute('viewBox', `0 0 ${width} ${panelHeight * 3 + 25}`);
  const panels = [
    ['kelp', 'Kelp canopy area (km\u00b2)', '#bdd794'],
    ['temp', 'Surface temperature vs. seasonal average (\u00b0C)', '#ffb0a0'],
    ['up', 'Regional upwelling index (m\u00b2/s)', '#ffe4af']
  ];
  const X = index => left + index / (data.length - 1) * (right - left);
  panels.forEach(([key, title, color], panel) => {
    const base = panel * panelHeight;
    wrappedText(svg, 0, base + 16, title, width, 14);
    const top = base + 53, bottom = top + plotHeight;
    const values = data.map(row => key === 'kelp' && row[key] !== null ? row[key] / 1e6 : row[key]);
    const [lo, hi] = key === 'kelp'
      ? [0, Math.max(0.000001, ...values.filter(Number.isFinite)) * 1.06]
      : paddedRange(values);
    const Y = value => bottom - (value - lo) / (hi - lo) * plotHeight;
    const ticks = key === 'kelp' ? [0, hi / 2, hi]
      : [lo, 0, hi].filter(value => value === 0 || Math.abs(Y(value) - Y(0)) >= 18);
    for (const value of ticks) {
      const zero = value === 0;
      el('line', {x1:left,x2:right,y1:Y(value),y2:Y(value),stroke:zero?'#f0f6dfa0':'#ffffff24','stroke-dasharray':zero?'4 3':'none'}, svg);
      txt(svg, 0, Y(value)+4, value.toFixed(key === 'kelp' ? 2 : 1), '#b8cdcf', 12);
    }
    let path = '', connected = false;
    values.forEach((value, index) => {
      if (!Number.isFinite(value)) { connected = false; return; }
      path += `${connected?'L':'M'}${X(index)},${Y(value)}`; connected = true;
    });
    el('path', {d:path,fill:'none',stroke:color,'stroke-width':2}, svg);
    el('line', {x1:X(idx),x2:X(idx),y1:top,y2:bottom,stroke:'#fff','stroke-dasharray':'3 3'}, svg);
    if (values[idx] !== null) el('circle', {cx:X(idx),cy:Y(values[idx]),r:4,fill:color}, svg);
    if (panel === 1) wrappedText(svg, left, bottom+18, '0 = typical for that season', right-left, 12, '#b8cdcf');
    if (panel === 2) wrappedText(svg, left, bottom+18, '0 = no net upward or downward transport', right-left, 12, '#b8cdcf');
  });
  [0, 60, 123].forEach(index => txt(svg, Math.min(right-28,X(index)), panelHeight*3+15, data[index].year, '#b8cdcf', 12));
  setText('#seriesSelection', `${dateLabel(data[idx])} \u00b7 Canopy: ${area(data[idx].kelp)} \u00b7 Temperature: ${signed(data[idx].temp)} \u00b0C \u00b7 Regional upwelling: ${signed(data[idx].up,3)} m\u00b2/s.${kelpNote(data[idx])}`);
}

function scatterPairs(key, lag) {
  const environment = anomalies(key), kelp = anomalies('kelp'), pairs = [];
  for (let index = lag; index < data.length; index++) {
    if (Number.isFinite(environment[index-lag]) && Number.isFinite(kelp[index]))
      pairs.push({x:environment[index-lag],y:kelp[index],index});
  }
  return pairs;
}
function pairStatistics(pairs) {
  const count = pairs.length;
  const meanX = pairs.reduce((sum,p)=>sum+p.x,0)/(count||1);
  const meanY = pairs.reduce((sum,p)=>sum+p.y,0)/(count||1);
  let covariance=0, varianceX=0, varianceY=0;
  for (const point of pairs) {
    covariance+=(point.x-meanX)*(point.y-meanY);
    varianceX+=(point.x-meanX)**2; varianceY+=(point.y-meanY)**2;
  }
  return {count,meanX,meanY,covariance,varianceX,r:covariance/Math.sqrt(varianceX*varianceY)};
}
function scatter() {
  const svg = $('#scatter'); if (!svg) return;
  const key = $('#variable')?.value ?? 'temp', lag = Number($('#lag')?.value ?? 0);
  const pairs = scatterPairs(key,lag), stats = pairStatistics(pairs);
  svg.replaceChildren();
  const width=chartWidth(svg), left=64, right=width-15, top=62, bottom=330;
  svg.setAttribute('viewBox',`0 0 ${width} 420`);
  // Use the full record for each comparison; changing lag never changes ranges.
  const [xmin,xmax]=paddedRange(anomalies(key));
  const [ymin,ymax]=paddedRange(anomalies('kelp').map(v=>v===null?null:v/1e6));
  svg.dataset.xRange=JSON.stringify([xmin,xmax]); svg.dataset.yRange=JSON.stringify([ymin,ymax]);
  const X=x=>left+(x-xmin)/(xmax-xmin)*(right-left);
  const Y=y=>bottom-(y-ymin)/(ymax-ymin)*(bottom-top);
  wrappedText(svg,0,16,'Kelp canopy vs. same-season average (km\u00b2)',width,13);
  for (let tick=0;tick<4;tick++) {
    const y=ymin+(ymax-ymin)*tick/3, x=xmin+(xmax-xmin)*tick/3;
    el('line',{x1:left,x2:right,y1:Y(y),y2:Y(y),stroke:'#ffffff22'},svg);
    txt(svg,0,Y(y)+4,y.toFixed(2),'#b8cdcf',12);
    txt(svg,Math.min(right-28,X(x)-12),bottom+22,x.toFixed(2),'#b8cdcf',12);
  }
  el('line',{x1:X(0),x2:X(0),y1:top,y2:bottom,stroke:'#e8eee790','stroke-dasharray':'4 3'},svg);
  el('line',{x1:left,x2:right,y1:Y(0),y2:Y(0),stroke:'#e8eee790','stroke-dasharray':'4 3'},svg);
  txt(svg,X(0)+4,bottom-4,'0','#e8eee7',12);
  wrappedText(svg,left,bottom+46,key==='temp'
    ? 'Surface temperature vs. same-season average (\u00b0C)'
    : 'Regional upwelling vs. same-season average (m\u00b2/s)',right-left,13);
  pairs.forEach(point=>{
    const circle=el('circle',{cx:X(point.x),cy:Y(point.y/1e6),r:point.index===idx?6:4,
      fill:point.index===idx?'#fff6c5':'#9bd7c3',opacity:point.index===idx?1:0.7,tabindex:0,role:'button'},svg);
    const label=`Kelp: ${dateLabel(data[point.index])}, difference ${area(point.y)}; ocean conditions: ${dateLabel(data[point.index-lag])}, ${signed(point.x,3)} ${key==='temp'?'\u00b0C':'m\u00b2/s'}.${kelpNote(data[point.index])}`;
    el('title',{},circle).textContent=label; circle.setAttribute('aria-label',label);
    circle.style.cursor='pointer'; circle.onclick=()=>select(point.index);
    circle.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(point.index)}};
  });
  if (stats.varianceX>0 && stats.count>1) {
    // Restrict the fitted line to the plot rectangle.
    const defs=el('defs',{},svg),clip=el('clipPath',{id:'scatterClip'},defs);
    el('rect',{x:left,y:top,width:right-left,height:bottom-top},clip);
    el('line',{x1:X(xmin),x2:X(xmax),y1:Y((stats.meanY+stats.covariance/stats.varianceX*(xmin-stats.meanX))/1e6),
      y2:Y((stats.meanY+stats.covariance/stats.varianceX*(xmax-stats.meanX))/1e6),stroke:'#e6d8a5','stroke-width':1.5,'stroke-dasharray':'5 5','clip-path':'url(#scatterClip)'},svg);
  }
  const rText=Number.isFinite(stats.r)?`${stats.r<0?'\u2212':''}${Math.abs(stats.r).toFixed(2)}`:'unavailable';
  setText('#rval',`Pearson r = ${rText}`);
  setText('#pairCount',`${stats.count} paired quarters \u00b7 project data`);
  const strength=Math.abs(stats.r)<0.1?'very little':Math.abs(stats.r)<0.35?'slight':Math.abs(stats.r)<0.65?'moderate':'strong';
  const conditions=key==='temp'?'Warmer-than-usual ocean conditions':'Stronger-than-usual regional upwelling';
  const timing=lag?` ${lag*3} months earlier`:'';
  setText('#takeaway',!Number.isFinite(stats.r)?'Not enough variation in paired observations to describe an association.'
    : strength==='very little'?`${conditions}${timing} showed very little association with kelp canopy (r = ${rText}, ${stats.count} paired quarters).`
    : `${conditions}${timing} tended to accompany ${strength==='slight'?'slightly ':''}${stats.r<0?'less':'more'} kelp${strength==='moderate'||strength==='strong'?` (a ${strength} association)`:''} (r = ${rText}, ${stats.count} paired quarters).`);
  const selected=pairs.find(point=>point.index===idx);
  setText('#pointDetails',selected
    ? `Selected pair \u2014 Kelp: ${dateLabel(data[idx])}, observed canopy ${area(data[idx].kelp)}, difference from same-season average ${area(selected.y)}. Ocean conditions: ${dateLabel(data[idx-lag])}, difference ${signed(selected.x,3)} ${key==='temp'?'\u00b0C':'m\u00b2/s'}.${kelpNote(data[idx])}`
    : `${dateLabel(data[idx])}: no paired observation for this timing; missing quarters are not replaced with zeros.`);
}

// Small baseline anomalies stay neutral; warm/cold use the same visual scale.
function temperatureEffect(anomaly) {
  return Math.sign(anomaly) * Math.pow(norm(Math.abs(anomaly), 0.08, 2.5), 0.7);
}

function sceneTarget(row) {
  const maximumKelp = extent(
    data.map(item => item.kelp)
  )[1];

  const maximumTransport = Math.max(
    0,
    ...data
      .map(item => item.up)
      .filter(Number.isFinite)
      .map(Math.abs)
  );

  return {
    coverage: row.kelp === null
      ? 0
      : row.kelp === 0 ? 0
        // Illustration only: minimum three strands; preserve raw observations.
        : (3 + 87 * Math.pow(norm(row.kelp, 0, maximumKelp), 0.45)) / 90,

    warm:
      ($("#tempFx")?.checked ?? true) &&
      row.temp !== null
        ? temperatureEffect(row.temp)
        : 0,

    current:
      row.up === null || maximumTransport === 0
        ? 0
        : Math.sign(row.up) * Math.sqrt(
            norm(Math.abs(row.up), 0.005, maximumTransport)
          ),

    currentAlpha:
      ($("#upFx")?.checked ?? true) &&
      row.up !== null
        ? 1
        : 0
  };
}

function renderMetrics() {
  if (!visual) {
    return;
  }

  const row = visual.values;

  setText(
    "#kelpVal",
    row.kelp === null ? "No observation" : area(row.kelp)
  );

  setText(
    "#tempVal",
    row.temp === null
      ? "Missing"
      : `${row.temp >= 0 ? "+" : ""}${row.temp.toFixed(2)} °C`
  );

  setText(
    "#upVal",
    row.up === null ? "No observation" : `${signed(row.up,3)} m\u00b2/s`
  );

  const temperature = $("#tempVal");
  if (temperature) {
    const amount = Math.abs(visual.scene.warm);
    const accent = visual.scene.warm > 0 ? [255, 124, 113] : [111, 231, 255];
    temperature.style.color = `rgb(${[232, 238, 231].map(
      (channel, i) => Math.round(mix(channel, accent[i], Math.min(1, amount * 1.8)))
    ).join(",")})`;
  }
  setText("#currentLabel", row.up === null ? "No observation"
    : row.up > 0 ? "\u2191 Upwelling"
    : row.up < 0 ? "\u2193 Downwelling" : "Neutral");
}

function setDates(row, animate) {
  return [
    ["#date", dateLabel(row)],
    [
      "#sceneDate",
      dateLabel(row)
    ]
  ].map(([selector, label]) => {
    const host = $(selector);

    if (!host) {
      return null;
    }

    host.classList.add("date-fade");
    host.setAttribute("aria-label", label);

    const previous = animate
      ? Array.from(host.children).reduce(
          (best, node) =>
            !best ||
            Number(node.style.opacity) >=
              Number(best.style.opacity)
              ? node
              : best,
          null
        )
      : null;

    host.replaceChildren(
      ...(previous ? [previous] : [])
    );

    if (previous?.textContent === label) {
      previous.style.opacity = 1;
      return null;
    }

    const outgoing = previous
      ? [{
          node: previous,
          opacity: Number(previous.style.opacity)
        }]
      : [];

    const node = document.createElement("span");

    node.textContent = label;
    node.setAttribute("aria-hidden", "true");
    node.style.opacity = animate ? "0" : "1";

    host.append(node);

    return { host, node, outgoing };
  }).filter(Boolean);
}

function advanceVisual(now) {
  if (!transition) {
    return;
  }

  const currentTransition = transition;

  const progress = motionEnabled()
    ? Math.min(
        1,
        Math.max(
          0,
          (now - currentTransition.start) / TRANSITION_MS
        )
      )
    : 1;

  const eased = progress * progress * (3 - 2 * progress);

  for (const key of metricKeys) {
    const from = currentTransition.from.values[key];
    const to = currentTransition.to.values[key];

    // Missing observations update directly.
    visual.values[key] =
      from === null || to === null
        ? to
        : mix(from, to, eased);
  }

  for (const key in currentTransition.to.scene) {
    visual.scene[key] = mix(
      currentTransition.from.scene[key],
      currentTransition.to.scene[key],
      eased
    );
  }

  for (
    const { host, node, outgoing }
    of currentTransition.dates
  ) {
    for (const old of outgoing) {
      old.node.style.opacity =
        old.opacity * (1 - eased);
    }

    node.style.opacity = eased;

    if (progress === 1) {
      host.replaceChildren(node);
    }
  }

  renderMetrics();

  if (progress === 1) {
    transition = null;
    $(".metrics")?.setAttribute("aria-busy", "false");
  }
}

function retarget(row, now, immediate = false) {
  advanceVisual(now);

  const target = {
    values: Object.fromEntries(
      metricKeys.map(key => [key, row[key]])
    ),
    scene: sceneTarget(row)
  };

  const animate =
    visual !== null &&
    !immediate &&
    motionEnabled();

  const dates = setDates(row, animate);

  if (animate) {
    transition = {
      from: structuredClone(visual),
      to: target,
      start: now,
      dates
    };

    $(".metrics")?.setAttribute("aria-busy", "true");
    advanceVisual(now);
  } else {
    visual = target;
    transition = null;
    renderMetrics();
    $(".metrics")?.setAttribute("aria-busy", "false");
  }
}

function select(index, immediate = false) {
  if (!ready) {
    return;
  }

  const now = performance.now();

  idx = Math.max(
    0,
    Math.min(data.length - 1, Math.round(index))
  );

  if ($("#time")) {
    $("#time").value = idx;

    $("#time").setAttribute(
      "aria-valuetext",
      `${data[idx].year}, quarter ${data[idx].quarter}`
    );
  }

  retarget(data[idx], now, immediate);
  if ($("#kelpObservation")) {
    $("#kelpObservation").hidden = data[idx].kelp !== null;
  }

  if (playing) {
    lastStep = now;
  }

  document.querySelectorAll(".calcell").forEach(button => {
    button.classList.toggle(
      "selected",
      Number(button.dataset.i) === idx
    );
  });

  for (const [selector, key] of [
    ["#kelpVal", "kelp"],
    ["#tempVal", "temp"],
    ["#upVal", "up"]
  ]) {
    if ($(selector)) {
      $(selector).title =
        `Selected observation: ${key === 'kelp' ? area(data[idx][key]) : signed(data[idx][key],key === 'up'?3:2) + (key === 'up'?' m\u00b2/s':' \u00b0C')}`;
    }
  }

  setText("#heatmapSelection", `${dateLabel(data[idx])}: ${area(data[idx].kelp)}.${kelpNote(data[idx])}`);
  document.querySelectorAll(".calcell").forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.i) === idx)));
  series();
  scatter();
}

on("#series", "onclick", event => {
  const bounds = event.currentTarget.getBoundingClientRect();

  const width = chartWidth(event.currentTarget);
  const position = ((event.clientX - bounds.left) / bounds.width * width - 58) / (width - 70);

  select(
    Math.max(0, Math.min(1, position)) *
      (data.length - 1)
  );
});

on("#motion", "onchange", () => {
  previousFrame = performance.now();

  if (!motionEnabled()) {
    advanceVisual(previousFrame);
  }
});

on("#tempFx", "onchange", () => {
  if (ready) {
    retarget(data[idx], performance.now());
  }
});

on("#upFx", "onchange", () => {
  if (ready) {
    retarget(data[idx], performance.now());
  }
});

on("#time", "oninput", event => {
  select(Number(event.target.value));
});

on("#play", "onclick", () => {
  if (!ready) {
    return;
  }

  playing = !playing;

  setText("#play", playing ? "Ⅱ Pause" : "▶ Play");

  $("#play").setAttribute(
    "aria-label",
    playing ? "Pause timeline" : "Play timeline"
  );

  lastStep = performance.now();
});

on("#variable", "onchange", () => {
  if (ready) {
    scatter();
  }
});

on("#lag", "onchange", () => {
  if (ready) {
    scatter();
  }
});

const canvas = $("#ocean");
const ctx = canvas?.getContext("2d");

let w = 1;
let h = 1;

function resize() {
  if (!canvas || !ctx) {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  const resolution = Math.min(devicePixelRatio || 1, 2);

  w = bounds.width;
  h = bounds.height;

  canvas.width = w * resolution;
  canvas.height = h * resolution;

  ctx.setTransform(
    resolution,
    0,
    0,
    resolution,
    0,
    0
  );
}

if (canvas && ctx) {
  new ResizeObserver(resize).observe(canvas);
}

function rand(seed) {
  const value =
    Math.sin(seed * 127.1 + 311.7) * 43758.5453;

  return value - Math.floor(value);
}

function draw(now) {
  if (
    ready &&
    playing &&
    now - lastStep >= PLAY_INTERVAL_MS
  ) {
    select((idx + 1) % data.length);
    lastStep = now;
  }

  advanceVisual(now);

  if (!ctx || !visual) {
    previousFrame = now;
    requestAnimationFrame(draw);
    return;
  }

  const {
    warm,
    coverage,
    current,
    currentAlpha
  } = visual.scene;

  const strength = Math.abs(current);

  const elapsed = previousFrame === null
    ? 0
    : Math.min(
        64,
        Math.max(0, now - previousFrame)
      );

  previousFrame = now;

  if (motionEnabled()) {
    motionTime += elapsed * 0.0006;
    currentTravel += elapsed * 0.0006 * current * 77;
  }

  const time = motionTime;

  const gradient =
    ctx.createLinearGradient(0, 0, 0, h);

  gradient.addColorStop(
    0,
    `rgb(${
      33 + Math.max(0, warm) * 27
    },${
      100 - Math.max(0, warm) * 21
    },${
      115 - Math.max(0, warm) * 53
    })`
  );

  gradient.addColorStop(0.6, "#0b3e49");
  gradient.addColorStop(1, "#06262f");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Light beams.
  for (let beam = 0; beam < 7; beam++) {
    const x =
      w * (beam * 0.18 - 0.1) +
      Math.sin(time * 0.3 + beam) * 18;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 80, 0);
    ctx.lineTo(x + w * 0.25, h);
    ctx.lineTo(x + w * 0.07, h);
    ctx.closePath();

    ctx.fillStyle = "rgba(187,223,205,.035)";
    ctx.fill();
  }

  // Seabed.
  ctx.beginPath();
  ctx.moveTo(0, h);

  for (let x = 0; x <= w + 10; x += 10) {
    ctx.lineTo(
      x,
      h - 25 -
      8 * Math.sin(x * 0.013) -
      4 * Math.cos(x * 0.039)
    );
  }

  ctx.lineTo(w, h);
  ctx.fillStyle = "#112e2d";
  ctx.fill();

  // Kelp coverage.
  for (let plant = 0; plant < 90; plant++) {
    const alpha = Math.max(
      0,
      Math.min(
        1,
        coverage * 90 - (plant * 37 % 90)
      )
    );

    if (alpha === 0) {
      continue;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    const x = (plant + 0.5) / 90 * w;
    const y = h - 27 - 8 * Math.sin(x * 0.013);

    const height =
      85 + rand(plant + 10) * (h * 0.58);

    const sway =
      Math.sin(time + plant * 0.4) * 14;

    const dark = plant % 3 === 0;

    ctx.strokeStyle = dark ? "#356549" : "#6e9255";
    ctx.lineWidth = dark ? 3 : 2;

    ctx.beginPath();
    ctx.moveTo(x, y);

    ctx.bezierCurveTo(
      x - 10,
      y - height * 0.35,
      x + sway * 2,
      y - height * 0.7,
      x + sway,
      y - height
    );

    ctx.stroke();

    for (let leaf = 1; leaf < 9; leaf++) {
      const fraction = leaf / 9;

      const px =
        x + Math.sin(fraction * Math.PI) * sway;

      const py = y - fraction * height;
      const side = leaf % 2 ? 1 : -1;

      const length =
        16 + rand(plant * 9 + leaf) * 22;

      ctx.save();
      ctx.translate(px, py);

      ctx.rotate(
        side * 0.45 +
        Math.sin(time + plant + leaf) * 0.12
      );

      ctx.beginPath();
      ctx.moveTo(0, 0);

      ctx.bezierCurveTo(
        side * length,
        -2,
        side * length,
        -20,
        side * length * 0.75,
        -29
      );

      ctx.bezierCurveTo(
        side * length * 0.3,
        -26,
        side * length * 0.1,
        -10,
        0,
        0
      );

      ctx.fillStyle = dark
        ? "#366346"
        : `rgba(${
            105 + plant % 20
          },${
            137 + plant % 18
          },65,.9)`;

      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Ambient particles.
  for (let particle = 0; particle < 35; particle++) {
    const x =
      rand(particle + 900) * w +
      Math.sin(time + particle) * 10;

    const y =
      (rand(particle + 800) * h -
        time * 5 + h * 10) % h;

    ctx.fillStyle = "#d7e9d82c";
    ctx.beginPath();

    ctx.arc(
      x,
      y,
      rand(particle + 40) * 1.6 + 0.3,
      0,
      7
    );

    ctx.fill();
  }

  // Red heat / icy cyan are keyed to the seasonal-baseline anomaly, not season.
  const heat = Math.abs(warm);
  if (heat > 0) {
    const color = warm > 0 ? "255,70,55" : "85,224,255";
    const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0,
      w / 2, h * 0.45, Math.max(w, h) * 0.65);
    glow.addColorStop(0, `rgba(${color},${heat * 0.04})`);
    glow.addColorStop(0.6, `rgba(${color},${heat * 0.22})`);
    glow.addColorStop(1, `rgba(${color},${heat * 0.72})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Warm ripples and cold crystalline edge glints freeze with Motion.
    ctx.strokeStyle = `rgba(${warm > 0 ? "255,153,128" : "176,247,255"},${heat * 0.4})`;
    ctx.lineWidth = warm > 0 ? 2 : 1.5;
    for (let glint = 0; glint < 12; glint++) {
      const x = (glint + 0.5) / 12 * w;
      const y = 25 + rand(glint + 1300) * h * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      if (warm > 0) ctx.quadraticCurveTo(x, y + Math.sin(time + glint) * 12, x + 12, y);
      else { ctx.lineTo(x, y + 8); ctx.lineTo(x + 5, y - 10); }
      ctx.stroke();
    }
  }

  // Amber current streams stay distinct from cyan frost and red warmth.
  // Signed travel reverses smoothly; arrowheads also show direction when paused.
  if (currentAlpha > 0 && strength > 0) {
    ctx.save();
    const direction = Math.sign(current);
    const cycle = Math.max(1, h * 0.73);
    for (let stream = 0; stream < 18; stream++) {
      const alpha = currentAlpha * Math.min(1, Math.max(0, 3 + strength * 15 - stream))
        * Math.min(1, strength * 6);
      if (!alpha) continue;
      const x = (stream + 0.5) / 18 * w + Math.sin(time * 0.4 + stream) * 5;
      ctx.strokeStyle = `rgba(255,211,130,${alpha * (0.3 + strength * 0.4)})`;
      ctx.fillStyle = `rgba(255,228,175,${alpha * 0.9})`;
      ctx.shadowColor = "#ffd382";
      ctx.shadowBlur = 5;
      ctx.lineWidth = 1.5 + strength;
      for (let particle = 0; particle < 3; particle++) {
        const position = currentTravel + (particle / 3 + rand(stream + 1700)) * cycle;
        const y = h - 35 - ((position % cycle + cycle) % cycle);
        ctx.beginPath();
        ctx.moveTo(x, y + direction * (15 + strength * 20));
        ctx.quadraticCurveTo(x + 5, y + direction * 10, x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 4, y + direction * 7);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 4, y + direction * 7);
        ctx.stroke();
        ctx.beginPath();ctx.arc(x, y, 1.5 + strength, 0, Math.PI * 2);ctx.fill();
      }
    }
    ctx.restore();
  }

  if (data[idx].kelp === null && !$("#kelpObservation")) {
    ctx.fillStyle = "#e9edde";
    ctx.font = "14px system-ui";
    ctx.fillText("No observation", 25, h * 0.55);
  }

  requestAnimationFrame(draw);
}

function csvRows(text) {
  const rows = [];

  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (
      (character === "\n" || character === "\r") &&
      !quoted
    ) {
      if (
        character === "\r" &&
        text[index + 1] === "\n"
      ) {
        index++;
      }

      row.push(field);

      if (row.some(value => value.trim())) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("Unclosed quoted CSV field.");
  }

  row.push(field);

  if (row.some(value => value.trim())) {
    rows.push(row);
  }

  return rows;
}

async function loadQuarterlyCSV(filename, requiredColumns) {
  const response = await fetch(`data/${filename}`);

  if (!response.ok) {
    throw new Error(
      `Could not load ${filename}: HTTP ${response.status}`
    );
  }

  const rows = csvRows(await response.text());

  if (!rows.length) {
    throw new Error(`${filename} is empty.`);
  }

  const headers = rows.shift().map(header =>
    header.trim().replace(/^\uFEFF/, "").toLowerCase()
  );

  for (const column of requiredColumns) {
    if (!headers.includes(column)) {
      throw new Error(
        `${filename} is missing column "${column}".`
      );
    }
  }

  const namedHeaders = headers.filter(Boolean);

  if (new Set(namedHeaders).size !== namedHeaders.length) {
    throw new Error(
      `${filename} has duplicate column names. ` +
      "Export its observation table separately."
    );
  }

  const records = new Map();

  for (const [index, row] of rows.entries()) {
    const get = column =>
      (row[headers.indexOf(column)] ?? "").trim();

    const yearText = get("year");
    const quarterText = get("quarter");

    if (!yearText && !quarterText) {
      continue;
    }

    if (quarterText.toLowerCase() === "max") {
      continue;
    }

    const year = Number(yearText);
    const quarter = Number(quarterText);

    if (
      !Number.isInteger(year) ||
      ![1, 2, 3, 4].includes(quarter)
    ) {
      throw new Error(
        `Invalid year or quarter in ${filename}, ` +
        `row ${index + 2}.`
      );
    }

    if (year < START_YEAR || year > END_YEAR) {
      continue;
    }

    const key = `${year}-${quarter}`;

    if (records.has(key)) {
      throw new Error(
        `Duplicate ${key} in ${filename}.`
      );
    }

    records.set(key, { get });
  }

  if (!records.size) {
    throw new Error(
      `${filename} contains no study-period quarters.`
    );
  }

  return records;
}

function measurement(record, column) {
  if (!record) {
    return null;
  }

  const text = record.get(column);

  if (text === "" || text.toLowerCase() === "nan") {
    return null;
  }

  const value = Number(text);

  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid number in "${column}": ${text}`
    );
  }

  return value;
}

async function loadProjectData() {
  const [kelpRows, tempRows, upRows] = await Promise.all([
    loadQuarterlyCSV("kelp.csv", [
      "year",
      "quarter",
      "kelp_area_m2"
    ]),

    loadQuarterlyCSV("temperature_quarterly.csv", [
      "year",
      "quarter",
      "surf_avg_c",
      "surf_anomaly_c"
    ]),

    loadQuarterlyCSV("upwelling_quarterly.csv", [
      "year",
      "quarter",
      "cuti_avg_m2_s",
      "cuti_anomaly_m2_s"
    ])
  ]);

  const combined = Array.from(
    { length: QUARTER_COUNT },
    (_, index) => {
      const year = START_YEAR + Math.floor(index / 4);
      const quarter = index % 4 + 1;
      const key = `${year}-${quarter}`;

      const kelpRecord = kelpRows.get(key);
      const tempRecord = tempRows.get(key);
      const upRecord = upRows.get(key);

      const reportedKelp =
        measurement(kelpRecord, "kelp_area_m2");

      if (reportedKelp !== null && reportedKelp < 0) {
        throw new Error(
          `Negative kelp area in ${key}.`
        );
      }

      return {
        year,
        quarter,

        // This source quarter had no usable satellite observation.
        kelp: key === "1995-4" ? null : reportedKelp,
        reportedKelp,

        kelpCells:
          measurement(kelpRecord, "count_cells_kelp"),

        cloudFreeCells:
          measurement(kelpRecord, "count_cells_no_clouds"),

        historicFootprintCells:
          measurement(
            kelpRecord,
            "count_cells_historic_footprint"
          ),

        temp:
          measurement(tempRecord, "surf_anomaly_c"),

        tempAverage:
          measurement(tempRecord, "surf_avg_c"),

        temperatureDays:
          measurement(tempRecord, "surf_days"),

        up:
          measurement(upRecord, "cuti_avg_m2_s"),

        upAnomaly:
          measurement(upRecord, "cuti_anomaly_m2_s"),

        upwellingMonths:
          measurement(upRecord, "cuti_months")
      };
    }
  );

  data = combined;
  ready = true;

  if ($("#time")) {
    $("#time").min = 0;
    $("#time").max = data.length - 1;
  }

  setText(
    "#upUnit",
    "Regional CUTI at 33°N · m²/s"
  );

  showStatus(
    `PROJECT DATA · ${kelpRows.size} kelp, ` +
    `${tempRows.size} temperature, ` +
    `${upRows.size} CUTI quarters · ` +
    "1995 Q4 kelp is missing; 1996 Q1 is a flagged reported zero pending team review."
  );

  const validPairs = data.filter(row =>
    row.kelp !== null && row.temp !== null
  ).length;

  console.info(
    `Loaded ${data.length} calendar quarters; ` +
    `${validPairs} same-quarter kelp–temperature pairs.`
  );

  renderCalendar();
  select(0, true);
  setControlsDisabled(false);
}

// Load the three project CSVs automatically.
for (const selector of [
  "#reset",
  "#upload",
  'label[for="upload"]'
]) {
  if ($(selector)) {
    $(selector).hidden = true;
  }
}

setControlsDisabled(true);
showStatus("Loading project data…");

resize();
requestAnimationFrame(draw);

loadProjectData().catch(error => {
  ready = false;
  playing = false;
  visual = null;
  transition = null;

  setControlsDisabled(true);
  console.error(error);

  showStatus(
    `DATA LOAD FAILED · ${error.message}`,
    true
  );
});
// Redraw labels at their real CSS width so iframe text is never shrunk to desktop size.
for (const selector of ['#series', '#scatter']) {
  const svg = $(selector);
  if (svg) {
    let previousWidth = 0;
    new ResizeObserver(() => {
      const width = chartWidth(svg);
      if (ready && width !== previousWidth) { previousWidth = width; series(); scatter(); }
    }).observe(svg);
  }
}
