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

function renderCalendar() {
  const calendar = $("#calendar");

  if (!calendar) {
    return;
  }

  const [minimum, maximum] = extent(
    data.map(row => row.kelp)
  );

  calendar.style.gridTemplateColumns =
    `repeat(${END_YEAR - START_YEAR + 1}, minmax(0, 1fr))`;

  calendar.replaceChildren();

  for (let quarter = 1; quarter <= 4; quarter++) {
    data.forEach((row, index) => {
      if (row.quarter !== quarter) {
        return;
      }

      const button = document.createElement("button");

      button.className = "calcell";
      button.dataset.i = index;

      button.style.background = row.kelp === null
        ? "#647579"
        : `hsl(100 30% ${
            75 - 48 * norm(row.kelp, minimum, maximum)
          }%)`;

      const valueLabel = row.kelp === null
        ? "Missing"
        : `${fmt(row.kelp)} m²`;

      button.title =
        `${row.year} Q${quarter}: ${valueLabel}`;

      button.setAttribute("aria-label", button.title);
      button.onclick = () => select(index);

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

function series() {
  const svg = $("#series");

  if (!svg) {
    return;
  }

  svg.replaceChildren();

  const keys = ["kelp", "temp", "up"];
  const colors = ["#bdd794", "#edac86", "#82c8de"];
  const units = ["m²", "°C", "m²/s"];

  keys.forEach((key, panel) => {
    const [minimum, maximum] = extent(
      data.map(row => row[key])
    );

    const top = 15 + panel * 103;
    const height = 75;

    const X = index =>
      68 + index / (data.length - 1) * 910;

    const Y = value =>
      top + height -
      (value - minimum) / (maximum - minimum || 1) * height;

    el(
      "line",
      {
        x1: 68,
        x2: 978,
        y1: top + height,
        y2: top + height,
        stroke: "#ffffff20"
      },
      svg
    );

    txt(svg, 0, top + 12, units[panel]);

    txt(
      svg,
      0,
      top + 30,
      panel === 0 ? fmt(maximum) : maximum.toFixed(2)
    );

    txt(
      svg,
      0,
      top + height,
      panel === 0 ? fmt(minimum) : minimum.toFixed(2)
    );

    let path = "";
    let connected = false;

    data.forEach((row, index) => {
      if (!Number.isFinite(row[key])) {
        connected = false;
        return;
      }

      path +=
        `${connected ? "L" : "M"}${X(index)},${Y(row[key])}`;

      connected = true;
    });

    el(
      "path",
      {
        d: path,
        fill: "none",
        stroke: colors[panel],
        "stroke-width": 2
      },
      svg
    );

    el(
      "line",
      {
        x1: X(idx),
        x2: X(idx),
        y1: top,
        y2: top + height,
        stroke: "#ffffff90",
        "stroke-dasharray": "3 4"
      },
      svg
    );

    if (Number.isFinite(data[idx][key])) {
      el(
        "circle",
        {
          cx: X(idx),
          cy: Y(data[idx][key]),
          r: 4,
          fill: "#f0f6df"
        },
        svg
      );
    }
  });

  for (const index of [0, 20, 40, 60, 80, 100, 123]) {
    txt(
      svg,
      68 + index / (data.length - 1) * 910 - 12,
      332,
      data[index].year
    );
  }
}

function scatter() {
  const svg = $("#scatter");

  if (!svg) {
    return;
  }

  svg.replaceChildren();

  const key = $("#variable")?.value ?? "temp";
  const lag = Number($("#lag")?.value ?? 0);

  const environment = anomalies(key);
  const kelp = anomalies("kelp");
  const pairs = [];

  // Keep missing quarters in place so lags follow the calendar.
  for (let index = lag; index < data.length; index++) {
    if (
      Number.isFinite(environment[index - lag]) &&
      Number.isFinite(kelp[index])
    ) {
      pairs.push({
        x: environment[index - lag],
        y: kelp[index],
        index
      });
    }
  }

  setText(
    "#pairCount",
    `${pairs.length} paired quarters · project data`
  );

  if (!pairs.length) {
    setText("#rval", "r unavailable");

    txt(
      svg,
      90,
      180,
      "No paired observations for this comparison."
    );

    return;
  }

  const [xmin, xmax] = extent(
    pairs.map(point => point.x)
  );

  const [ymin, ymax] = extent(
    pairs.map(point => point.y)
  );

  const X = value =>
    65 + (value - xmin) / (xmax - xmin || 1) * 510;

  const Y = value =>
    305 - (value - ymin) / (ymax - ymin || 1) * 275;

  for (let tick = 0; tick < 5; tick++) {
    const y = 30 + tick * 68.75;
    const xValue = xmin + tick * (xmax - xmin) / 4;

    el(
      "line",
      {
        x1: 65,
        x2: 575,
        y1: y,
        y2: y,
        stroke: "#ffffff16"
      },
      svg
    );

    txt(
      svg,
      2,
      y + 4,
      fmt(ymax - tick * (ymax - ymin) / 4),
      undefined,
      9
    );

    txt(
      svg,
      X(xValue) - 10,
      325,
      xValue.toFixed(2),
      undefined,
      10
    );
  }

  txt(svg, 65, 16, "Kelp area anomaly (m²)");

  txt(
    svg,
    130,
    358,
    key === "temp"
      ? "Temperature anomaly (°C)"
      : "CUTI anomaly (m²/s)"
  );

  for (const point of pairs) {
    const circle = el(
      "circle",
      {
        cx: X(point.x),
        cy: Y(point.y),
        r: point.index === idx ? 6 : 3.5,
        fill: point.index === idx
          ? "#fff6c5"
          : `hsl(${
              160 + point.index / (data.length - 1) * 35
            } 35% 65%)`,
        opacity: point.index === idx ? 1 : 0.6,
        tabindex: 0
      },
      svg
    );

    const kelpDate = data[point.index];
    const environmentalDate = data[point.index - lag];
    const title = el("title", {}, circle);

    title.textContent =
      `Kelp: ${kelpDate.year} Q${kelpDate.quarter}, ` +
      `anomaly ${fmt(point.y)} m²; ` +
      `environment: ${environmentalDate.year} ` +
      `Q${environmentalDate.quarter}, ` +
      `anomaly ${point.x.toFixed(3)} ` +
      `${key === "temp" ? "°C" : "m²/s"}`;

    circle.style.cursor = "pointer";
    circle.onclick = () => select(point.index);

    circle.onkeydown = event => {
      if (event.key === "Enter") {
        select(point.index);
      }
    };
  }

  const count = pairs.length;

  const meanX =
    pairs.reduce((sum, point) => sum + point.x, 0) / count;

  const meanY =
    pairs.reduce((sum, point) => sum + point.y, 0) / count;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const point of pairs) {
    covariance +=
      (point.x - meanX) * (point.y - meanY);

    varianceX += (point.x - meanX) ** 2;
    varianceY += (point.y - meanY) ** 2;
  }

  const correlation =
    covariance / Math.sqrt(varianceX * varianceY);

  setText(
    "#rval",
    Number.isFinite(correlation)
      ? `r = ${correlation.toFixed(2)}`
      : "r unavailable"
  );

  if (varianceX > 0 && count > 1) {
    el(
      "line",
      {
        x1: X(xmin),
        y1: Y(
          meanY + covariance / varianceX * (xmin - meanX)
        ),
        x2: X(xmax),
        y2: Y(
          meanY + covariance / varianceX * (xmax - meanX)
        ),
        stroke: "#e6d8a5",
        "stroke-width": 1.5,
        "stroke-dasharray": "5 5"
      },
      svg
    );
  }
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
      : norm(row.kelp, 0, maximumKelp),

    warm:
      ($("#tempFx")?.checked ?? true) &&
      row.temp !== null
        ? Math.max(-1, Math.min(1, row.temp / 2.5))
        : 0,

    current:
      row.up === null || maximumTransport === 0
        ? 0
        : row.up / maximumTransport,

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
    row.kelp === null ? "Missing" : `${fmt(row.kelp)} m²`
  );

  setText(
    "#tempVal",
    row.temp === null
      ? "Missing"
      : `${row.temp > 0 ? "+" : ""}${row.temp.toFixed(2)} °C`
  );

  setText(
    "#upVal",
    row.up === null ? "Missing" : row.up.toFixed(3)
  );
}

function setDates(row, animate) {
  return [
    ["#date", `${row.year} · Q${row.quarter}`],
    [
      "#sceneDate",
      `${seasons[row.quarter - 1]} ${row.year}`
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
        `Selected observation: ${data[idx][key] ?? "Missing"}`;
    }
  }

  series();
  scatter();
}

on("#series", "onclick", event => {
  const bounds = event.currentTarget.getBoundingClientRect();

  const position =
    ((event.clientX - bounds.left) /
      bounds.width * 1000 - 68) / 910;

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

  // Positive CUTI moves ribbons upward; negative CUTI moves them downward.
  if (currentAlpha > 0) {
    for (let particle = 0; particle < 40; particle++) {
      const alpha =
        currentAlpha *
        Math.max(
          0,
          Math.min(1, strength * 40 - particle)
        );

      if (alpha === 0) {
        continue;
      }

      const x = rand(particle + 30) * w;
      const cycle = h + 30;
      const position =
        currentTravel + rand(particle + 200) * h;

      const y =
        h - ((position % cycle + cycle) % cycle);

      ctx.beginPath();
      ctx.moveTo(x, y + 18);

      ctx.quadraticCurveTo(
        x + Math.sin(time + particle) * 15,
        y,
        x + Math.sin(time + particle + 1) * 10,
        y - 18
      );

      ctx.strokeStyle =
        `rgba(138,216,229,${
          alpha * (0.07 + strength * 0.16)
        })`;

      ctx.lineWidth = 1;
      ctx.stroke();
    }
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
        (coverage - rand(plant + 500)) * 90
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

  // Cool-temperature edge effect.
  if (warm < 0) {
    const frost = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.25,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7
    );

    frost.addColorStop(0, "#b1eaff00");

    frost.addColorStop(
      1,
      `rgba(169,220,240,${-warm * 0.22})`
    );

    ctx.fillStyle = frost;
    ctx.fillRect(0, 0, w, h);
  }

  if (data[idx].kelp === null) {
    ctx.fillStyle = "#e9edde";
    ctx.font = "14px system-ui";

    ctx.fillText(
      "No kelp measurement for this quarter",
      25,
      h * 0.55
    );
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
    "1995 Q4 kelp is missing."
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