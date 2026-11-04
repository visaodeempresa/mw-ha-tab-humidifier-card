# MW Tab Umidifier Card

`custom:mw-tab-humidifier-card` — a tela inteira de um umidificador a partir de
**uma** chave: o dispositivo.

| aba | o que entra |
|---|---|
| **UMIDIFICADOR** | faixa de umidade da casa (`mw-rainbow-card`) · foto do aparelho · botões tomada/LED/mute/sleep (`mw-humidifier-card`) · nível de spray (`mw-humidifier-level-card`) |
| **ENERGIA** | a tomada em `power-button-card`, com tensão/corrente/potência achados sozinhos |

A casca, as abas e o papel são do `custom:mw-tab-card`. Nada é redesenhado
aqui: este card é o **compositor** — irmão do `mw-ha-tab-lights-card`.

## Depende de (HACS)

`MW Tab Card` · `MW Humidifier Card` · `MW Humidifier Level Card` ·
`MW Rainbow Card` · `MW Power Button Card` · `Mushroom`

## Exemplo

```yaml
type: custom:mw-tab-humidifier-card
device: fda7f6d18521b81c9cc3664164047d7d
socket_device: <id da tomada>
image: /local/devices/umidificador-coibeu.webp
rainbow_devices:
  - device: 38d90889eb16a1b0a9846ad7eee81e51
  - device: d97dd0a97c805bf861af5a26f9361bc4
```

## Descoberta a partir do dispositivo

| peça | como é achada |
|---|---|
| botões | `switch.*` do dispositivo, na ordem tomada → LED → mute → sleep; o resto vai para o fim |
| nível | `select.*` com `spray`/`level`/`nível` no id |
| tomada | `switch.*` do `socket_device` (prefere `socket`/`tomada`/`plug`) |
| tensão/corrente/potência | `sensor.*` do `socket_device` por nome |

Entidade com `hidden_by`/`disabled_by` nunca vira botão.

## Chaves

| chave | padrão | o quê |
|---|---|---|
| `device` | — | o umidificador |
| `socket_device` / `socket_entity` | — | a tomada (aba ENERGIA) |
| `image` | — | foto do aparelho |
| `rainbow` / `rainbow_devices[]` | `true` / — | faixa de umidade no topo |
| `level` / `level_entity` | `true` / descoberto | nível de spray |
| `energy_tab` | `true` | cria a aba ENERGIA |
| `spacers` | `2` | espaçadores acima dos botões |
| `button_icon_size` | `65` | ícone dos botões |
| `buttons[]` | descoberto | ordem e inclusão dos botões |
| `heading` / `energy_heading` | `💧 UMIDIFICADOR` / `🔌 TOMADAS ELÉTRICAS` | títulos |
| `humidifier_options`, `rainbow_options`, `level_options`, `power_options` | — | qualquer opção do card de dentro |
| `tabs_options` | `right`/`icon`/`32`/`keep_alive:false` | espelho das chaves do `mw-tab-card` |
| `tabs_yaml`, `yaml_override`, `extra_cards`, `extra_tabs` | — | merge cru sobre o gerado |

## Verificação

```bash
node --check dist/mw-tab-humidifier-card.js && node tools/probe.js
```

---

Autoria: MAYCON WILLIAN OLIVEIRA <visaodeempresa@gmail.com>
