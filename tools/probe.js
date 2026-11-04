/* Probe headless do mw-tab-humidifier-card — monta card e editor fora do
 * navegador com o mesmo shim de DOM dos irmãos. Pega o que dói perder sem
 * abrir o HA: a leitura das entidades do dispositivo, a ordem dos botões, a
 * descoberta dos sensores da tomada, a forma das duas abas e o editor
 * montando sem `hass` e sem os elementos internos do HA.
 *
 * Roda no CI e antes de qualquer PR:  node tools/probe.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

/* ------------------------------- shim DOM ------------------------------- */

const mkStyle = () => {
  const s = { _p: {} };
  s.setProperty = (k, v) => { s._p[k] = String(v); };
  s.removeProperty = (k) => { delete s._p[k]; };
  s.get = (k) => s._p[k];
  return s;
};

class Node {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.style = mkStyle();
    this.children = [];
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
    this._q = new Map();
    this._classes = new Set();
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, on) => (on === undefined
        ? (this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c))
        : (on ? this._classes.add(c) : this._classes.delete(c))),
    };
  }
  appendChild(n) { this.children.push(n); n.parentNode = this; return n; }
  append(...n) { n.forEach((x) => this.appendChild(x)); }
  insertBefore(n, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  replaceChild(nw, old) {
    const i = this.children.indexOf(old);
    if (i >= 0) this.children[i] = nw;
    nw.parentNode = this;
  }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  removeEventListener() {}
  dispatchEvent(ev) { (this._listeners[ev && ev.type] || []).forEach((f) => f(ev)); return true; }
  // memoiza por seletor: o código só consulta seletores fixos
  querySelector(sel) {
    if (!this._q.has(sel)) this._q.set(sel, new Node("div"));
    return this._q.get(sel);
  }
  querySelectorAll() { return []; }
  getElementById(id) { return this.querySelector("#" + id); }
  focus() {}
}

global.Node = Node;
global.HTMLElement = class extends Node {
  attachShadow() { this.shadowRoot = new Node("shadow-root"); return this.shadowRoot; }
};
global.CustomEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
const reg = {};
global.customElements = {
  define: (n, c) => { reg[n] = c; },
  get: (n) => reg[n],
  whenDefined: () => Promise.resolve(),
};
global.document = { createElement: (t) => new Node(t), body: new Node("body") };
// no Node 24 `navigator` é getter-only: define por cima, não por atribuição
Object.defineProperty(global, "navigator", { value: { vibrate: () => {} }, configurable: true });

// helpers de bolso: os "cards de dentro" viram nós marcados
global.window = {
  customCards: [],
  localStorage: { _v: {}, getItem(k) { return k in this._v ? this._v[k] : null; }, setItem(k, v) { this._v[k] = v; } },
  dispatchEvent: () => {},
  loadCardHelpers: async () => ({
    createCardElement(cfg) {
      const el = new Node("div");
      el._cfg = cfg;
      el.getCardSize = () => 2;
      return el;
    },
  }),
};

const infoBanner = [];
const realInfo = console.info;
console.info = (...a) => infoBanner.push(a.join(" "));

const SRC = path.join(__dirname, "..", "dist", "mw-tab-humidifier-card.js");
eval(fs.readFileSync(SRC, "utf8"));
console.info = realInfo;

let pass = 0; const fails = [];
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${msg} — esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

/* ------------------------------- hass falso ------------------------------ */

const DEV = "fda7f6d18521b81c9cc3664164047d7d";
const TOMADA = "tomada-dev";
const HASS = {
  areas: { escritorio: { name: "Escritório" } },
  devices: { [DEV]: { name: "Umidificador Escritório", area_id: "escritorio" },
             [TOMADA]: { name: "Tomada Umidificador", area_id: "escritorio" },
             clima1: { name: "Sensor Sala" } },
  entities: {},
  states: {},
  callService() {},
};
const add = (id, dev, nome, extra) => {
  HASS.entities[id] = Object.assign({ device_id: dev }, extra || {});
  HASS.states[id] = { state: "off", attributes: { friendly_name: nome } };
};
// o umidificador: a ordem no registro é de propósito EMBARALHADA
add("switch.escritorio_umidificador_escritorio_local_sleep", DEV, "Sleep");
add("switch.escritorio_umidificador_escritorio_local_led", DEV, "LED");
add("switch.escritorio_umidificador_escritorio_local_tomada", DEV, "Tomada");
add("switch.escritorio_umidificador_escritorio_local_mute", DEV, "Mute");
add("select.escritorio_umidificador_escritorio_local_spraying_level", DEV, "Nível de spray");
add("sensor.escritorio_umidificador_umidade", DEV, "Umidade");
add("switch.escondida_do_registro", DEV, "Escondida", { hidden_by: "user" });
// a tomada
add("switch.tomada_umidificador_escritorio_socket_1", TOMADA, "Tomada 1");
HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "on";
add("sensor.tomada_umidificador_escritorio_voltagem", TOMADA, "Voltagem");
add("sensor.tomada_umidificador_escritorio_corrente", TOMADA, "Corrente");
add("sensor.tomada_umidificador_escritorio_potencia", TOMADA, "Potência");

const mk = (cfg) => {
  const el = new (customElements.get("mw-tab-humidifier-card"))();
  el.isConnected = true;
  el.setConfig(cfg);
  el.hass = HASS;
  return el;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

ok(!!customElements.get("mw-tab-humidifier-card"), "custom element não registrado");
ok(!!customElements.get("mw-tab-humidifier-card-editor"), "editor não registrado");

(async () => {
  const card = mk({
    device: DEV, socket_device: TOMADA,
    image: "/local/devices/umidificador-coibeu.webp",
    rainbow_devices: [{ device: "clima1" }],
  });
  await tick(); await tick(); await tick();
  const cfg = card._child && card._child._cfg;
  ok(!!cfg, "o card não montou o custom:mw-tab-card");
  if (cfg) {
    eq(cfg.type, "custom:mw-tab-card", "tipo do filho");
    eq(cfg.paper_color, "orange-7", "tomada ligada é orange-7");
    HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "off";
    card.hass = { ...HASS };
    await tick();
    eq(card._child && card._child._cfg && card._child._cfg.paper_color, "grafite-1", "tomada desligada é grafite-1");
    HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "unavailable";
    card.hass = { ...HASS };
    await tick();
    eq(card._child && card._child._cfg && card._child._cfg.paper_color, "#a5123f", "tomada unavailable é #a5123f");
    HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "on";
    card.hass = { ...HASS };
    await tick();
    eq(cfg.tab_position, "right", "abas à direita");
    eq(cfg.tab_icon_size, 32, "ícone de aba 32px");
    eq(cfg.tabs.length, 2, "duas abas (umidificador + energia)");
    eq(cfg.tabs[0].label, "UMIDIFICADOR", "rótulo da 1ª aba");
    eq(cfg.tabs[1].icon, "mdi:flash", "ícone da aba de energia");

    const c = cfg.tabs[0].cards;
    eq(c[0].type, "custom:mw-rainbow-card", "arco-íris no topo");
    eq(c[0].sections, [{ device: "clima1" }], "seções do arco-íris");
    eq(c[0].bands, [{ metric: "humidity" }], "faixa de umidade");
    eq(c[0].section_labels, "none", "sem rótulo de seção");
    eq(c[0].name_size, 17, "tamanho do nome no arco-íris");

    eq(c[1].type, "grid", "foto + coluna dos botões");
    eq(c[1].columns, 2, "duas colunas com a foto");
    eq(c[1].cards[0], { type: "picture", image: "/local/devices/umidificador-coibeu.webp" }, "a foto");
    const col = c[1].cards[1];
    eq(col.cards.length, 3, "2 espaçadores + o card do umidificador");
    eq(col.cards[0].type, "custom:mushroom-empty-card", "espaçador");
    const hum = col.cards[2];
    eq(hum.type, "custom:mw-humidifier-card", "card do umidificador");
    eq(hum.mode, "only_humidifier", "modo só umidificador");
    eq(hum.device, DEV, "dispositivo do card");
    eq(hum.button_icon_size, 65, "ícone dos botões");
    eq(hum.buttons, [
      "switch.escritorio_umidificador_escritorio_local_tomada",
      "switch.escritorio_umidificador_escritorio_local_led",
      "switch.escritorio_umidificador_escritorio_local_mute",
      "switch.escritorio_umidificador_escritorio_local_sleep",
    ], "ordem tomada → LED → mute → sleep, sem a escondida");

    eq(c[2], { type: "heading", heading: "💧 UMIDIFICADOR", heading_style: "title" }, "título da aba");
    const lvl = c[3].cards[0];
    eq(lvl.type, "custom:mw-humidifier-level-card", "card de nível");
    eq(lvl.entity, "select.escritorio_umidificador_escritorio_local_spraying_level", "entidade do nível");
    eq(lvl.level_scheme, "semaforo", "esquema de cores do nível");
    eq(lvl.level_paint, "both", "onde a cor pousa");
    eq(lvl.height, 50, "altura da faixa de nível");

    const e = cfg.tabs[1].cards;
    eq(e[0].heading, "🔌 TOMADAS ELÉTRICAS", "título da aba de energia");
    eq(e[1].square, true, "grade quadrada na energia");
    const pw = e[1].cards[0];
    eq(pw.type, "custom:power-button-card", "card da tomada");
    eq(pw.entity, "switch.tomada_umidificador_escritorio_socket_1", "interruptor da tomada");
    eq(pw.sensor_voltagem, "sensor.tomada_umidificador_escritorio_voltagem", "sensor de tensão achado");
    eq(pw.sensor_corrente, "sensor.tomada_umidificador_escritorio_corrente", "sensor de corrente achado");
    eq(pw.sensor_potencia, "sensor.tomada_umidificador_escritorio_potencia", "sensor de potência achado");
    eq(pw.only_power, true, "modo só potência");
    eq(pw.power_font_size, 20, "tamanho da potência");
  }

  // --- COMPORTAMENTO NOVO: Tomada Desligada ---
  // Quando a tomada estiver desligada:
  // 1. Segunda aba (energia) deve ser ocultada (apenas 1 aba).
  // 2. Os 4 botões e o seletor de nível somem da 1ª aba.
  // 3. A tomada ocupa a largura/coluna dos botões ocultados ao lado da foto.
  HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "off";
  const cardOff = mk({
    device: DEV, socket_device: TOMADA,
    image: "/local/devices/umidificador-coibeu.webp",
    rainbow_devices: [{ device: "clima1" }],
  });
  await tick(); await tick(); await tick();
  const cfgOff = cardOff._child && cardOff._child._cfg;
  ok(!!cfgOff, "card com tomada desligada montou");
  if (cfgOff) {
    eq(cfgOff.tabs.length, 1, "segunda aba ocultada quando tomada desligada");
    eq(cfgOff.tabs[0].label, "UMIDIFICADOR", "apenas aba UMIDIFICADOR presente");
    const cards = cfgOff.tabs[0].cards;
    eq(cards.length, 2, "apenas rainbow e grid da foto+tomada (sem heading e sem level)");
    eq(cards[1].type, "grid", "grid com foto e tomada");
    eq(cards[1].columns, 2, "grade de duas colunas");
    eq(cards[1].cards[0].type, "picture", "primeira coluna é a foto");
    eq(cards[1].cards[1].type, "custom:power-button-card", "tomada no lugar dos controles ocultados");
    eq(cards[1].cards[1].entity, "switch.tomada_umidificador_escritorio_socket_1", "entidade correta da tomada");
    ok(cards[1].cards[1].card_mod && /aspect-ratio:\s*1\s*\/\s*1/.test(cards[1].cards[1].card_mod.style), "tomada configurada como quadrado perfeito 1:1");
    ok(/margin-top:\s*auto/.test(cards[1].cards[1].card_mod.style), "tomada alinhada na base por padrão");
  }

  // --- COMPORTAMENTO NOVO: Tomada Ligada, mas Umidificador Indisponível ---
  // Quando o umidificador estiver indisponível/desconhecido:
  // 1. Controles e seletor de nível ficam invisíveis (mensagem de offline na coluna).
  // 2. Aba de energia continua visível porque a tomada está ligada.
  HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "on";
  HASS.states["switch.escritorio_umidificador_escritorio_local_tomada"].state = "unavailable";
  HASS.states["switch.escritorio_umidificador_escritorio_local_led"].state = "unavailable";
  HASS.states["switch.escritorio_umidificador_escritorio_local_mute"].state = "unavailable";
  HASS.states["switch.escritorio_umidificador_escritorio_local_sleep"].state = "unavailable";
  const cardUnavail = mk({
    device: DEV, socket_device: TOMADA,
    image: "/local/devices/umidificador-coibeu.webp",
    rainbow_devices: [{ device: "clima1" }],
  });
  await tick(); await tick(); await tick();
  const cfgUnavail = cardUnavail._child && cardUnavail._child._cfg;
  ok(!!cfgUnavail, "card com umidificador indisponível montou");
  if (cfgUnavail) {
    eq(cfgUnavail.tabs.length, 2, "duas abas quando tomada ligada (mesmo com umidificador indisponível)");
    const cards = cfgUnavail.tabs[0].cards;
    eq(cards.length, 2, "sem heading e sem level quando indisponível");
    eq(cards[1].cards[1].type, "markdown", "mensagem offline na 2ª coluna em vez de botões inacessíveis");
  }

  // Restaura estado ativo para os próximos testes
  HASS.states["switch.escritorio_umidificador_escritorio_local_tomada"].state = "off";
  HASS.states["switch.escritorio_umidificador_escritorio_local_led"].state = "off";
  HASS.states["switch.escritorio_umidificador_escritorio_local_mute"].state = "off";
  HASS.states["switch.escritorio_umidificador_escritorio_local_sleep"].state = "off";

  // --- COMPORTAMENTO NOVO: Reatividade Dinâmica via set hass ---
  // Um card já montado com tomada ligada deve reagir dinamicamente quando a tomada for desligada e religada
  const dynamicCard = mk({
    device: DEV, socket_device: TOMADA,
    image: "/local/devices/umidificador-coibeu.webp",
  });
  await tick(); await tick(); await tick();
  eq(dynamicCard._child._cfg.tabs.length, 2, "card dinâmico inicia com 2 abas (tomada ligada)");
  // Desliga a tomada via hass
  HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "off";
  dynamicCard.hass = HASS;
  await tick(); await tick(); await tick();
  eq(dynamicCard._child._cfg.tabs.length, 1, "card dinâmico reduz para 1 aba após desligar tomada");
  eq(dynamicCard._child._cfg.tabs[0].cards[0].cards[1].type, "custom:power-button-card", "tomada assume lugar dos botões dinamicamente");
  // Religa a tomada
  HASS.states["switch.tomada_umidificador_escritorio_socket_1"].state = "on";
  dynamicCard.hass = HASS;
  await tick(); await tick(); await tick();
  eq(dynamicCard._child._cfg.tabs.length, 2, "card dinâmico restaura 2 abas após religar tomada");
  eq(dynamicCard._child._cfg.tabs[0].cards[0].cards[1].cards[2].type, "custom:mw-humidifier-card", "botões restaurados dinamicamente");
  const tab2Pbc = dynamicCard._child._cfg.tabs[1].cards[1].cards[0];
  eq(tab2Pbc.type, "custom:power-button-card", "tomada presente na 2ª aba (energia)");
  ok(tab2Pbc.card_mod && /aspect-ratio:\s*1\s*\/\s*1/.test(tab2Pbc.card_mod.style), "tomada da 2ª aba blindada como quadrado perfeito 1:1");

  // sem foto: a coluna dos botões ocupa o painel inteiro
  const c2 = mk({ device: DEV, energy_tab: false, spacers: 0 });
  await tick(); await tick(); await tick();
  const cfg2 = c2._child && c2._child._cfg;
  if (cfg2) {
    eq(cfg2.tabs.length, 1, "sem aba de energia quando desligada");
    eq(cfg2.tabs[0].cards[0].type, "grid", "sem arco-íris sem dispositivos");
    eq(cfg2.tabs[0].cards[0].columns, 1, "sem foto, uma coluna só");
    eq(cfg2.tabs[0].cards[0].cards.length, 1, "sem espaçadores quando spacers:0");
  }

  // botões escolhidos à mão mandam na ordem e na exclusão
  const c3 = mk({ device: DEV, energy_tab: false, buttons: [
    "switch.escritorio_umidificador_escritorio_local_led",
    "switch.escritorio_umidificador_escritorio_local_tomada"] });
  await tick(); await tick(); await tick();
  const cfg3 = c3._child && c3._child._cfg;
  if (cfg3) {
    const hum = cfg3.tabs[0].cards[0].cards[2];
    eq(hum.buttons, ["switch.escritorio_umidificador_escritorio_local_led",
      "switch.escritorio_umidificador_escritorio_local_tomada"], "ordem do YAML nos botões");
  }

  // override cru por cima do gerado
  const c4 = mk({ device: DEV, yaml_override: { shell_color: "#123456" },
    level_options: { level_scheme: "agua" }, power_options: { name: "GERAL" }, socket_device: TOMADA });
  await tick(); await tick(); await tick();
  const cfg4 = c4._child && c4._child._cfg;
  if (cfg4) {
    eq(cfg4.shell_color, "#123456", "override da casca");
    eq(cfg4.tabs[0].cards[1].heading, "💧 UMIDIFICADOR", "override não derruba o resto");
    eq(cfg4.tabs[0].cards[2].cards[0].level_scheme, "agua", "opção do card de nível");
    eq(cfg4.tabs[1].cards[1].cards[0].name, "GERAL", "opção do card da tomada");
  }

  // sem dispositivo: aviso honesto, nunca card quebrado
  const c5 = mk({});
  await tick(); await tick();
  ok(!c5._child, "sem dispositivo não pode montar card");
  ok(/Escolha o/.test(String(c5._host.innerHTML)), "faltou o aviso de dispositivo vazio");

  // editor monta sem hass e sem os elementos internos do HA
  const ed = new (customElements.get("mw-tab-humidifier-card-editor"))();
  let erro = null;
  try { ed.setConfig({ device: DEV }); } catch (e) { erro = e; }
  ok(!erro, `editor quebrou sem hass: ${erro && erro.message}`);
  erro = null;
  try { ed.hass = HASS; } catch (e) { erro = e; }
  ok(!erro, `editor quebrou com hass: ${erro && erro.message}`);

  const emitido = [];
  ed.addEventListener("config-changed", (ev) => emitido.push(ev.detail.config));
  ed._patch({ spacers: 2, paper_color: "orange-7" });
  const last = emitido[emitido.length - 1] || {};
  ok(!("spacers" in last), "spacers igual ao default foi escrito no YAML");
  ok(!("paper_color" in last), "paper_color igual ao default foi escrito no YAML");

  ok(infoBanner.some((l) => /MW-TAB-HUMIDIFIER-CARD/.test(l)), "banner de versão ausente");

  if (fails.length) {
    console.error(`\n✗ probe: ${fails.length} falha(s), ${pass} ok\n`);
    for (const f of fails) console.error("  · " + f);
    process.exit(1);
  }
  console.log(`✓ probe mw-tab-humidifier-card: ${pass} verificações passaram`);
})();
