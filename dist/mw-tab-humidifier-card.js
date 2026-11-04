/* mw-ha-tab-humidifier-card — custom:mw-tab-humidifier-card
 * A tela inteira de um umidificador a partir de UMA chave: o dispositivo.
 * O card lê as entidades daquele dispositivo (tomada, LED, mute, sleep, nível
 * de spray) e compõe o desenho que antes era escrito à mão em ~110 linhas:
 *   aba UMIDIFICADOR → faixa de umidade (mw-rainbow-card) + foto + os botões
 *                      (mw-humidifier-card) + o nível (mw-humidifier-level-card)
 *   aba ENERGIA      → a tomada em custom:power-button-card, com os sensores
 *                      de tensão/corrente/potência achados sozinhos
 * tudo dentro de um custom:mw-tab-card, que é quem desenha casca, abas e papel.
 *
 * Nada é redesenhado aqui: este card é o COMPOSITOR — irmão do
 * mw-ha-tab-lights-card. Editor visual rico e YAML editável pedaço por pedaço.
 *
 * Sem build, sem dependências de bundler: JS puro + <ha-form> do HA.
 * Repo: https://github.com/visaodeempresa/mw-ha-tab-humidifier-card
 */
(() => {
  "use strict";

  const VERSION = "0.8.1";
  /* ------------------------------------------------------------ utilidades */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

  /** merge profundo; array substitui (lista é decisão, não acúmulo). */
  const deepMerge = (base, over) => {
    if (!isObj(over)) return over === undefined ? base : over;
    const out = { ...(isObj(base) ? base : {}) };
    for (const [k, v] of Object.entries(over)) {
      if (v === null) { delete out[k]; continue; }
      out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
    }
    return out;
  };

  /** tira vazio: default intacto não polui o YAML (regra da família). */
  const clean = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) {
      if (v === undefined || v === null || v === "") continue;
      out[k] = v;
    }
    return out;
  };

  /** o que MUDOU de `base` para `next` — é isso que vira override no YAML. */
  const diffObj = (base, next) => {
    const out = {};
    for (const [k, v] of Object.entries(next || {})) {
      if (JSON.stringify(base ? base[k] : undefined) !== JSON.stringify(v)) out[k] = v;
    }
    return out;
  };

  const sig = (v) => { try { return JSON.stringify(v); } catch (_) { return String(v); } };

  // >>> paper-palette v1 — fonte canônica: /Volumes/SSD-T1-01/CLAUDE-SSD/IA/lib/paper-palette/paper-palette.js
  // 49 papéis encardidos: 7 matizes do arco-íris × 7 tons (1 = quase branco,
  // 7 = mais encardido). Saturação baixa de propósito — papel descansa a vista.
  const PAPER_HUES = [
    ["red", "Vermelho", 6], ["orange", "Laranja", 27], ["yellow", "Amarelo", 47],
    ["green", "Verde", 96], ["blue", "Azul", 203], ["indigo", "Anil", 236],
    ["violet", "Violeta", 283],
  ];
  const PAPER_TONES = [[97, 6], [96, 9], [94, 12], [92, 15], [90, 18], [88, 21], [85, 24]];
  const paperOptions = () => [{ value: "paper", label: "Papel original (creme)" }].concat(
    ...PAPER_HUES.map((h) => PAPER_TONES.map((t, i) => ({
      value: `${h[0]}-${i + 1}`,
      label: `${h[1]} · tom ${i + 1}${i === 0 ? " (mais claro)" : i === 6 ? " (mais encardido)" : ""}`,
    }))));
  // <<< paper-palette v1

  // >>> paper-dark-palette v1 — fonte canônica: IA/lib/paper-palette/paper-dark-palette.js
  const PAPER_DARK_TONES = [[26, 10], [24, 13], [21, 16], [19, 19], [16, 22], [14, 25], [11, 28]];
  const paperDarkOptions = () => [{ value: "paper", label: "Papel de noite (grafite)" }].concat(
    ...PAPER_HUES.map((h) => PAPER_DARK_TONES.map((t, i) => ({
      value: `${h[0]}-${i + 1}`,
      label: `${h[1]} · tom ${i + 1}${i === 0 ? " (mais claro)" : i === 6 ? " (mais escuro)" : ""}`,
    }))));
  // <<< paper-dark-palette v1

  // >>> paper-grafite-palette v1 — fonte canônica: /Volumes/SSD-T1-01/CLAUDE-SSD/IA/lib/paper-grafite-palette/paper-grafite-palette.js
  // 7 tons de grafite (1 = mais claro ainda, 7 = mais encardido). Matiz 30° da
  // casa, saturação 4–13%: neutro de propósito — grafite não é colorido.
  // A saturação sobe devagar com a escuridão, mas JAMAIS alcança a escala
  // das matizes encardidas (que sobe a 28%): a linha grafite é neutra.
  const GRAFITE_HUE = 30;
  const GRAFITE_TONES = [[52, 4], [42, 5], [34, 6], [26, 7], [18, 9], [12, 11], [8, 13]];
  const GRAFITE_DEFAULT = "linear-gradient(145deg, #2b2825, #161411)";
  const GRAFITE_INK = "rgba(247, 244, 236, 0.94)";
  const isGrafite = (key) => /^grafite-[1-7]$/.test(String(key || "").trim());
  const grafiteGradient = (key) => {
    const m = isGrafite(key) && /^grafite-([1-7])$/.exec(String(key).trim());
    if (!m) return GRAFITE_DEFAULT;
    const [l, s] = GRAFITE_TONES[+m[1] - 1];
    return `linear-gradient(145deg, hsl(${GRAFITE_HUE}, ${s}%, ${l}%), hsl(${GRAFITE_HUE}, ${s + 4}%, ${Math.max(4, l - 6)}%))`;
  };
  const grafiteStops = (key) => {
    const m = isGrafite(key) && /^grafite-([1-7])$/.exec(String(key).trim());
    if (!m) return ["#2b2825", "#161411"];
    const [l, s] = GRAFITE_TONES[+m[1] - 1];
    return [`hsl(${GRAFITE_HUE}, ${s}%, ${l}%)`, `hsl(${GRAFITE_HUE}, ${s + 4}%, ${Math.max(4, l - 6)}%)`];
  };
  const grafiteOptions = () => GRAFITE_TONES.map((t, i) => ({
    value: `grafite-${i + 1}`,
    label: `Grafite · tom ${i + 1}${i === 0 ? " (mais claro ainda)" : i === 1 ? " (claro)" : i === 6 ? " (mais encardido)" : ""}`,
  }));
  // <<< paper-grafite-palette v1

  // ---- cor: parse / compose (mantém alfa, que o desenho usa muito) ----
  const parseColor = (str) => {
    const s = String(str || "").trim();
    let m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) { const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16)); return { r, g, b, a: 1 }; }
    return { r: 128, g: 128, b: 128, a: 1 };
  };
  const toHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const toRgba = ({ r, g, b, a }) => `rgba(${r}, ${g}, ${b}, ${a})`;


  /* ------------------------------------------------------------- defaults */

  const DEFAULTS = {
    device: "",                 // o umidificador (LocalTuya, Tuya, ESPHome…)
    socket_device: "",          // a tomada que o alimenta — vira a aba ENERGIA
    socket_entity: "",          // ou o interruptor direto, quando não há device
    image: "",                  // /local/devices/…webp — a foto do aparelho
    rainbow: true,              // a faixa de umidade da casa no topo
    energy_tab: true,
    level: true,
    spacers: 2,                 // empurram os botões para a base da foto
    socket_align: "bottom",     // alinhamento do botão de tomada quando substitui controles (bottom|center|top)
    button_icon_size: 65,
    paper_color: "orange-7",
    shell_color: "rgba(68, 68, 68, 0.5)",
    heading: "💧 UMIDIFICADOR",
    energy_heading: "🔌 TOMADAS ELÉTRICAS",
  };

  const TABS_DEFAULTS = {
    tab_display: "icon",
    tab_icon_size: 32,
    tab_position: "right",
    keep_alive: false,
  };

  const HUM_TAB = { label: "UMIDIFICADOR", icon: "mdi:water" };
  const ENERGY_TAB = { label: "ENERGIA", icon: "mdi:flash" };

  // O arco-íris do topo é a umidade de vários cômodos lado a lado: sem rótulo
  // de seção nem de faixa, porque o que se lê ali é a COR e o número.
  const RAINBOW_DEFAULTS = {
    bands: [{ metric: "humidity" }],
    section_labels: "none",
    band_labels: "none",
    name_size: 17,
  };

  const LEVEL_DEFAULTS = { height: 50, level_scheme: "semaforo", level_paint: "both" };

  const POWER_DEFAULTS = {
    name: "TOMADA",
    device_icon: "mdi:flash",
    protocol_icon: "mdi:wifi",
    background_image_url: "/local/devices/ha-integration-tuya.png",
    confirm: true,
    only_power: true,
    power_font_size: 20,
    only_power_lift: 3,
  };

  /* -------------------------------- descoberta ------------------------------ */

  const entitiesOfDevice = (hass, dev) => {
    if (!hass || !dev) return [];
    if (hass.entities) {
      return Object.keys(hass.entities).filter((id) => {
        const e = hass.entities[id];
        return e && e.device_id === dev && !e.hidden_by && !e.disabled_by;
      });
    }
    if (hass.states) {
      const devName = (hass.devices && hass.devices[dev] && (hass.devices[dev].name_by_user || hass.devices[dev].name || "").toLowerCase()) || "";
      const devSlug = devName.replace(/[^a-z0-9]/g, "_");
      return Object.keys(hass.states).filter((id) => {
        const st = hass.states[id];
        if (!st || st.state === "unavailable") return false;
        if (devSlug && id.includes(devSlug)) return true;
        return false;
      });
    }
    return [];
  };

  const friendly = (hass, id) => {
    const st = hass && hass.states && hass.states[id];
    return (st && st.attributes && st.attributes.friendly_name) || id;
  };

  const deviceName = (hass, dev) => {
    const d = hass && hass.devices && hass.devices[dev];
    return (d && (d.name_by_user || d.name)) || dev || "—";
  };

  // A ordem dos botões é a do desenho: a tomada primeiro (é ela que liga tudo),
  // depois LED, mute e sleep. O que não casar com nenhum padrão vai para o fim,
  // na ordem do registro — nunca some.
  const BTN_ORDER = [/tomada|socket|plug|power/, /led|luz/, /mute|som|sound|beep/, /sleep|noite|night/];
  const rankOf = (id) => {
    const low = id.toLowerCase();
    for (let i = 0; i < BTN_ORDER.length; i++) if (BTN_ORDER[i].test(low)) return i;
    return BTN_ORDER.length;
  };

  const switchesOfDevice = (hass, dev) => entitiesOfDevice(hass, dev)
    .filter((id) => id.indexOf("switch.") === 0)
    .map((id, i) => [id, rankOf(id), i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map((x) => x[0]);

  const pick = (ids, re) => ids.find((id) => re.test(id.toLowerCase())) || "";

  const levelOfDevice = (hass, dev) => {
    const sels = entitiesOfDevice(hass, dev).filter((id) => id.indexOf("select.") === 0);
    return pick(sels, /spray|level|nivel|n[ií]vel|mist/) || sels[0] || "";
  };

  /** a tomada: entidade explícita › switch do device da tomada › nada. */
  const socketEntity = (hass, cfg) => {
    if (cfg.socket_entity) return cfg.socket_entity;
    const sws = entitiesOfDevice(hass, cfg.socket_device).filter((id) => id.indexOf("switch.") === 0);
    return pick(sws, /socket|tomada|plug/) || sws[0] || "";
  };

  const powerSensors = (hass, cfg) => {
    const ids = entitiesOfDevice(hass, cfg.socket_device).filter((id) => id.indexOf("sensor.") === 0);
    return {
      sensor_voltagem: pick(ids, /voltagem|voltage|tensao|tens[aã]o/),
      sensor_corrente: pick(ids, /corrente|current/),
      sensor_potencia: pick(ids, /potencia|pot[eê]ncia|power/),
    };
  };

  const powerActive = (hass, cfg, defaultThreshold = 5) => {
    if (!hass || !hass.states) return false;
    const sockSt = socketState(hass, cfg);
    if (sockSt === "off" || sockSt === "unavailable" || sockSt === "unknown") return false;
    let pEnt = cfg.sensor_potencia;
    if (!pEnt && cfg.power_options && cfg.power_options.sensor_potencia) {
      pEnt = cfg.power_options.sensor_potencia;
    }
    if (!pEnt) {
      const sensors = powerSensors(hass, cfg);
      if (sensors && sensors.sensor_potencia) pEnt = sensors.sensor_potencia;
    }
    if (!pEnt && cfg.socket_device && hass.devices && hass.entities) {
      for (const [id, ent] of Object.entries(hass.entities)) {
        if (ent.device_id === cfg.socket_device && id.startsWith("sensor.") && id.includes("potencia")) {
          pEnt = id;
          break;
        }
      }
    }
    if (!pEnt) {
      const sock = socketEntity(hass, cfg);
      if (sock) {
        const base = sock.replace(/^switch\./, "").replace(/_socket_\d+$/, "").replace(/_principal$/, "");
        const cand = "sensor." + base + "_potencia";
        if (hass.states[cand]) pEnt = cand;
      }
    }
    if (!pEnt || !hass.states[pEnt]) return false;
    const val = parseFloat(hass.states[pEnt].state);
    const th = Number.isFinite(Number(cfg.power_threshold)) ? Number(cfg.power_threshold) : defaultThreshold;
    return Number.isFinite(val) && val >= th;
  };

  const humidifierEntity = (hass, cfg) => {
    if (cfg.humidifier_entity) return cfg.humidifier_entity;
    const hums = entitiesOfDevice(hass, cfg.device).filter((id) => id.indexOf("humidifier.") === 0);
    return hums[0] || "";
  };

  const humidifierStatus = (hass, cfg) => {
    if (!hass || !hass.states) return "unknown";
    const ent = humidifierEntity(hass, cfg);
    if (ent && hass.states[ent]) {
      return hass.states[ent].state;
    }
    const botoes = Array.isArray(cfg.buttons) && cfg.buttons.length
      ? cfg.buttons.map((b) => (typeof b === "string" ? b : b && b.entity)).filter(Boolean)
      : switchesOfDevice(hass, cfg.device);
    if (botoes.length) {
      const states = botoes.map((s) => hass.states[s]?.state).filter(Boolean);
      if (states.every((st) => st === "unavailable" || st === "unknown")) return "unavailable";
      if (states.some((st) => st === "on")) return "on";
      return "off";
    }
    return "unknown";
  };

  const socketState = (hass, cfg) => {
    const ent = socketEntity(hass, cfg);
    return ent && hass && hass.states && hass.states[ent] ? hass.states[ent].state : null;
  };

  /* ------------------------------------------------ composição da config */

  const humidifierCard = (hass, cfg) => {
    const botoes = Array.isArray(cfg.buttons) && cfg.buttons.length
      ? cfg.buttons.filter((b) => b && b.hidden !== true)
      : switchesOfDevice(hass, cfg.device);
    return {
      type: "custom:mw-humidifier-card",
      mode: "only_humidifier",
      device: cfg.device,
      buttons: botoes.filter(Boolean),
      button_icon_size: Number(cfg.button_icon_size) || DEFAULTS.button_icon_size,
      ...clean(cfg.humidifier_options || {}),
    };
  };

  const rainbowCard = (hass, cfg) => ({
    type: "custom:mw-rainbow-card",
    sections: (cfg.rainbow_devices || []).map((d) => (isObj(d) ? d : { device: d })),
    ...RAINBOW_DEFAULTS,
    ...clean(cfg.rainbow_options || {}),
  });

  const levelCard = (hass, cfg) => {
    const ent = cfg.level_entity || levelOfDevice(hass, cfg.device);
    if (!ent) return null;
    return {
      type: "custom:mw-humidifier-level-card",
      entity: ent,
      device: cfg.device,
      ...LEVEL_DEFAULTS,
      ...clean(cfg.level_options || {}),
      grid_options: { rows: "auto" },
    };
  };

  const powerCard = (hass, cfg) => {
    const ent = socketEntity(hass, cfg);
    if (!ent) return null;
    return {
      type: "custom:power-button-card",
      entity: ent,
      ...POWER_DEFAULTS,
      ...clean(powerSensors(hass, cfg)),
      ...clean(cfg.power_options || {}),
    };
  };

  const getPowerEntity = (hass, cfg) => {
    if (!hass || !hass.states) return "";
    let pEnt = cfg.sensor_potencia;
    if (!pEnt && cfg.power_options && cfg.power_options.sensor_potencia) {
      pEnt = cfg.power_options.sensor_potencia;
    }
    if (!pEnt) {
      const sensors = powerSensors(hass, cfg);
      if (sensors && sensors.sensor_potencia) pEnt = sensors.sensor_potencia;
    }
    if (!pEnt && cfg.socket_device && hass.devices && hass.entities) {
      for (const [id, ent] of Object.entries(hass.entities)) {
        if (ent.device_id === cfg.socket_device && id.startsWith("sensor.") && (id.includes("potencia") || id.includes("power"))) {
          pEnt = id;
          break;
        }
      }
    }
    if (!pEnt) {
      const sock = socketEntity(hass, cfg);
      if (sock) {
        const base = sock.replace(/^switch\./, "").replace(/_socket_\d+$/, "").replace(/_principal$/, "");
        const cand = "sensor." + base + "_potencia";
        if (hass.states[cand]) pEnt = cand;
      }
    }
    return pEnt || "";
  };

  const getVoltageEntity = (hass, cfg) => {
    if (!hass || !hass.states) return "";
    let vEnt = cfg.sensor_voltagem || (cfg.power_options && cfg.power_options.sensor_voltagem);
    if (!vEnt) {
      const s = powerSensors(hass, cfg);
      if (s && s.sensor_voltagem) vEnt = s.sensor_voltagem;
    }
    if (!vEnt && cfg.socket_device && hass.devices && hass.entities) {
      for (const [id, ent] of Object.entries(hass.entities)) {
        if (ent.device_id === cfg.socket_device && id.startsWith("sensor.") && (id.includes("voltagem") || id.includes("tensao") || id.includes("voltage"))) {
          vEnt = id;
          break;
        }
      }
    }
    if (!vEnt) {
      const sock = socketEntity(hass, cfg);
      if (sock) {
        const base = sock.replace(/^switch\./, "").replace(/_socket_\d+$/, "").replace(/_principal$/, "");
        const cand1 = "sensor." + base + "_voltagem";
        const cand2 = "sensor." + base + "_tensao";
        if (hass.states[cand1]) vEnt = cand1;
        else if (hass.states[cand2]) vEnt = cand2;
      }
    }
    return vEnt || "";
  };

  const getCurrentEntity = (hass, cfg) => {
    if (!hass || !hass.states) return "";
    let cEnt = cfg.sensor_corrente || (cfg.power_options && cfg.power_options.sensor_corrente);
    if (!cEnt) {
      const s = powerSensors(hass, cfg);
      if (s && s.sensor_corrente) cEnt = s.sensor_corrente;
    }
    if (!cEnt && cfg.socket_device && hass.devices && hass.entities) {
      for (const [id, ent] of Object.entries(hass.entities)) {
        if (ent.device_id === cfg.socket_device && id.startsWith("sensor.") && (id.includes("corrente") || id.includes("current"))) {
          cEnt = id;
          break;
        }
      }
    }
    if (!cEnt) {
      const sock = socketEntity(hass, cfg);
      if (sock) {
        const base = sock.replace(/^switch\./, "").replace(/_socket_\d+$/, "").replace(/_principal$/, "");
        const cand = "sensor." + base + "_corrente";
        if (hass.states[cand]) cEnt = cand;
      }
    }
    return cEnt || "";
  };

  const getTotalEnergyEntity = (hass, cfg) => {
    if (!hass || !hass.states) return "";
    let eEnt = cfg.sensor_energia || (cfg.power_options && cfg.power_options.sensor_energia);
    if (!eEnt && cfg.socket_device && hass.devices && hass.entities) {
      for (const [id, ent] of Object.entries(hass.entities)) {
        if (ent.device_id === cfg.socket_device && id.startsWith("sensor.") && (id.includes("energia") || id.includes("energy"))) {
          eEnt = id;
          break;
        }
      }
    }
    if (!eEnt) {
      const sock = socketEntity(hass, cfg);
      if (sock) {
        const base = sock.replace(/^switch\./, "").replace(/_socket_\d+$/, "").replace(/_principal$/, "");
        const cand = "sensor." + base + "_energia_total";
        if (hass.states[cand]) eEnt = cand;
      }
    }
    return eEnt || "";
  };

  const buildAdminTabs = (hass, cfg, meta) => {
    const isAdmin = Boolean((hass && hass.user && hass.user.is_admin) || cfg.is_admin);
    if (!isAdmin) return [];

    const sockEnt = socketEntity(hass, cfg);
    const sockObj = sockEnt && hass.states ? hass.states[sockEnt] : null;
    const sockAttrs = (sockObj && sockObj.attributes) || {};
    const sockState = sockObj ? sockObj.state : "desconhecido";

    const pEnt = getPowerEntity(hass, cfg);
    const pObj = pEnt && hass.states ? hass.states[pEnt] : null;
    const pVal = pObj ? `${pObj.state} ${pObj.attributes?.unit_of_measurement || "W"}` : "—";

    const vEnt = getVoltageEntity(hass, cfg);
    const vObj = vEnt && hass.states ? hass.states[vEnt] : null;
    const vVal = vObj ? `${vObj.state} ${vObj.attributes?.unit_of_measurement || "V"}` : "—";

    const cEnt = getCurrentEntity(hass, cfg);
    const cObj = cEnt && hass.states ? hass.states[cEnt] : null;
    const cVal = cObj ? `${cObj.state} ${cObj.attributes?.unit_of_measurement || "A"}` : "—";

    const eEnt = getTotalEnergyEntity(hass, cfg);
    const eObj = eEnt && hass.states ? hass.states[eEnt] : null;
    const eVal = eObj ? `${eObj.state} ${eObj.attributes?.unit_of_measurement || "kWh"}` : "—";

    const localIp = sockAttrs.local_ip || "192.168.2.x";
    const connMode = sockAttrs.connection_mode || "hybrid_local_first";
    const devId = sockAttrs.tuya_device_id || cfg.device || cfg.socket_device || "—";
    const appName = meta.title || "Aparelho";
    const appEnt = meta.entity || "—";
    const appType = meta.type || "Aparelho Inteligente";

    const infoMarkdown = `| Parâmetro | Valor |
| :--- | :--- |
| **Aparelho** | **${appName}** |
| **Entidade** | \`${appEnt}\` |
| **Tomada** | \`${sockEnt || "Não configurada"}\` |
| **Status** | ${sockState === "on" ? "🟢 **LIGADA**" : (sockState === "off" ? "🔴 **DESLIGADA**" : `**${sockState.toUpperCase()}**`)} |
| **Potência** | \`${pVal}\` |
| **Tensão** | \`${vVal}\` |
| **Corrente** | \`${cVal}\` |
| **Consumo** | \`${eVal}\` |
| **IP Local** | \`${localIp}\` |
| **Protocolo** | \`${connMode}\` |
| **Tuya ID** | \`${devId}\` |
| **Soberania** | 🔒 \`NO-NET\` (Air-Gapped) |
`;

    const tabDevices = {
      label: "DISPOSITIVOS",
      icon: "mdi:devices",
      cards: [
        {
          type: "markdown",
          card_mod: {
            style: `ha-card {
  background: rgba(0, 0, 0, 0.40) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px !important;
  padding: 8px 12px !important;
  max-height: 290px !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
  --primary-text-color: #f5f5f5;
}
table {
  width: 100% !important;
  font-size: 11px !important;
  border-collapse: collapse !important;
}
th, td {
  padding: 4px 6px !important;
  line-height: 1.3 !important;
}`,
          },
          content: infoMarkdown,
        },
      ],
    };

    // 2. Tab AUTOMAÇÕES
    let automations = Array.isArray(cfg.automations) ? [...cfg.automations] : [];
    if (!automations.length && hass.states) {
      const terms = meta.automationTerms || [];
      const entBases = [sockEnt, meta.entity].filter(Boolean).map((e) => e.split(".").pop().toLowerCase());
      for (const key of Object.keys(hass.states)) {
        if (!key.startsWith("automation.")) continue;
        const low = key.toLowerCase();
        const fn = (hass.states[key].attributes?.friendly_name || "").toLowerCase();
        let match = terms.some((t) => low.includes(t.toLowerCase()) || fn.includes(t.toLowerCase()));
        if (!match) {
          match = entBases.some((b) => b.length > 4 && (low.includes(b) || fn.includes(b)));
        }
        if (match && !automations.includes(key)) automations.push(key);
      }
    }

    const autoCards = [];
    if (automations.length > 0) {
      autoCards.push({
        type: "entities",
        title: `Automações (${appName})`,
        show_header_toggle: false,
        state_color: true,
        card_mod: {
          style: `ha-card {
  background: rgba(0, 0, 0, 0.40) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px !important;
  max-height: 290px !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
}`,
        },
        entities: automations.map((id) => ({
          entity: id,
          secondary_info: "last-changed",
        })),
      });
    } else {
      autoCards.push({
        type: "markdown",
        card_mod: {
          style: `ha-card {
  background: rgba(0, 0, 0, 0.40) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px !important;
  padding: 14px !important;
  max-height: 290px !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
}`,
        },
        content: `### 🤖 Automações Vinculadas\n\nNenhuma automação vinculada encontrada especificamente para **${appName}** no momento.\n\n*Automações criadas no Home Assistant com o nome deste dispositivo aparecerão aqui automaticamente.*`,
      });
    }

    const tabAutomations = {
      label: "AUTOMAÇÕES",
      icon: "mdi:robot",
      cards: autoCards,
    };

    // 3. Tab ATIVIDADES
    const logEntities = new Set();
    if (sockEnt) logEntities.add(sockEnt);
    if (pEnt) logEntities.add(pEnt);
    if (vEnt) logEntities.add(vEnt);
    if (cEnt) logEntities.add(cEnt);
    if (meta.entity && meta.entity !== "—") logEntities.add(meta.entity);
    if (Array.isArray(meta.extraLogEntities)) {
      for (const e of meta.extraLogEntities) if (e && e !== "—") logEntities.add(e);
    }
    if (Array.isArray(cfg.buttons)) {
      for (const b of cfg.buttons) if (b && b.entity) logEntities.add(b.entity);
    }
    if (Array.isArray(cfg.log_entities)) {
      for (const e of cfg.log_entities) if (e) logEntities.add(e);
    }
    for (const a of automations) logEntities.add(a);

    const logList = Array.from(logEntities).filter(Boolean);

    const tabActivity = {
      label: "ATIVIDADES",
      icon: "mdi:history",
      cards: [
        {
          type: "logbook",
          title: `Atividades (${appName})`,
          hours_to_show: 24,
          entities: logList,
          target: { entity_id: logList },
          card_mod: {
            style: `ha-card {
  background: rgba(0, 0, 0, 0.40) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px !important;
  max-height: 290px !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
  --primary-text-color: #f5f5f5;
  --secondary-text-color: #d6d6d6;
}`,
          },
        },
      ],
    };

    return [tabDevices, tabAutomations, tabActivity];
  };
  const STEPS = [["W", "kW"], ["kW", "MW"], ["MW", "GW"]];
  const fmtPower = (raw, unit, lang) => {
    let v = Number.parseFloat(raw);
    if (!Number.isFinite(v)) return { value: String(raw ?? "—"), unit: unit || "W" };
    let u = unit || "W";
    const round1 = (x) => Math.round(x * 10) / 10;
    v = round1(v);
    for (const [from, to] of STEPS) {
      if (Math.abs(v) >= 10000 && u.toLowerCase() === from.toLowerCase()) { v = round1(v / 1000); u = to; }
    }
    let value;
    try {
      value = new Intl.NumberFormat(lang || "pt-BR",
        { maximumFractionDigits: 1, useGrouping: false }).format(v);
    } catch (e) {
      value = String(v);
    }
    return { value, unit: u };
  };


  let sharedPbcSheet = null;
  const getPbcStyleSheet = () => {
    if (!sharedPbcSheet && typeof CSSStyleSheet !== "undefined" && "adoptedStyleSheets" in Document.prototype) {
      try {
        sharedPbcSheet = new CSSStyleSheet();
        sharedPbcSheet.replaceSync(`
          :host {
            display: block !important;
            aspect-ratio: 1 / 1 !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          ha-card {
            aspect-ratio: 1 / 1 !important;
            height: 100% !important;
            max-height: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
        `);
      } catch (_) {
        sharedPbcSheet = null;
      }
    }
    return sharedPbcSheet;
  };

  /** a config do custom:mw-tab-card que este card vai montar. */
  const buildConfig = (hass, cfg) => {
    const cards = [];

    const sockEnt = socketEntity(hass, cfg);
    const sockSt = socketState(hass, cfg);
    const isSocketOff = Boolean(sockEnt && (sockSt === "off" || sockSt === "unavailable" || sockSt === "unknown"));

    const humSt = humidifierStatus(hass, cfg);
    const isHumActive = (humSt === "on" || humSt === "off");
    const showControls = !isSocketOff && isHumActive;

    let paperColor = "orange-7";
    if (!sockEnt || sockSt === "unavailable" || sockSt === "unknown") {
      paperColor = "#a5123f";
    } else if (sockSt === "off") {
      paperColor = "grafite-1";
    } else {
      paperColor = "orange-7";
    }

    if (cfg.rainbow !== false && (cfg.rainbow_devices || []).length) cards.push(rainbowCard(hass, cfg));

    if (isSocketOff) {
      // Tomada desligada: controles e nível ocultados; tomada colocada no lugar em formato de quadrado perfeito (1:1)
      const pc = powerCard(hass, cfg);
      const align = cfg.socket_align || DEFAULTS.socket_align;
      const marginCss = align === "center"
        ? "margin: auto 0 !important;"
        : align === "top"
          ? "margin-bottom: auto !important;"
          : "margin-top: auto !important;";
      const alignSelfCss = align === "center"
        ? "center"
        : align === "top"
          ? "start"
          : "end";

      const pcSquare = pc ? {
        ...pc,
        card_mod: {
          style: `ha-card { aspect-ratio: 1 / 1 !important; height: auto !important; ${marginCss} } :host { align-self: ${alignSelfCss} !important; }`,
          ...(pc.card_mod || {}),
        },
      } : null;

      if (cfg.image) {
        cards.push({
          type: "grid",
          columns: 2,
          square: false,
          cards: [
            { type: "picture", image: cfg.image },
            ...(pcSquare ? [pcSquare] : []),
          ],
        });
      } else if (pcSquare) {
        cards.push(pcSquare);
      }
    } else if (showControls) {
      // Tomada ligada e umidificador ativo (on/off): exibe controles e seletor de nível
      const n = Math.max(0, Math.min(6, Number(cfg.spacers) === 0 ? 0 : (Number(cfg.spacers) || DEFAULTS.spacers)));
      const coluna = {
        type: "grid",
        square: false,
        columns: 1,
        cards: [
          ...Array.from({ length: n }, () => ({ type: "custom:mushroom-empty-card" })),
          humidifierCard(hass, cfg),
        ],
      };
      cards.push(cfg.image
        ? { type: "grid", columns: 2, square: false, cards: [{ type: "picture", image: cfg.image }, coluna] }
        : coluna);

      const h = cfg.heading === undefined ? DEFAULTS.heading : cfg.heading;
      if (h) cards.push({ type: "heading", heading: h, heading_style: "title" });

      const lvl = cfg.level === false ? null : levelCard(hass, cfg);
      if (lvl) cards.push({ type: "grid", square: false, columns: 1, cards: [lvl] });
    } else {
      // Tomada ligada, mas umidificador indisponível/desconhecido: evita controles inalcançáveis
      const offlineMsg = {
        type: "markdown",
        content: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:140px;text-align:center;padding:14px 8px;opacity:0.75;box-sizing:border-box;">
          <ha-icon icon="mdi:air-humidifier-off" style="--mdc-icon-size:36px;margin-bottom:8px;color:var(--secondary-text-color);"></ha-icon>
          <div style="font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Umidificador</div>
          <div style="font-size:11px;opacity:0.8;margin-top:2px;">${humSt === "unavailable" ? "Indisponível" : "Desconectado"} · aguardando…</div>
        </div>`,
      };
      cards.push(cfg.image
        ? { type: "grid", columns: 2, square: false, cards: [{ type: "picture", image: cfg.image }, offlineMsg] }
        : offlineMsg);
    }

    for (const extra of (Array.isArray((cfg.extra_cards || {}).humidifier) ? cfg.extra_cards.humidifier : [])) cards.push(extra);

    const tabs = [];
    const t1 = { ...HUM_TAB, ...clean(cfg.humidifier_tab || {}) };
    tabs.push(deepMerge({ label: t1.label, icon: t1.icon, cards },
      (cfg.tabs_yaml || {}).humidifier || {}));

    const pc = cfg.energy_tab === false ? null : powerCard(hass, cfg);
    if (pc && !isSocketOff) {
      const t2 = { ...ENERGY_TAB, ...clean(cfg.energy_tab_options || {}) };
      const eh = cfg.energy_heading === undefined ? DEFAULTS.energy_heading : cfg.energy_heading;
      const ecards = [];
      if (eh) ecards.push({ type: "heading", heading: eh, heading_style: "title" });
      const pcEnergySquare = {
        ...pc,
        card_mod: {
          style: `ha-card { aspect-ratio: 1 / 1 !important; height: 100% !important; max-height: 100% !important; width: 100% !important; box-sizing: border-box !important; } :host { aspect-ratio: 1 / 1 !important; display: block !important; }`,
          ...(pc.card_mod || {}),
        },
      };
      ecards.push({
        type: "grid",
        square: true,
        columns: Math.max(1, Math.min(6, Number(cfg.energy_columns) || 2)),
        cards: [pcEnergySquare].concat(Array.isArray((cfg.extra_cards || {}).energy) ? cfg.extra_cards.energy : []),
      });
      tabs.push(deepMerge({ label: t2.label, icon: t2.icon, cards: ecards },
        (cfg.tabs_yaml || {}).energy || {}));
    }

    const meta = {
      title: "Umidificador",
      entity: cfg.humidifier_entity || humidifierEntity(hass, cfg) || "humidifier.umidificador_escritorio",
      type: "Umidificador de Ar",
      automationTerms: ["umidificador", "humidifier", "desumidificador"],
      extraLogEntities: [
        humidifierEntity(hass, cfg),
        ...(cfg.buttons || []).map((b) => b.entity),
      ],
    };
    const adminTabs = buildAdminTabs(hass, cfg, meta);
    for (const at of adminTabs) tabs.push(at);

    for (const t of (Array.isArray(cfg.extra_tabs) ? cfg.extra_tabs : [])) tabs.push(t);

    const root = {
      type: "custom:mw-tab-card",
      tabs,
      paper_color: paperColor,
      shell_color: cfg.shell_color || DEFAULTS.shell_color,
      ...TABS_DEFAULTS,
      ...clean(cfg.tabs_options || {}),
    };
    const override = { ...(cfg.yaml_override || {}) };
    if (isSocketOff) delete override.tabs;
    const finalCard = deepMerge(root, override);
    if (adminTabs.length && Array.isArray(finalCard.tabs)) {
      for (const at of adminTabs) {
        if (!finalCard.tabs.some((t) => t.label === at.label)) {
          finalCard.tabs.push(at);
        }
      }
    }
    return finalCard;
  };

  /* ------------------------------------------------------------------ CARD */

  class MwTabHumidifierCard extends HTMLElement {
    static getConfigElement() { return document.createElement("mw-tab-humidifier-card-editor"); }
    static getStubConfig() { return { device: "", rainbow: true, energy_tab: true }; }

    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      this._built = null;
      this._lastSockState = null;
      this._lastHumState = null;
      this._update();
    }

    set hass(hass) {
      const antes = this._hass;
      this._hass = hass;

      if (!hass || !this._config) return;

      if (hass.user && typeof hass.user.is_admin === "boolean") {
        this._isAdmin = hass.user.is_admin;
      }

      const sockEnt = socketEntity(hass, this._config);
      const sockSt = (sockEnt && hass.states && hass.states[sockEnt]) ? hass.states[sockEnt].state : null;
      const humSt = humidifierStatus(hass, this._config);

      const pEnt = getPowerEntity(hass, this._config);
      const pState = (pEnt && hass.states && hass.states[pEnt]) ? hass.states[pEnt].state : null;

      // registros mudam por REFERÊNCIA; estados dinâmicos (tomada, status do umidificador) monitorados diretamente
      const mexeu = !antes
        || antes.entities !== hass.entities
        || antes.devices !== hass.devices
        || antes.areas !== hass.areas
        || Boolean(antes.user && antes.user.is_admin) !== Boolean(hass.user && hass.user.is_admin)
        || Object.keys(antes.states || {}).length !== Object.keys(hass.states || {}).length
        || sockSt !== this._lastSockState
        || humSt !== this._lastHumState;

      const powerChanged = pState !== this._lastPowerState;

      this._lastSockState = sockSt;
      this._lastHumState = humSt;
      this._lastPowerState = pState;

      if (mexeu) {
        this._update();
      } else if (this._child) {
        this._child.hass = hass;
        this._scheduleEnforceSquare();
        if (powerChanged) {
          this._updatePowerFooter();
        }
      }
    }
    get hass() { return this._hass; }

    set editMode(v) { this._editMode = v; if (this._child) this._child.editMode = v; }
    get editMode() { return this._editMode; }

    connectedCallback() {
      this._setupObserver();
      this._update();
    }

    disconnectedCallback() {
      this._teardownObserver();
    }

    _setupObserver() {
      if (this._observer || typeof MutationObserver === "undefined") return;
      this._observer = new MutationObserver((mutations) => {
        let shouldEnforce = false;
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
            shouldEnforce = true;
            break;
          }
        }
        if (shouldEnforce) {
          this._scheduleEnforceSquare();
        }
      });
    }

    _teardownObserver() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
        this._isObserving = false;
      }
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this._enforcePending = false;
    }

    async getCardSize() {
      try { return this._child && this._child.getCardSize ? await this._child.getCardSize() : 8; }
      catch (_) { return 8; }
    }
    getLayoutOptions() { return { grid_min_rows: 4, grid_columns: "full" }; }
    getGridOptions() { return { columns: "full", min_rows: 4 }; }

    _shell() {
      if (!this._root) {
        this._root = this.attachShadow({ mode: "open" });
        this._root.innerHTML = `<style>
          :host{display:block;}
          .aviso{padding:14px 16px;border-radius:14px;font-size:13px;line-height:1.45;
            background:rgba(0,0,0,.25);color:var(--primary-text-color);
            border:1px solid var(--divider-color);}
          .aviso b{font-weight:700;}
          .aviso code{font-family:monospace;font-size:12px;opacity:.85;}
        </style><div id="host"></div>`;
        this._host = this._root.querySelector("#host");
      }
      return this._host;
    }

    _aviso(html) {
      const host = this._shell();
      this._child = null;
      host.innerHTML = `<div class="aviso">${html}</div>`;
    }

    async _update() {
      if (!this._config || !this.isConnected) return;
      const host = this._shell();
      if (!this._hass) return;

      if (!this._config.device) {
        this._aviso("<b>MW Tab Umidifier</b><br>Escolha o <b>dispositivo do umidificador</b> no editor — é dele que saem os botões, o nível e a umidade.");
        return;
      }
      if (!entitiesOfDevice(this._hass, this._config.device).length) {
        this._aviso(`<b>MW Tab Umidifier</b><br>O dispositivo <code>${esc(this._config.device)}</code> não tem entidade visível.<br>
          Confira em <code>Configurações → Dispositivos</code>.`);
        return;
      }

      const effectiveCfg = { ...this._config, ...(this._isAdmin !== undefined ? { is_admin: this._isAdmin } : {}) };
      const cfg = buildConfig(this._hass, effectiveCfg);
      const s = sig(cfg);
      if (this._child && s === this._built) {
        this._child.hass = this._hass;
        this._scheduleEnforceSquare();
        return;
      }
      this._built = s;

      if (this._child) {
        try {
          this._child.setConfig(cfg);
          this._child.hass = this._hass;
          if (this._editMode !== undefined) this._child.editMode = this._editMode;
          this._scheduleEnforceSquare();
          return;
        } catch (_) { this._child = null; }
      }

      let helpers = null;
      try { helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null; } catch (_) { /* segue */ }
      let el;
      try {
        el = helpers ? helpers.createCardElement(cfg) : null;
        if (!el) throw new Error("loadCardHelpers indisponível");
      } catch (e) {
        this._aviso(`<b>MW Tab Umidifier</b> não conseguiu montar o <code>custom:mw-tab-card</code>.<br>
          ${esc(e && e.message ? e.message : e)}<br>
          Instale <b>MW Tab Card</b>, <b>MW Humidifier Card</b>, <b>MW Humidifier Level Card</b>,
          <b>MW Rainbow Card</b>, <b>MW Power Button Card</b> e <b>Mushroom</b> pelo HACS.`);
        return;
      }
      el.hass = this._hass;
      if (this._editMode !== undefined) el.editMode = this._editMode;
      el.addEventListener("ll-rebuild", (ev) => { ev.stopPropagation(); this._built = null; this._child = null; this._update(); });
      host.innerHTML = "";
      host.appendChild(el);
      this._child = el;
      this._scheduleEnforceSquare();
      this._updatePowerFooter();
    }

    _scheduleEnforceSquare() {
      if (this._enforcePending) return;
      this._enforcePending = true;

      if (typeof requestAnimationFrame === "function") {
        this._rafId = requestAnimationFrame(() => {
          this._enforcePending = false;
          this._enforceSquare();
        });
      } else {
        setTimeout(() => {
          this._enforcePending = false;
          this._enforceSquare();
        }, 16);
      }
    }

    _enforceSquare() {
      if (!this._root) return;
      const align = this._config?.socket_align || DEFAULTS.socket_align;
      const alignSelf = align === "center" ? "center" : align === "top" ? "start" : "end";

      if (this._observer && !this._isObserving && this._root) {
        try {
          this._observer.observe(this._root, { childList: true, subtree: true });
          this._isObserving = true;
        } catch (_) {}
      }

      const deepQuery = (sel, root) => {
        const res = [];
        const walker = (n) => {
          if (!n) return;
          if (n.querySelectorAll) {
            const found = n.querySelectorAll(sel);
            for (let i = 0; i < found.length; i++) res.push(found[i]);
          }
          if (n.shadowRoot) walker(n.shadowRoot);
          for (const ch of (n.children || [])) walker(ch);
        };
        walker(root);
        return res;
      };

      const sheet = getPbcStyleSheet();
      const pbcs = deepQuery("power-button-card", this._root);

      for (let i = 0; i < pbcs.length; i++) {
        const pbc = pbcs[i];
        if (pbc.parentElement && pbc.parentElement.tagName.toLowerCase() === "hui-card") {
          if (pbc.parentElement.style.alignSelf !== alignSelf) {
            pbc.parentElement.style.alignSelf = alignSelf;
          }
        }

        if (!pbc.shadowRoot) continue;

        if (sheet && pbc.shadowRoot.adoptedStyleSheets) {
          if (!pbc.shadowRoot.adoptedStyleSheets.includes(sheet)) {
            pbc.shadowRoot.adoptedStyleSheets = [...pbc.shadowRoot.adoptedStyleSheets, sheet];
          }
        }

        const haCard = pbc.shadowRoot.querySelector("ha-card");
        if (haCard) {
          if (haCard.style.aspectRatio !== "1 / 1") haCard.style.aspectRatio = "1 / 1";
          if (haCard.style.height !== "100%") haCard.style.height = "100%";
          if (haCard.style.maxHeight !== "100%") haCard.style.maxHeight = "100%";
          if (haCard.style.width !== "100%") haCard.style.width = "100%";
          if (haCard.style.boxSizing !== "border-box") haCard.style.boxSizing = "border-box";

          const isEnergyGrid = pbc.closest && pbc.closest("hui-grid-card");
          if (!isEnergyGrid) {
            if (align === "center" && haCard.style.margin !== "auto 0px") haCard.style.margin = "auto 0";
            else if (align === "top" && haCard.style.marginBottom !== "auto") haCard.style.marginBottom = "auto";
            else if (align === "bottom" && haCard.style.marginTop !== "auto") haCard.style.marginTop = "auto";
          }
        }
      }

      this._updatePowerFooter();
    }
    _updatePowerFooter() {
      if (!this._child || !this._child.shadowRoot || !this._hass || !this._config) return;
      if (this._config.power_badge === false) return;

      const oldTabBadge = this._child.shadowRoot.querySelector(".mw-tab-power-badge");
      if (oldTabBadge) oldTabBadge.remove();

      const shellEl = this._child.shadowRoot.querySelector("ha-card.shell");
      if (!shellEl) return;

      const sockSt = socketState(this._hass, this._config);
      const isSocketOn = (sockSt === "on");

      let ftr = shellEl.querySelector(".mw-power-footer");

      if (!isSocketOn) {
        if (ftr) ftr.style.display = "none";
        return;
      }

      if (!this._child.shadowRoot.getElementById("mw-tab-power-footer-style")) {
        const style = document.createElement("style");
        style.id = "mw-tab-power-footer-style";
        style.textContent = `
          .mw-power-footer {
            position: relative;
            z-index: 0;
            width: calc((100% - 2 * var(--hdr-inset, 26px)) * 2 / 3);
            margin: calc(-1 * var(--hdr-lap, 16px)) auto 0;
            padding: calc(var(--hdr-lap, 16px) + 8px) 16px 10px;
            background: var(--mw-hdr, rgba(68, 68, 68, 0.65));
            color: var(--mw-hdr-text, rgba(255, 255, 255, 0.92));
            border-radius: 0 0 var(--pr, 22px) var(--pr, 22px);
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            transition: transform 0.15s ease, opacity 0.2s ease;
            box-sizing: border-box;
          }
          .mw-power-footer:active {
            transform: scale(0.98);
          }
          .mw-power-footer[hidden] {
            display: none !important;
          }
          .mw-power-footer .pv {
            font-family: var(--mw-font, 'Graphik', sans-serif);
            font-size: 20px;
            font-weight: 700;
            line-height: 1;
            color: #f0b429;
            letter-spacing: -0.3px;
            font-variant-numeric: tabular-nums;
            font-feature-settings: "tnum" 1;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
          }
          .mw-power-footer .pu {
            font-family: var(--mw-font, 'Graphik', sans-serif);
            font-size: 14px;
            font-weight: 700;
            color: #f0b429;
            opacity: 0.85;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            line-height: 1;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
          }
        `;
        this._child.shadowRoot.appendChild(style);
      }

      if (!ftr) {
        ftr = document.createElement("div");
        ftr.className = "mw-power-footer";
        shellEl.appendChild(ftr);
      }

      ftr.style.display = "flex";

      const pEnt = getPowerEntity(this._hass, this._config);
      const st = pEnt && this._hass.states[pEnt];
      const rawVal = st ? st.state : null;
      const rawUnit = st?.attributes?.unit_of_measurement || "W";

      const { value, unit } = fmtPower(rawVal, rawUnit, this._hass?.locale?.language);

      ftr.title = pEnt ? `Potência ativa (${pEnt}): ${value} ${unit}` : "Potência ativa";
      ftr.innerHTML = `
        <span class="pv">${esc(value)}</span>
        <span class="pu">${esc(unit)}</span>
      `;

      if (pEnt && !ftr._hasClick) {
        ftr._hasClick = true;
        ftr.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId: pEnt },
          }));
        });
      }
    }

  }
  // Os editores internos do HA não vêm carregados: só entram quando alguma
  // tela de edição os pede. Instanciar o editor da pilha vertical puxa o
  // conjunto. Se não vier, o editor cai em JSON — feio, mas nunca sem saída.
  const loadHuiEditors = async () => {
    if (customElements.get("hui-card-element-editor")) return true;
    try {
      const helpers = await window.loadCardHelpers();
      const stack = helpers.createCardElement({ type: "vertical-stack", cards: [] });
      await stack.constructor.getConfigElement();
      await Promise.race([
        customElements.whenDefined("hui-card-element-editor"),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch (_) { /* segue no plano B */ }
    return !!customElements.get("hui-card-element-editor");
  };

  const loadYamlEditor = async () => {
    if (customElements.get("ha-yaml-editor")) return true;
    await loadHuiEditors();
    await Promise.race([
      customElements.whenDefined("ha-yaml-editor"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    return !!customElements.get("ha-yaml-editor");
  };

  /**
   * Caixa de código de um pedaço da config. YAML quando o HA entrega o
   * ha-yaml-editor; JSON num textarea quando não entrega. Nos dois casos o
   * valor só é gravado no botão «Aplicar» — escrever a cada tecla tiraria o
   * foco de quem está digitando.
   */
  const yamlBox = async (host, hass, value, onApply, dica) => {
    host.innerHTML = `<div class="mtl-warn"></div><div class="yhost"></div>
      <div class="mtl-row"><span class="nm">${esc(dica || "")}</span>
      <button class="mtl-chip" data-apply="1">Aplicar</button></div>`;
    const warn = host.querySelector(".mtl-warn");
    const yhost = host.querySelector(".yhost");
    const ok = await loadYamlEditor();
    let ler = () => value;
    if (ok) {
      const ed = document.createElement("ha-yaml-editor");
      ed.hass = hass;
      ed.defaultValue = value;
      try { if (ed.setValue) ed.setValue(value); } catch (_) { /* versão antiga */ }
      let atual = value, valido = true;
      ed.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        valido = ev.detail.isValid !== false;
        if (valido) { atual = ev.detail.value; warn.textContent = ""; }
        else warn.textContent = "YAML inválido — corrija antes de aplicar.";
      });
      yhost.appendChild(ed);
      ler = () => { if (!valido) throw new Error("YAML inválido"); return atual; };
    } else {
      warn.textContent = "Editor YAML do HA indisponível — mostrando JSON.";
      yhost.innerHTML = `<textarea class="mtl-ta" spellcheck="false"></textarea>`;
      const ta = yhost.querySelector("textarea");
      ta.value = JSON.stringify(value, null, 2);
      ler = () => JSON.parse(ta.value);
    }
    host.querySelector("[data-apply]").addEventListener("click", () => {
      try { onApply(ler()); warn.textContent = "Aplicado."; }
      catch (e) { warn.textContent = `Não aplicado: ${e && e.message ? e.message : e}`; }
    });
  };

  const CSS = `
    .mtl-h{font-size:13px;font-weight:600;margin:14px 0 6px;opacity:.85;}
    .mtl-sec{margin-top:12px;border:1px solid var(--divider-color);border-radius:10px;padding:10px 12px;}
    .mtl-sec>summary{cursor:pointer;font-weight:600;font-size:13px;}
    .mtl-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--divider-color);}
    .mtl-row:first-of-type{border-top:0;}
    .mtl-row .nm{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .mtl-row .nm small{opacity:.6;font-size:11px;}
    .mtl-row.off .nm{opacity:.45;text-decoration:line-through;}
    .mtl-ib{border:0;background:transparent;cursor:pointer;color:var(--secondary-text-color);
      font:inherit;font-size:15px;line-height:1;padding:4px 6px;border-radius:6px;}
    .mtl-ib:hover{background:var(--divider-color);color:var(--primary-text-color);}
    .mtl-ib[disabled]{opacity:.3;cursor:default;}
    .mtl-ib.on{color:var(--primary-color);}
    .mtl-ib.del:hover{color:var(--error-color, #db4437);}
    .mtl-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;
      border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);
      font:inherit;font-size:12px;cursor:pointer;}
    .mtl-chip.add{border-style:dashed;}
    .mtl-edit{margin-top:10px;border:1px solid var(--divider-color);border-radius:10px;padding:10px;}
    .mtl-edit .top{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;font-weight:600;}
    .mtl-ta{width:100%;box-sizing:border-box;min-height:180px;font-family:monospace;font-size:12px;
      background:var(--code-editor-background-color, rgba(0,0,0,.06));color:var(--primary-text-color);
      border:1px solid var(--divider-color);border-radius:8px;padding:8px;}
    .mtl-warn{font-size:12px;color:var(--error-color, #db4437);min-height:16px;}
    .mtl-info{font-size:12px;opacity:.7;margin:4px 0 8px;}
    .mtl-crow{display:grid;grid-template-columns:1fr 44px 110px minmax(110px,1fr);gap:10px;align-items:center;padding:6px 0;}
    .mtl-crow .lbl{font-size:13px;}
    .mtl-crow input[type=color]{width:40px;height:28px;border:none;background:none;cursor:pointer;padding:0;}
    .mtl-crow code{font-size:11px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  `;


  /* ---------------------------- EDITOR VISUAL ---------------------------- */

  const LABELS = {
    device: "Dispositivo do umidificador",
    socket_device: "Dispositivo da tomada (aba ENERGIA)",
    socket_entity: "Interruptor da tomada (vazio = descobre sozinho)",
    image: "Foto do aparelho (/local/devices/…webp)",
    rainbow: "Faixa de umidade no topo",
    energy_tab: "Criar a aba ENERGIA",
    level: "Mostrar o nível de spray",
    spacers: "Espaçadores acima dos botões",
    button_icon_size: "Tamanho do ícone dos botões",
    heading: "Título da aba do umidificador (vazio = sem título)",
    energy_heading: "Título da aba de energia",
    energy_columns: "Colunas da grade de tomadas",
    paper_color: "Cor do papel (painel)",
    shell_color: "Casca (fundo do card)",
    level_entity: "Entidade do nível (vazio = descobre sozinho)",
    // rainbow
    orientation: "Orientação",
    band_height: "Altura da faixa",
    band_gap: "Folga entre faixas",
    band_radius: "Arredondamento da faixa",
    scale_alpha: "Opacidade das cores",
    blend: "Degradê entre as seções",
    section_labels: "Rótulos de seção",
    band_labels: "Rótulos de faixa",
    name_size: "Tamanho do nome",
    value_size: "Tamanho do valor",
    show_values: "Mostrar os valores",
    show_units: "Mostrar as unidades",
    depth: "Relevo",
    // humidifier card
    button_columns: "Colunas dos botões",
    button_radius: "Arredondamento dos botões",
    show_button_names: "Mostrar o nome dos botões",
    show_select_value: "Mostrar o valor do seletor",
    hide_controls_when_off: "Esconder os controles com o aparelho desligado",
    confirm_buttons: "Pedir confirmação nos botões",
    gap: "Espaço interno",
    height: "Altura",
    // level card
    level_scheme: "Esquema de cores por nível",
    level_paint: "Onde a cor do nível pousa",
    radius: "Arredondamento",
    show_icon: "Mostrar o ícone",
    show_name: "Mostrar o nome",
    name: "Nome",
    icon: "Ícone",
    // power
    device_icon: "Ícone do aparelho",
    background_image_url: "Imagem de fundo (marca/integração)",
    protocol_icon: "Selinho de protocolo (wifi, zigbee…)",
    only_power: "Só a potência (sem tensão e corrente)",
    power_font_size: "Tamanho da potência",
    only_power_lift: "Subida do texto no modo só potência",
    confirm: "Pedir confirmação antes de ligar/desligar",
    sensor_voltagem: "Sensor de tensão",
    sensor_corrente: "Sensor de corrente",
    sensor_potencia: "Sensor de potência",
    haptic: "Vibrar ao tocar",
    // abas (espelho do MW Tab Card)
    label: "Texto da aba",
    tab_position: "Posição das abas",
    tab_display: "O que aparece na aba",
    tab_stretch: "Abas dividem a faixa em partes iguais",
    tab_align: "Onde a fila de abas encosta",
    tab_size: "Espessura da faixa de abas (0 = automático)",
    tab_font_size: "Tamanho do texto da aba",
    tab_icon_size: "Tamanho do ícone da aba",
    tab_rotate: "Deitar a aba lateral",
    tab_rotate_angle: "Ângulo da aba deitada",
    tab_rotate_what: "O que gira na aba deitada",
    default_tab: "Aba inicial",
    remember_tab: "Lembrar a última aba aberta (neste navegador)",
    keep_alive: "Manter as abas já abertas montadas",
    preload: "Montar todas as abas de uma vez",
    header: "Faixa de título (opcional)",
    header_icon: "Ícone da faixa de título",
    shell_radius: "Arredondamento da casca",
    panel_radius: "Arredondamento do painel",
    notch_radius: "Recorte côncavo (fusão aba↔painel)",
    padding: "Respiro entre casca e painel",
    content_padding: "Respiro interno do painel",
    card_gap: "Espaço entre os cards de dentro",
    panel_min_height: "Altura mínima do painel",
    elevation: "Relevo 3D no painel",
    flat_children: "Achatar os cards de dentro",
    tab_active_color: "Aba ativa: texto",
    tab_inactive_color: "Aba inativa: texto",
    content_text_color: "Texto dentro do painel",
    header_color: "Faixa de título (vazio = clareia a casca)",
    header_text_color: "Texto da faixa de título",
  };

  const POS_OPTIONS = [
    { value: "bottom", label: "Embaixo" }, { value: "top", label: "Em cima" },
    { value: "left", label: "À esquerda" }, { value: "right", label: "À direita" },
  ];
  const DISP_OPTIONS = [
    { value: "both", label: "Ícone e texto" }, { value: "icon", label: "Só ícone" },
    { value: "text", label: "Só texto" },
  ];
  const SCHEME_OPTIONS = [
    { value: "none", label: "— cor única —" }, { value: "agua", label: "Água" },
    { value: "verde", label: "Verde" }, { value: "mare", label: "Maré" },
    { value: "semaforo", label: "Semáforo" }, { value: "calor", label: "Calor" },
    { value: "arco-iris", label: "Arco-íris" }, { value: "noite", label: "Noite" },
    { value: "nevoa", label: "Névoa" }, { value: "encardido", label: "Encardido" },
  ];
  const PAINT_OPTIONS = [
    { value: "card", label: "O card inteiro" }, { value: "select", label: "Só o seletor" },
    { value: "both", label: "Os dois" },
  ];
  const LABEL_OPTIONS = [
    { value: "none", label: "Nenhum" }, { value: "first", label: "Só o primeiro" },
    { value: "all", label: "Todos" },
  ];
  const BANDLABEL_OPTIONS = [
    { value: "none", label: "Nenhum" }, { value: "icon", label: "Ícone" }, { value: "text", label: "Texto" },
  ];

  class MwTabHumidifierCardEditor extends HTMLElement {
    setConfig(config) { this._config = { ...config }; this._render(); }
    set hass(hass) {
      this._hass = hass;
      for (const f of this._forms || []) f.hass = hass;
      if (this._reg !== (hass && hass.entities)) { this._reg = hass && hass.entities; this._renderButtons(); this._renderRainbow(); }
    }

    _emit(next) {
      this._config = next;
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: next } }));
    }
    _patch(patch) {
      const next = { ...this._config, ...patch };
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === null) delete next[k];
        else if (k in DEFAULTS && v === DEFAULTS[k] && k !== "device") delete next[k];
      }
      this._emit(next);
    }
    _cfg() { return { ...DEFAULTS, ...this._config }; }

    _render() {
      if (!this._root) {
        this._forms = [];
        this._root = document.createElement("div");
        this._root.innerHTML = `<style>${CSS}</style>
          <div id="mainform"></div>
          <div class="mtl-h">Botões do umidificador</div>
          <div class="mtl-info" id="binfo"></div>
          <div id="buttons"></div>
          <details class="mtl-sec" id="humsec"><summary>Card do umidificador (todas as opções)</summary>
            <div id="humform"></div>
            <details class="mtl-sec"><summary>Código YAML deste card</summary><div id="humyaml"></div></details></details>
          <details class="mtl-sec" id="rbsec"><summary>Faixa de umidade (arco-íris)</summary>
            <div class="mtl-info">Cada seção é um dispositivo com sensor de umidade — a ordem é a da fila.</div>
            <div id="rainbow"></div><div id="rbadd"></div>
            <div id="rbform"></div>
            <details class="mtl-sec"><summary>Código YAML deste card</summary><div id="rbyaml"></div></details></details>
          <details class="mtl-sec" id="lvlsec"><summary>Nível de spray</summary>
            <div id="lvlform"></div>
            <details class="mtl-sec"><summary>Código YAML deste card</summary><div id="lvlyaml"></div></details></details>
          <details class="mtl-sec" id="pwsec"><summary>Tomada (aba ENERGIA)</summary>
            <div id="pwform"></div>
            <details class="mtl-sec"><summary>Código YAML deste card</summary><div id="pwyaml"></div></details></details>
          <details class="mtl-sec" id="tabsec"><summary>Abas (rótulo, ícone, posição, tamanho…)</summary>
            <div class="mtl-h">Aba do umidificador</div><div id="tab1form"></div>
            <div class="mtl-h">Aba de energia</div><div id="tab2form"></div>
            <div class="mtl-h">Comportamento e geometria</div><div id="tabsform"></div></details>
          <details class="mtl-sec" id="colorsec"><summary>Cores (papel, casca e textos)</summary>
            <div id="paperform"></div><div id="colorrows"></div></details>
          <details class="mtl-sec" id="yamlsec"><summary>Código YAML do card inteiro (avançado)</summary>
            <div class="mtl-h">Config gerada — é isto que vai para o mw-tab-card</div><div id="yamlgen"></div>
            <div class="mtl-h">Ajustes crus (merge por cima do gerado)</div><div id="yamlover"></div></details>`;
        this.appendChild(this._root);

        const form = (sel, cb) => {
          const f = document.createElement("ha-form");
          f.computeLabel = (x) => LABELS[x.name] || x.name;
          f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); cb(ev.detail.value || {}); });
          this._root.querySelector(sel).appendChild(f);
          this._forms.push(f);
          return f;
        };
        this._mainForm = form("#mainform", (v) => this._onMain(v));
        this._humForm = form("#humform", (v) => this._onChild("humidifier_options", v));
        this._rbForm = form("#rbform", (v) => this._onChild("rainbow_options", v));
        this._rbAdd = form("#rbadd", (v) => this._onRainbowAdd(v));
        this._lvlForm = form("#lvlform", (v) => this._onLevel(v));
        this._pwForm = form("#pwform", (v) => this._onPower(v));
        this._tab1Form = form("#tab1form", (v) => this._patch({ humidifier_tab: clean(v) }));
        this._tab2Form = form("#tab2form", (v) => this._patch({ energy_tab_options: clean(v) }));
        this._tabsForm = form("#tabsform", (v) => this._onTabs(v));
        this._paperForm = form("#paperform", (v) => this._patch({ paper_color: v.paper_color }));

        this._buttonsEl = this._root.querySelector("#buttons");
        this._rainbowEl = this._root.querySelector("#rainbow");
        this._colorRows = this._root.querySelector("#colorrows");

        for (const [sel, fn] of [["#yamlsec", "_renderYaml"], ["#humsec", "_renderYamlPieces"],
          ["#rbsec", "_renderYamlPieces"], ["#lvlsec", "_renderYamlPieces"], ["#pwsec", "_renderYamlPieces"]]) {
          this._root.querySelector(sel).addEventListener("toggle", () => this[fn]());
        }
      }
      this._renderMain();
      this._renderButtons();
      this._renderRainbow();
      this._renderChildForms();
      this._renderTabForms();
      this._renderColors();
    }

    /* ------------------------------ principal ----------------------------- */

    _renderMain() {
      const c = this._cfg();
      this._mainForm.hass = this._hass;
      this._mainForm.schema = [
        { name: "device", selector: { device: {} } },
        { name: "image", selector: { text: {} } },
        { name: "", type: "grid", schema: [
          { name: "rainbow", selector: { boolean: {} } },
          { name: "level", selector: { boolean: {} } },
          { name: "energy_tab", selector: { boolean: {} } },
          { name: "spacers", selector: { number: { min: 0, max: 6, step: 1, mode: "box" } } },
          { name: "button_icon_size", selector: { number: { min: 20, max: 140, step: 1, mode: "box", unit_of_measurement: "px" } } },
        ] },
        { name: "heading", selector: { text: {} } },
        ...(c.energy_tab !== false ? [
          { name: "socket_device", selector: { device: {} } },
          { name: "socket_entity", selector: { entity: { domain: ["switch", "input_boolean"] } } },
          { name: "energy_heading", selector: { text: {} } },
          { name: "energy_columns", selector: { number: { min: 1, max: 6, step: 1, mode: "box" } } },
        ] : []),
      ];
      const data = {
        device: c.device, image: c.image, heading: c.heading,
        rainbow: c.rainbow !== false, level: c.level !== false, energy_tab: c.energy_tab !== false,
        spacers: c.spacers, button_icon_size: c.button_icon_size,
        socket_device: c.socket_device, socket_entity: c.socket_entity,
        energy_heading: c.energy_heading, energy_columns: c.energy_columns || 2,
      };
      for (const k of Object.keys(data)) if (data[k] === "" || data[k] === undefined) delete data[k];
      this._mainForm.data = data;
    }

    _onMain(v) {
      const um = (x) => (Array.isArray(x) ? x[0] : x);
      const patch = {
        device: um(v.device) || "",
        socket_device: um(v.socket_device) || "",
        socket_entity: um(v.socket_entity) || "",
        image: v.image || "",
        heading: v.heading === undefined ? this._config.heading : v.heading,
        energy_heading: v.energy_heading === undefined ? this._config.energy_heading : v.energy_heading,
        rainbow: v.rainbow !== false,
        level: v.level !== false,
        energy_tab: v.energy_tab !== false,
        spacers: Number(v.spacers ?? DEFAULTS.spacers),
        button_icon_size: Number(v.button_icon_size) || DEFAULTS.button_icon_size,
        energy_columns: Number(v.energy_columns) || 2,
      };
      if (patch.device !== this._config.device) { delete this._config.buttons; delete this._config.level_entity; }
      if (patch.energy_columns === 2) delete patch.energy_columns;
      this._patch(patch);
      this._renderMain();
      this._renderButtons();
      this._renderChildForms();
    }

    /* -------------------------------- botões ------------------------------ */

    _btnList() {
      const c = this._cfg();
      const achados = this._hass ? switchesOfDevice(this._hass, c.device) : [];
      const escolhidos = (Array.isArray(c.buttons) ? c.buttons : [])
        .map((b) => (typeof b === "string" ? b : b && b.entity)).filter(Boolean);
      if (!escolhidos.length) return achados.map((id) => ({ entity: id, on: true, achado: true }));
      const out = escolhidos.map((id) => ({ entity: id, on: true, achado: achados.indexOf(id) >= 0 }));
      for (const id of achados) if (!escolhidos.includes(id)) out.push({ entity: id, on: false, achado: true });
      return out;
    }

    _renderButtons() {
      if (!this._buttonsEl || !this._config) return;
      const lista = this._btnList();
      this._blist = lista;
      const s = sig(lista);
      if (s === this._bsig && this._buttonsEl.children.length) return;
      this._bsig = s;
      const info = this._root.querySelector("#binfo");
      info.textContent = this._cfg().device
        ? `${lista.filter((b) => b.on).length} de ${lista.length} interruptor(es) do dispositivo na barra de botões.`
        : "Escolha o dispositivo para o card achar os botões.";
      const n = lista.length;
      this._buttonsEl.innerHTML = lista.map((b, i) => `
        <div class="mtl-row ${b.on ? "" : "off"}">
          <button class="mtl-ib ${b.on ? "on" : ""}" data-a="vis" data-i="${i}">${b.on ? "☑" : "☐"}</button>
          <span class="nm">${esc(this._hass ? friendly(this._hass, b.entity) : b.entity)}
            <small>${esc(b.entity)}${b.achado ? "" : " · ⚠ fora do dispositivo"}</small></span>
          <button class="mtl-ib" data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="mtl-ib" data-a="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""}>↓</button>
        </div>`).join("")
        + `<div class="mtl-row"><span class="nm"></span>
            <button class="mtl-chip add" data-a="re">↻ redescobrir</button></div>`;
      this._buttonsEl.querySelectorAll("[data-a]").forEach((b) =>
        b.addEventListener("click", () => this._btnAction(b.dataset.a, +b.dataset.i)));
    }

    _btnAction(a, i) {
      const lista = (this._blist || []).map((b) => ({ ...b }));
      if (a === "re") { this._bsig = null; this._patch({ buttons: undefined }); this._renderButtons(); return; }
      if (a === "vis") lista[i].on = !lista[i].on;
      else if (a === "up" && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
      else if (a === "down" && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
      else return;
      this._bsig = null;
      this._patch({ buttons: lista.filter((b) => b.on).map((b) => b.entity) });
      this._renderButtons();
    }

    /* ------------------------------- arco-íris ---------------------------- */

    _renderRainbow() {
      if (!this._rainbowEl || !this._config) return;
      const devs = (this._config.rainbow_devices || []).map((d) => (isObj(d) ? d.device : d));
      const s = sig(devs);
      if (s === this._rsig && this._rainbowEl.children.length) return;
      this._rsig = s;
      const n = devs.length;
      this._rainbowEl.innerHTML = devs.map((d, i) => `
        <div class="mtl-row">
          <span class="nm">${esc(this._hass ? deviceName(this._hass, d) : d)}</span>
          <button class="mtl-ib" data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="mtl-ib" data-a="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""}>↓</button>
          <button class="mtl-ib del" data-a="del" data-i="${i}">✕</button>
        </div>`).join("") || `<div class="mtl-info">Nenhum dispositivo — a faixa não é desenhada.</div>`;
      this._rainbowEl.querySelectorAll("[data-a]").forEach((b) =>
        b.addEventListener("click", () => this._rbAction(b.dataset.a, +b.dataset.i)));
      this._rbAdd.hass = this._hass;
      this._rbAdd.schema = [{ name: "add", selector: { device: { entity: { device_class: "humidity" } } } }];
      this._rbAdd.data = {};
      this._rbAdd.computeLabel = () => "+ dispositivo com umidade";
    }

    _rbAction(a, i) {
      const devs = (this._config.rainbow_devices || []).map((d) => (isObj(d) ? d.device : d));
      if (a === "up" && i > 0) [devs[i - 1], devs[i]] = [devs[i], devs[i - 1]];
      else if (a === "down" && i < devs.length - 1) [devs[i + 1], devs[i]] = [devs[i], devs[i + 1]];
      else if (a === "del") devs.splice(i, 1);
      else return;
      this._rsig = null;
      this._patch({ rainbow_devices: devs.map((d) => ({ device: d })) });
      this._renderRainbow();
    }

    _onRainbowAdd(v) {
      const id = Array.isArray(v.add) ? v.add[0] : v.add;
      if (!id) return;
      const devs = (this._config.rainbow_devices || []).map((d) => (isObj(d) ? d.device : d));
      if (devs.includes(id)) return;
      devs.push(id);
      this._rsig = null;
      this._patch({ rainbow_devices: devs.map((d) => ({ device: d })) });
      this._renderRainbow();
    }

    /* --------------------------- cards de dentro -------------------------- */

    _onChild(chave, v) { this._patch({ [chave]: clean(v) }); }

    _renderChildForms() {
      const c = this._cfg();
      // ---- mw-humidifier-card
      const h = { button_columns: 2, button_radius: 12, show_button_names: false,
        show_select_value: true, hide_controls_when_off: true, confirm_buttons: false,
        paper_color: "paper", ...(c.humidifier_options || {}) };
      this._humForm.hass = this._hass;
      this._humForm.schema = [
        { name: "", type: "grid", schema: [
          { name: "button_columns", selector: { number: { min: 1, max: 4, step: 1, mode: "box" } } },
          { name: "button_radius", selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "gap", selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "height", selector: { text: {} } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "show_button_names", selector: { boolean: {} } },
          { name: "show_select_value", selector: { boolean: {} } },
          { name: "hide_controls_when_off", selector: { boolean: {} } },
          { name: "confirm_buttons", selector: { boolean: {} } },
          { name: "haptic", selector: { boolean: {} } },
        ] },
        { name: "paper_color", selector: { select: { mode: "dropdown", options: paperOptions().concat(grafiteOptions()) } } },
      ];
      this._humForm.data = h;

      // ---- mw-rainbow-card
      const r = { ...RAINBOW_DEFAULTS, band_height: 34, band_gap: 4, band_radius: 8,
        scale_alpha: 0.85, blend: true, show_values: true, show_units: true,
        depth: "soft", paper_color: "none", ...(c.rainbow_options || {}) };
      this._rbForm.hass = this._hass;
      this._rbForm.schema = [
        { name: "", type: "grid", schema: [
          { name: "orientation", selector: { select: { mode: "dropdown", options: [
            { value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }] } } },
          { name: "band_height", selector: { number: { min: 10, max: 120, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "band_gap", selector: { number: { min: 0, max: 20, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "band_radius", selector: { number: { min: 0, max: 30, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "name_size", selector: { number: { min: 8, max: 30, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "value_size", selector: { number: { min: 8, max: 30, step: 1, mode: "box", unit_of_measurement: "px" } } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "section_labels", selector: { select: { mode: "dropdown", options: LABEL_OPTIONS } } },
          { name: "band_labels", selector: { select: { mode: "dropdown", options: BANDLABEL_OPTIONS } } },
          { name: "show_values", selector: { boolean: {} } },
          { name: "show_units", selector: { boolean: {} } },
          { name: "blend", selector: { boolean: {} } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "scale_alpha", selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } } },
          { name: "depth", selector: { select: { mode: "dropdown", options: [
            { value: "flat", label: "Sem relevo" }, { value: "soft", label: "Suave" }, { value: "3d", label: "3D" }] } } },
          { name: "paper_color", selector: { select: { mode: "dropdown",
            options: [{ value: "none", label: "Fundo do tema" }].concat(paperOptions(), grafiteOptions()) } } },
        ] },
      ];
      const rdata = { ...r }; delete rdata.bands; delete rdata.sections;
      this._rbForm.data = rdata;

      // ---- mw-humidifier-level-card
      const l = { ...LEVEL_DEFAULTS, radius: 14, show_icon: true, show_name: true,
        paper_color: "paper", ...(c.level_options || {}) };
      this._lvlForm.hass = this._hass;
      this._lvlForm.schema = [
        { name: "level_entity", selector: { entity: { domain: ["select", "input_select"] } } },
        { name: "", type: "grid", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
          { name: "height", selector: { number: { min: 24, max: 120, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "radius", selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "level_scheme", selector: { select: { mode: "dropdown", options: SCHEME_OPTIONS } } },
          { name: "level_paint", selector: { select: { mode: "dropdown", options: PAINT_OPTIONS } } },
          { name: "paper_color", selector: { select: { mode: "dropdown", options: paperOptions().concat(grafiteOptions()) } } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "show_icon", selector: { boolean: {} } },
          { name: "show_name", selector: { boolean: {} } },
          { name: "haptic", selector: { boolean: {} } },
        ] },
      ];
      this._lvlForm.data = { ...l, level_entity: c.level_entity || (this._hass ? levelOfDevice(this._hass, c.device) : "") };

      // ---- power-button-card
      const auto = this._hass ? powerSensors(this._hass, c) : {};
      const p = { ...POWER_DEFAULTS, paper_color: "paper", ...auto, ...(c.power_options || {}) };
      this._pwForm.hass = this._hass;
      this._pwForm.schema = [
        { name: "", type: "grid", schema: [
          { name: "name", selector: { text: {} } },
          { name: "device_icon", selector: { icon: {} } },
          { name: "protocol_icon", selector: { icon: {} } },
        ] },
        { name: "background_image_url", selector: { text: {} } },
        { name: "", type: "grid", schema: [
          { name: "only_power", selector: { boolean: {} } },
          { name: "confirm", selector: { boolean: {} } },
          { name: "haptic", selector: { boolean: {} } },
          { name: "power_font_size", selector: { number: { min: 8, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "only_power_lift", selector: { number: { min: -20, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } },
        ] },
        { name: "", type: "expandable", title: "Sensores (vazio = descobre pelo dispositivo da tomada)", schema: [
          { name: "sensor_voltagem", selector: { entity: { domain: "sensor" } } },
          { name: "sensor_corrente", selector: { entity: { domain: "sensor" } } },
          { name: "sensor_potencia", selector: { entity: { domain: "sensor" } } },
        ] },
        { name: "paper_color", selector: { select: { mode: "dropdown", options: paperOptions().concat(grafiteOptions()) } } },
      ];
      this._pwForm.data = p;
    }

    _onLevel(v) {
      const ent = Array.isArray(v.level_entity) ? v.level_entity[0] : v.level_entity;
      const o = clean({ ...v });
      delete o.level_entity;
      const auto = this._hass ? levelOfDevice(this._hass, this._cfg().device) : "";
      this._patch({ level_entity: ent && ent !== auto ? ent : undefined, level_options: o });
    }

    _onPower(v) {
      const o = clean({ ...v });
      // sensor igual ao que a descoberta acha não precisa ir para o YAML
      const auto = this._hass ? powerSensors(this._hass, this._cfg()) : {};
      for (const k of ["sensor_voltagem", "sensor_corrente", "sensor_potencia"]) {
        const val = Array.isArray(o[k]) ? o[k][0] : o[k];
        if (!val || val === auto[k]) delete o[k]; else o[k] = val;
      }
      for (const [k, val] of Object.entries(POWER_DEFAULTS)) if (o[k] === val) delete o[k];
      this._patch({ power_options: Object.keys(o).length ? o : undefined });
    }

    /* -------------------------------- abas -------------------------------- */

    _renderTabForms() {
      const t1 = { ...HUM_TAB, ...(this._config.humidifier_tab || {}) };
      const t2 = { ...ENERGY_TAB, ...(this._config.energy_tab_options || {}) };
      const tabSchema = [{ name: "", type: "grid", schema: [
        { name: "label", selector: { text: {} } }, { name: "icon", selector: { icon: {} } } ] }];
      this._tab1Form.hass = this._hass; this._tab1Form.schema = tabSchema; this._tab1Form.data = t1;
      this._tab2Form.hass = this._hass; this._tab2Form.schema = tabSchema; this._tab2Form.data = t2;

      const o = { ...TABS_DEFAULTS, ...(this._config.tabs_options || {}) };
      const horiz = o.tab_position === "top" || o.tab_position === "bottom";
      this._tabsForm.hass = this._hass;
      this._tabsForm.schema = [
        { name: "", type: "grid", schema: [
          { name: "tab_position", selector: { select: { mode: "dropdown", options: POS_OPTIONS } } },
          { name: "tab_display", selector: { select: { mode: "dropdown", options: DISP_OPTIONS } } },
          { name: "tab_icon_size", selector: { number: { min: 10, max: 48, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "tab_font_size", selector: { number: { min: 7, max: 28, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "tab_size", selector: { number: { min: 0, max: 240, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "default_tab", selector: { number: { min: 0, max: 5, step: 1, mode: "box" } } },
        ] },
        ...(horiz ? [{ name: "tab_stretch", selector: { boolean: {} } }] : [
          { name: "tab_rotate", selector: { select: { mode: "dropdown", options: [
            { value: "auto", label: "Automático (deita em retrato)" },
            { value: "true", label: "Sempre deitada" }, { value: "false", label: "Nunca" }] } } },
          { name: "tab_rotate_angle", selector: { select: { mode: "dropdown", options: [
            { value: "auto", label: "Automático" }, { value: "90", label: "90°" }, { value: "270", label: "270°" }] } } },
          { name: "tab_rotate_what", selector: { select: { mode: "dropdown", options: [
            { value: "both", label: "Ícone e texto" }, { value: "text", label: "Só o texto" },
            { value: "icon", label: "Só o ícone" }] } } },
        ]),
        { name: "tab_align", selector: { select: { mode: "dropdown", options: [
          { value: "", label: "Automático" }, { value: "start", label: "No começo" },
          { value: "center", label: "No centro" }, { value: "end", label: "No fim" } ] } } },
        { name: "header", selector: { text: {} } },
        { name: "header_icon", selector: { icon: {} } },
        { name: "", type: "grid", schema: [
          { name: "shell_radius", selector: { number: { min: 0, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "panel_radius", selector: { number: { min: 0, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "notch_radius", selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "padding", selector: { number: { min: 0, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "content_padding", selector: { number: { min: 0, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "card_gap", selector: { number: { min: 0, max: 60, step: 1, mode: "box", unit_of_measurement: "px" } } },
          { name: "panel_min_height", selector: { number: { min: 0, max: 800, step: 4, mode: "box", unit_of_measurement: "px" } } },
        ] },
        { name: "", type: "grid", schema: [
          { name: "elevation", selector: { boolean: {} } },
          { name: "flat_children", selector: { boolean: {} } },
          { name: "haptic", selector: { boolean: {} } },
          { name: "keep_alive", selector: { boolean: {} } },
          { name: "remember_tab", selector: { boolean: {} } },
          { name: "preload", selector: { boolean: {} } },
        ] },
      ];
      const data = { ...o };
      for (const k of Object.keys(data)) if (data[k] === "" || data[k] === undefined) delete data[k];
      this._tabsForm.data = data;
    }

    _onTabs(v) {
      const o = clean({ ...(this._config.tabs_options || {}), ...v });
      for (const [k, val] of Object.entries(TABS_DEFAULTS)) if (o[k] === undefined) o[k] = val;
      this._patch({ tabs_options: o });
      this._renderTabForms();
    }

    /* ------------------------------- cores -------------------------------- */

    _renderColors() {
      this._paperForm.hass = this._hass;
      this._paperForm.schema = [{ name: "paper_color", selector: { select: { mode: "dropdown", options: paperOptions().concat(grafiteOptions()) } } }];
      this._paperForm.data = { paper_color: this._config.paper_color || DEFAULTS.paper_color };

      const campos = [
        ["shell_color", null],
        ["tab_active_color", "tabs_options"], ["tab_inactive_color", "tabs_options"],
        ["content_text_color", "tabs_options"], ["header_color", "tabs_options"],
        ["header_text_color", "tabs_options"],
      ];
      const valor = (name, onde) => (onde ? (this._config[onde] || {})[name] : this._config[name])
        ?? (name === "shell_color" ? DEFAULTS.shell_color : "");
      this._colorRows.innerHTML = campos.map(([name, onde]) => {
        const cur = valor(name, onde);
        const col = parseColor(cur || "rgba(128,128,128,1)");
        return `<div class="mtl-crow" data-name="${name}" data-onde="${onde || ""}">
          <span class="lbl">${LABELS[name] || name}</span>
          <input type="color" value="${toHex(col)}" title="cor">
          <input type="range" min="0" max="1" step="0.01" value="${col.a}" title="transparência (alfa)">
          <code>${esc(cur || "—")}</code></div>`;
      }).join("");
      this._colorRows.querySelectorAll(".mtl-crow").forEach((row) => {
        const name = row.dataset.name, onde = row.dataset.onde;
        const apply = () => {
          const { r, g, b } = parseColor(row.querySelector("input[type=color]").value);
          const a = parseFloat(row.querySelector("input[type=range]").value);
          const v = toRgba({ r, g, b, a });
          if (onde) this._patch({ [onde]: { ...(this._config[onde] || {}), [name]: v } });
          else this._patch({ [name]: v });
          row.querySelector("code").textContent = v;
        };
        row.querySelector("input[type=color]").addEventListener("input", apply);
        row.querySelector("input[type=range]").addEventListener("input", apply);
      });
    }

    /* -------------------------------- yaml -------------------------------- */

    async _renderYamlPieces() {
      if (!this._hass) return;
      const c = this._cfg();
      const pecas = [
        ["#humsec", "#humyaml", humidifierCard(this._hass, c), "humidifier_options"],
        ["#rbsec", "#rbyaml", rainbowCard(this._hass, c), "rainbow_options"],
        ["#lvlsec", "#lvlyaml", levelCard(this._hass, c), "level_options"],
        ["#pwsec", "#pwyaml", powerCard(this._hass, c), "power_options"],
      ];
      for (const [secSel, hostSel, gerado, chave] of pecas) {
        const sec = this._root.querySelector(secSel);
        const host = this._root.querySelector(hostSel);
        if (!sec.open || !host || !gerado) continue;
        if (host.dataset.pronto === sig(gerado)) continue;
        host.dataset.pronto = sig(gerado);
        await yamlBox(host, this._hass, gerado, (val) => {
          const over = diffObj(gerado, val);
          delete over.type;
          this._patch({ [chave]: { ...(this._config[chave] || {}), ...over } });
          host.dataset.pronto = "";
          this._renderChildForms();
        }, "grava só o que você mudou (merge sobre o gerado)");
      }
    }

    async _renderYaml() {
      const sec = this._root.querySelector("#yamlsec");
      if (!sec.open || !this._hass) return;
      const gerado = buildConfig(this._hass, this._cfg());
      await yamlBox(this._root.querySelector("#yamlgen"), this._hass, gerado, (val) => {
        this._patch({ yaml_override: diffObj(gerado, val) });
      }, "editar aqui grava as diferenças em yaml_override");
      await yamlBox(this._root.querySelector("#yamlover"), this._hass, this._config.yaml_override || {}, (val) => {
        this._patch({ yaml_override: isObj(val) && Object.keys(val).length ? val : undefined });
      }, "merge por cima do gerado (null apaga uma chave)");
    }
  }

  /* --------------------------------- registro -------------------------------- */

  customElements.define("mw-tab-humidifier-card", MwTabHumidifierCard);
  customElements.define("mw-tab-humidifier-card-editor", MwTabHumidifierCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "mw-tab-humidifier-card",
    name: "MW Tab Umidifier",
    description: "O umidificador inteiro em abas: umidade da casa, foto, botões, nível e a tomada.",
    preview: true,
    documentationURL: "https://github.com/visaodeempresa/mw-ha-tab-humidifier-card",
  });

  console.info(`%c MW-TAB-HUMIDIFIER-CARD %c ${VERSION} `,
    "background:#1a1a1a;color:#fdfaf3;font-weight:700;", "background:#e8e3d8;color:#1a1a1a;font-weight:700;");
})();
