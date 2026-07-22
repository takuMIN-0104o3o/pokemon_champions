const DATA_URL = "./data";

let pokemonDB = {};
let learnsetDB = {};
let abilitiesByPokemon = {};
// archives.bulbagarden.net のサムネイルURL(thumb/ハッシュ/ハッシュ/ファイル名/...)は、
// 元ファイルが更新されるとハッシュが変わってリンク切れになることがある。
// MediaWiki標準のSpecial:FilePathはファイル名だけで常に現在のファイルに解決してくれるため、
// こちらに変換して安定してアイコンが表示されるようにする。
function toStableArchiveUrl(url) {
  if (!url || !url.includes('archives.bulbagarden.net')) return url;
  const segments = url.split('/').filter(Boolean);
  let filename = segments[segments.length - 1];
  // "60px-Bag_Foo_Sprite.png" のようなサムネイル接頭辞がついていれば除去
  filename = filename.replace(/^\d+px-/, '');
  return `https://archives.bulbagarden.net/wiki/Special:FilePath/${filename}`;
}

let itemIconMap = {};
let megaMap = {};
let bulbaPokemonIconMap = {};
let pokemonIconLocalShiny = {};
let itemIconLocalMap = {};
let pzPokemonIconMap = {};
let formChangeMap = {};
let rankingDB = {};
let pokemonNames = [];
let movesDetail = {};

let myParty = Array(6).fill().map(() => ({ name: "", item: "", nature: "", ability: "", evs: {h:0,a:0,b:0,c:0,d:0,s:0}, moves: ["","","",""] }));
let enemyParty = Array(6).fill().map(() => ({ name: "", moves: ["","","",""], evs: {h:0,a:0,b:0,c:0,d:0,s:0}, nature: "", item: "", ability: "" }));

let activeMyIndex = null;
let activeEnemyIndex = null;

let attackDirection = 'atk';
let currentWeather = 'none'; // none|sun|rain|sand|snow
let myTailwind = false;
let enemyTailwind = false;
let myRanks = {h:0,a:0,b:0,c:0,d:0,s:0};
let enemyRanks = {h:0,a:0,b:0,c:0,d:0,s:0};
let selectedMoveIndex = null;
let manualHitCount = null;

// window.setDirection = Vite module scope fix
window.setDirection = function(dir) {
  attackDirection = dir;
  document.getElementById('dir-atk').classList.toggle('dir-btn-active', dir === 'atk');
  document.getElementById('dir-def').classList.toggle('dir-btn-active', dir === 'def');
  selectedMoveIndex = null;
  renderCalcMoves();
  updateCalculator();
};

window.clearMyParty = function() {
  if (confirm("自陣の入力をすべてクリアしますか？")) {
    myParty = Array(6).fill().map(() => ({ name: "", item: "", nature: "", ability: "", evs: {h:0,a:0,b:0,c:0,d:0,s:0}, moves: ["","","",""] }));
    activeMyIndex = null;
    selectedMoveIndex = null;
    renderMyParty();
    updateCalculator();
  }
};

window.toggleSuggestionPanel = function() {
  const panel = document.getElementById("suggestion-panel");
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'flex' : 'none';
};

window.clearEnemyParty = function() {
  if (confirm("敵陣の入力をすべてクリアしますか？")) {
    enemyParty = Array(6).fill().map(() => ({ name: "", moves: ["","","",""], evs: {h:0,a:0,b:0,c:0,d:0,s:0}, nature: "", item: "", ability: "" }));
    activeEnemyIndex = null;
    selectedMoveIndex = null;
    renderEnemyParty();
    updateCalculator();
    const suggestions = document.getElementById("suggestion-content");
    if(suggestions) suggestions.innerHTML = '<p class="empty-state" style="font-size:0.8rem;">敵陣のポケモンを選択すると表示されます。</p>';
  }
};

const TYPE_EN_TO_JA = {
  normal:'\u30ce\u30fc\u30de\u30eb', fire:'\u307b\u306e\u304a', water:'\u307f\u305a', electric:'\u3067\u3093\u304d', grass:'\u304f\u3055',
  ice:'\u3053\u304a\u308a', fighting:'\u304b\u304f\u3068\u3046', poison:'\u3069\u304f', ground:'\u3058\u3081\u3093', flying:'\u3072\u3053\u3046',
  psychic:'\u30a8\u30b9\u30d1\u30fc', bug:'\u3080\u3057', rock:'\u3044\u308f', ghost:'\u30b4\u30fc\u30b9\u30c8', dragon:'\u30c9\u30e9\u30b4\u30f3',
  dark:'\u3042\u304f', steel:'\u306f\u304c\u306d', fairy:'\u30d5\u30a7\u30a2\u30ea\u30fc'
};

function typeBadgeHTML(typeJa) {
  return typeIconHtml(typeJa, 22);
}

// プリセット管理
const MAX_PRESETS = 5;
function loadPresets() {
  try { return JSON.parse(localStorage.getItem('party_presets') || '[]'); } catch(e){ return []; }
}
function savePresets(presets) { localStorage.setItem('party_presets', JSON.stringify(presets)); }

function renderPresetPanel() {
  const container = document.getElementById('preset-panel');
  if(!container) return;
  const presets = loadPresets();
  
  let options = '<option value="">(\u30d7\u30ea\u30bb\u30c3\u30c8\u9078\u629e)</option>';
  presets.forEach((p, i) => { options += `<option value="${i}">${p.name}</option>`; });

  container.innerHTML = `
    <div style="display:flex; gap:0.3rem; align-items:center;">
      <select id="preset-select" style="flex:1; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.2); color:#fff; font-size:0.75rem; padding:0.25rem; border-radius:4px; min-width:0;">
        ${options}
      </select>
      <button id="preset-load" class="preset-load-btn" style="flex:none; padding:0.25rem 0.6rem; text-align:center; width:auto;">読込</button>
      <button id="preset-save" class="preset-save-btn" style="flex:none; width:auto; margin-bottom:0; padding:0.25rem 0.6rem;">保存</button>
      <button id="preset-del" class="preset-del-btn" style="flex:none; padding:0.25rem 0.4rem;">×</button>
    </div>
  `;

  document.getElementById('preset-save').onclick = () => {
    const name = prompt('\u4fdd\u5b58\u3059\u308b\u30d7\u30ea\u30bb\u30c3\u30c8\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044', `\u30d1\u30fc\u30c6\u30a3${presets.length+1}`);
    if(!name) return;
    const list = loadPresets();
    if(list.length >= MAX_PRESETS) list.shift();
    list.push({ name, party: JSON.parse(JSON.stringify(myParty)) });
    savePresets(list);
    renderPresetPanel();
  };

  document.getElementById('preset-load').onclick = () => {
    const sel = document.getElementById('preset-select').value;
    if(sel === "") return;
    const p = presets[sel];
    if(!confirm(`\u300c${p.name}\u300d\u3092\u8aad\u307f\u8fbc\u307f\u307e\u3059\u304b\uff1f`)) return;
    myParty = JSON.parse(JSON.stringify(p.party));
    activeMyIndex = null;
    renderMyParty();
    updateCalculator();
  };

  document.getElementById('preset-del').onclick = () => {
    const sel = document.getElementById('preset-select').value;
    if(sel === "") return;
    const list = loadPresets();
    if(!confirm(`\u300c${list[sel].name}\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f`)) return;
    list.splice(sel, 1);
    savePresets(list);
    renderPresetPanel();
  };
}

const RANK_MULTS = [0.25,0.28,0.33,0.40,0.50,0.66,1.0,1.5,2.0,2.5,3.0,3.5,4.0];
function getRankMult(rank) { return RANK_MULTS[rank + 6]; }

function renderWeatherPanel() {
  const el = document.getElementById('weather-panel');
  if (!el) return;
  el.innerHTML = '';

  const weatherLabel = document.createElement('span');
  weatherLabel.textContent = '天候:';
  weatherLabel.style.cssText = 'font-size:0.72rem; color:#a0a0b0;';
  el.appendChild(weatherLabel);

  const weathers = [['none','なし'], ['sun','晴れ'], ['rain','雨'], ['sand','すなあらし'], ['snow','雪']];
  weathers.forEach(([val, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    const active = currentWeather === val;
    btn.style.cssText = `padding:0.15rem 0.5rem; font-size:0.72rem; border-radius:4px; cursor:pointer; border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${active ? 'var(--accent-color)' : 'rgba(0,0,0,0.2)'}; color:${active ? '#fff' : '#a0a0b0'};`;
    btn.onclick = () => {
      currentWeather = val;
      renderWeatherPanel();
      renderMyParty();
      renderEnemyParty();
      updateCalculator();
    };
    el.appendChild(btn);
  });

  const spacer = document.createElement('span');
  spacer.style.cssText = 'width:0.5rem;';
  el.appendChild(spacer);

  [['my','自陣おいかぜ'], ['enemy','敵陣おいかぜ']].forEach(([side, label]) => {
    const btn = document.createElement('button');
    const active = side === 'my' ? myTailwind : enemyTailwind;
    btn.textContent = label + (active ? ' ON' : ' OFF');
    btn.style.cssText = `padding:0.15rem 0.5rem; font-size:0.72rem; border-radius:4px; cursor:pointer; border:1px solid ${active ? '#60a5fa' : 'rgba(255,255,255,0.1)'}; background:${active ? 'rgba(96,165,250,0.25)' : 'rgba(0,0,0,0.2)'}; color:${active ? '#93c5fd' : '#a0a0b0'};`;
    btn.onclick = () => {
      if (side === 'my') myTailwind = !myTailwind; else enemyTailwind = !enemyTailwind;
      renderWeatherPanel();
      renderMyParty();
      renderEnemyParty();
      updateCalculator();
    };
    el.appendChild(btn);
  });
}

// 天候による素早さ2倍の特性(すいすい/ようりょくそ/すなかき/ゆきかき)
function getWeatherSpeedMult(ability) {
  if (currentWeather === 'rain' && ability === 'すいすい') return 2.0;
  if (currentWeather === 'sun' && ability === 'ようりょくそ') return 2.0;
  if (currentWeather === 'sand' && ability === 'すなかき') return 2.0;
  if (currentWeather === 'snow' && ability === 'ゆきかき') return 2.0;
  return 1.0;
}

// 天候によるタイプ補正 (晴れ:ほのお1.5/みず0.5、雨:みず1.5/ほのお0.5)
function getWeatherTypeMult(moveTypeEn) {
  if (currentWeather === 'sun') {
    if (moveTypeEn === 'fire') return 1.5;
    if (moveTypeEn === 'water') return 0.5;
  }
  if (currentWeather === 'rain') {
    if (moveTypeEn === 'water') return 1.5;
    if (moveTypeEn === 'fire') return 0.5;
  }
  return 1.0;
}

// すなあらし: いわタイプの特防1.5倍 / 雪: こおりタイプの防御1.5倍
function getWeatherDefMult(defenderTypes, statKey) {
  if (currentWeather === 'sand' && statKey === 'd' && (defenderTypes||[]).includes('rock')) return 1.5;
  if (currentWeather === 'snow' && statKey === 'b' && (defenderTypes||[]).includes('ice')) return 1.5;
  return 1.0;
}

function renderRankPanels() {
  ['my','enemy'].forEach(side => {
    const grid = document.getElementById(`rank-${side}`);
    if(!grid) return;
    grid.innerHTML = '';
    const ranks = side === 'my' ? myRanks : enemyRanks;
    ['h','a','b','c','d','s'].forEach((st, i) => {
      const label = ['H','A','B','C','D','S'][i];
      const val = ranks[st];
      const col = document.createElement('div');
      col.className = 'rank-stat-col';
      const cls = val > 0 ? 'positive' : val < 0 ? 'negative' : '';
      col.innerHTML = `
        <button class="rank-adj-btn" data-side="${side}" data-st="${st}" data-d="1">△</button>
        <div class="rank-label">${label}</div>
        <div class="rank-value ${cls}">${val > 0 ? '+'+val : val}</div>
        <button class="rank-adj-btn" data-side="${side}" data-st="${st}" data-d="-1">▽</button>
      `;
      grid.appendChild(col);
    });
    grid.querySelectorAll('.rank-adj-btn').forEach(btn => {
      btn.onclick = () => {
        const { side, st, d } = btn.dataset;
        const r = side === 'my' ? myRanks : enemyRanks;
        r[st] = Math.max(-6, Math.min(6, (r[st]||0) + parseInt(d)));
        renderRankPanels();
        if (side === 'my') renderMyParty(); else renderEnemyParty();
        updateCalculator();
      };
    });
  });
}

function renderHitCountSelector(moveName, maxHits, currentHits) {
  const el = document.getElementById('hit-count-selector');
  if (!el) return;
  if (maxHits <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  const label = document.createElement('span');
  label.textContent = '命中回数:';
  label.style.cssText = 'font-size:0.72rem; color:#a0a0b0;';
  el.innerHTML = '';
  el.appendChild(label);
  for (let n = 1; n <= maxHits; n++) {
    const btn = document.createElement('button');
    btn.textContent = `${n}`;
    const active = n === currentHits;
    btn.style.cssText = `padding:0.15rem 0.5rem; font-size:0.75rem; border-radius:4px; cursor:pointer; border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${active ? 'var(--accent-color)' : 'rgba(0,0,0,0.2)'}; color:${active ? '#fff' : '#a0a0b0'};`;
    btn.onclick = () => {
      manualHitCount = n;
      updateCalculator();
    };
    el.appendChild(btn);
  }
}

function renderCalcMoves() {
  const container = document.getElementById('calc-moves');
  if(!container) return;
  container.innerHTML = '';
  container.style.display = 'grid';
  container.style.gridTemplateColumns = '1fr 1fr';
  container.style.gap = '0.4rem';
  container.style.marginBottom = '0.5rem';
  
  // 攻撃側の技を表示
  const attackerParty = attackDirection === 'atk' ? myParty : enemyParty;
  const attackerIdx = attackDirection === 'atk' ? activeMyIndex : activeEnemyIndex;
  if(attackerIdx === null) return;
  const attacker = attackerParty[attackerIdx];
  if(!attacker) return;
  
  attacker.moves.forEach((move, i) => {
    const btn = document.createElement('button');
    btn.className = 'calc-move-btn' + (selectedMoveIndex === i ? ' selected' : '');
    const moveName = move || `技${i+1}(未入力)`;
    const mData = move ? movesDetail[move] : null;
    let badge = '';
    if(mData) {
      const typeJa = TYPE_EN_TO_JA[mData.type] || mData.type || '';
      const color = TYPE_COLORS[typeJa] || '#777';
      const classLabel = mData.damage_class === 'physical' ? '物' : mData.damage_class === 'special' ? '特' : '変';
      const classColor = mData.damage_class === 'physical' ? '#ef4444' : mData.damage_class === 'special' ? '#3b82f6' : '#a3a3a3';
      badge = `<span style="background:${color}bb; border-radius:3px; font-size:0.62rem; padding:0.05rem 0.25rem; margin-right:2px;">${typeJa}</span><span style="background:${classColor}44; border-radius:3px; font-size:0.62rem; padding:0.05rem 0.2rem; color:${classColor};">${classLabel}</span>`;
      if(mData.power) badge += ` <span style="color:#94a3b8; font-size:0.62rem;">威${mData.power}</span>`;
    }
    btn.innerHTML = `<span style="font-weight:600; display:block;">${moveName}</span><div style="display:flex; align-items:center; gap:2px; margin-top:2px;">${badge}</div>`;
    btn.onclick = () => {
      selectedMoveIndex = i;
      manualHitCount = null;
      renderCalcMoves();
      renderEnemyParty();
      updateCalculator();
    };
    container.appendChild(btn);
  });
}

// Fetch data
async function init() {
  try {
    const pDBReq = await fetch(`${DATA_URL}/pokemon_db.json`);
    pokemonDB = await pDBReq.json();
    pokemonNames = Object.keys(pokemonDB);
    try {
      const lsReq = await fetch(`${DATA_URL}/learnset.json`);
      learnsetDB = await lsReq.json();
    } catch(e) { console.warn('技習得データの読み込みに失敗しました', e); }
    try {
      const abReq = await fetch(`${DATA_URL}/abilities_by_pokemon.json`);
      abilitiesByPokemon = await abReq.json();
    } catch(e) { console.warn('特性データの読み込みに失敗しました', e); }
    try {
      const iiReq = await fetch(`${DATA_URL}/item_icon_map.json`);
      itemIconMap = await iiReq.json();
    } catch(e) { console.warn('アイテムアイコンデータの読み込みに失敗しました', e); }
    try {
      const ilReq = await fetch(`${DATA_URL}/item_icon_local.json`);
      itemIconLocalMap = await ilReq.json();
    } catch(e) { itemIconLocalMap = {}; }
    try {
      const mmReq = await fetch(`${DATA_URL}/mega_map.json`);
      megaMap = await mmReq.json();
    } catch(e) { console.warn('メガシンカデータの読み込みに失敗しました', e); }
    try {
      const bpReq = await fetch(`${DATA_URL}/bulba_pokemon_icons.json`);
      bulbaPokemonIconMap = await bpReq.json();
    } catch(e) { console.warn('ポケモン画像データの読み込みに失敗しました', e); }
    // ローカルに同梱したポケモン画像があれば、外部URLより優先して使う
    try {
      const localReq = await fetch(`${DATA_URL}/pokemon_icon_local.json`);
      const localMap = await localReq.json();
      Object.assign(bulbaPokemonIconMap, localMap);
    } catch(e) { /* ローカル画像データがなければ従来どおり外部URLを使う */ }
    try {
      const localShinyReq = await fetch(`${DATA_URL}/pokemon_icon_local_shiny.json`);
      pokemonIconLocalShiny = await localShinyReq.json();
    } catch(e) { pokemonIconLocalShiny = {}; }
    try {
      const pzReq = await fetch(`${DATA_URL}/pz_pokemon_icons.json`);
      pzPokemonIconMap = await pzReq.json();
    } catch(e) { console.warn('ポケモン画像データ(PZ)の読み込みに失敗しました', e); }
    try {
      const fcReq = await fetch(`${DATA_URL}/form_change_map.json`);
      formChangeMap = await fcReq.json();
    } catch(e) { console.warn('フォルムチェンジデータの読み込みに失敗しました', e); }
    const rDBReq = await fetch(`${DATA_URL}/ranking.json`);
    rankingDB = await rDBReq.json();
    const listsReq = await fetch(`${DATA_URL}/lists.json`);
    listsDB = await listsReq.json();
    movesDetail = listsDB.moves_detail || {};

    // Merge overrides saved locally via the master data page (localStorage)
    try {
      const rankingOverrides = JSON.parse(localStorage.getItem('ranking_overrides') || '{}');
      Object.entries(rankingOverrides).forEach(([name, data]) => { rankingDB[name] = data; });

      const pokeFlags = JSON.parse(localStorage.getItem('pokemon_flags') || '{}');
      const flagSet = new Set(listsDB.pokemons || []);
      Object.entries(pokeFlags).forEach(([name, on]) => {
        if (on) flagSet.add(name); else flagSet.delete(name);
      });
      listsDB.pokemons = Array.from(flagSet).sort();

      // アイテムのカテゴリ(きのみ/メガストーン/その他)を保持したままフラグの追加・削除のみ反映する
      const itemFlags = JSON.parse(localStorage.getItem('item_flags') || '{}');
      const categoryByName = {};
      (listsDB.items || []).forEach(i => { categoryByName[i.name] = i.category; });
      try {
        const allItemsReq = await fetch(`${DATA_URL}/masterdata_items.json`);
        const allItems = await allItemsReq.json();
        allItems.forEach(i => { if (!(i.name in categoryByName)) categoryByName[i.name] = i.category; });
      } catch(e) {}
      const itemNameSet = new Set((listsDB.items || []).map(i => i.name));
      Object.entries(itemFlags).forEach(([name, on]) => {
        if (on) itemNameSet.add(name); else itemNameSet.delete(name);
      });
      listsDB.items = Array.from(itemNameSet).sort().map(name => ({ name, category: categoryByName[name] || 'other' }));

      // メガ進化後の姿は選択肢から除外(ベースポケモン選択後にメガアイコンで切替する)
      const megaFormNames = new Set(Object.values(megaMap).flat());
      const formChangeAltNames = new Set(Object.values(formChangeMap).flat());
      listsDB.pokemons = (listsDB.pokemons || []).filter(n => !megaFormNames.has(n) && !formChangeAltNames.has(n));
    } catch(e) { console.warn('Failed to merge local overrides', e); }

    // Add abilities extracting from rankingDB
    const abilitiesSet = new Set();
    Object.values(rankingDB).forEach(r => {
      if(r.ability) r.ability.forEach(a => abilitiesSet.add(a.name));
    });
    listsDB.abilities = Array.from(abilitiesSet).sort();
    
    renderMyParty();
    renderEnemyParty();
    renderRankPanels();
    renderWeatherPanel();
    renderPresetPanel();
  } catch(e) {
    console.error("Failed to fetch data from API. Is the python server running?", e);
  }
}

// Basic type colors
const TYPE_COLORS = {
  "ノーマル": "#A8A77A", "ほのお": "#EE8130", "みず": "#6390F0", "でんき": "#F7D02C", "くさ": "#7AC74C",
  "こおり": "#96D9D6", "かくとう": "#C22E28", "どく": "#A33EA1", "じめん": "#E2BF65", "ひこう": "#A98FF3",
  "エスパー": "#F95587", "むし": "#A6B91A", "いわ": "#B6A136", "ゴースト": "#735797", "ドラゴン": "#6F35FC",
  "あく": "#705746", "はがね": "#B7B7CE", "フェアリー": "#D685AD"
};

// 技欄の左に出す丸アイコン用：各タイプを表す一文字
const TYPE_KANJI = {
  "ノーマル": "ノ", "ほのお": "炎", "みず": "水", "でんき": "電", "くさ": "草",
  "こおり": "氷", "かくとう": "闘", "どく": "毒", "じめん": "地", "ひこう": "飛",
  "エスパー": "超", "むし": "虫", "いわ": "岩", "ゴースト": "霊", "ドラゴン": "竜",
  "あく": "悪", "はがね": "鋼", "フェアリー": "妖"
};

// 技名から、技欄の左に出すタイプアイコン(画像)を更新する
// 日本語ファイル名はWindowsのローカルサーバーで文字化け・404になることがあるため、
// アイコンファイル自体は英語名で保存し、日本語タイプ名から変換して参照する
const TYPE_FILE_NAME = {
  "ノーマル": "normal", "ほのお": "fire", "みず": "water", "でんき": "electric", "くさ": "grass",
  "こおり": "ice", "かくとう": "fighting", "どく": "poison", "じめん": "ground", "ひこう": "flying",
  "エスパー": "psychic", "むし": "bug", "いわ": "rock", "ゴースト": "ghost", "ドラゴン": "dragon",
  "あく": "dark", "はがね": "steel", "フェアリー": "fairy"
};
const TYPE_ICON_PATH = {};
Object.keys(TYPE_COLORS).forEach((t) => { TYPE_ICON_PATH[t] = `./icons/types/${TYPE_FILE_NAME[t] || t}.svg`; });

function updateMoveTypeIcon(iconEl, moveName) {
  if (!iconEl) return;
  const mData = moveName ? movesDetail[moveName] : null;
  if (!mData) {
    iconEl.style.backgroundImage = "";
    iconEl.title = "";
    iconEl.classList.remove("move-type-icon-filled");
    return;
  }
  const typeJa = TYPE_EN_TO_JA[mData.type] || mData.type || "";
  const iconPath = TYPE_ICON_PATH[typeJa];
  if (iconPath) {
    iconEl.style.backgroundImage = `url("${iconPath}")`;
    iconEl.classList.add("move-type-icon-filled");
  } else {
    iconEl.style.backgroundImage = "";
    iconEl.classList.remove("move-type-icon-filled");
  }
  iconEl.title = typeJa;
}

const STAT_BOOST_ITEMS = [
  "こだわりハチマキ", "こだわりメガネ", "こだわりスカーフ",
  "いのちのたま", "たつじんのおび", "とつげきチョッキ",
  "しんかのきせき", "パンチグローブ", "クリアチャーム", "ブーストエナジー"
];

const TYPE_BOOST_ITEMS = {
  "シルクのスカーフ": "ノーマル", "ノーマルジュエル": "ノーマル",
  "もくたん": "ほのお", "ひのたまプレート": "ほのお",
  "しんぴのしずく": "みず", "うしおのおこう": "みず", "さざなみのおこう": "みず", "しずくプレート": "みず",
  "じしゃく": "でんき", "いかずちプレート": "でんき",
  "きせきのタネ": "くさ", "みどりのプレート": "くさ", "おはなのおこう": "くさ",
  "とけないこおり": "こおり", "つららのプレート": "こおり",
  "くろおび": "かくとう", "こぶしのプレート": "かくとう",
  "どくバリ": "どく", "もうどくプレート": "どく",
  "やわらかいすな": "じめん", "だいちのプレート": "じめん",
  "するどいくちばし": "ひこう", "あおぞらプレート": "ひこう",
  "まがったスプーン": "エスパー", "ふしぎのプレート": "エスパー", "あやしいおこう": "エスパー",
  "ぎんのこな": "むし", "たまむしプレート": "むし",
  "かたいいし": "いわ", "がんせきプレート": "いわ", "がんせきおこう": "いわ",
  "のろいのおふだ": "ゴースト", "もののけプレート": "ゴースト",
  "りゅうのキバ": "ドラゴン", "りゅうのプレート": "ドラゴン",
  "くろいメガネ": "あく", "こわもてプレート": "あく",
  "メタルコート": "はがね", "こうてつプレート": "はがね",
  "ようせいのはね": "フェアリー", "せいれいプレート": "フェアリー"
};

const NATURE_EFFECTS = {
  "さみしがり": { up: "attack", down: "defense" },
  "いじっぱり": { up: "attack", down: "special-attack" },
  "やんちゃ": { up: "attack", down: "special-defense" },
  "ゆうかん": { up: "attack", down: "speed" },
  
  "ずぶとい": { up: "defense", down: "attack" },
  "わんぱく": { up: "defense", down: "special-attack" },
  "のうてんき": { up: "defense", down: "special-defense" },
  "のんき": { up: "defense", down: "speed" },
  
  "ひかえめ": { up: "special-attack", down: "attack" },
  "おっとり": { up: "special-attack", down: "defense" },
  "うっかりや": { up: "special-attack", down: "special-defense" },
  "れいせい": { up: "special-attack", down: "speed" },
  
  "おだやか": { up: "special-defense", down: "attack" },
  "おとなしい": { up: "special-defense", down: "defense" },
  "しんちょう": { up: "special-defense", down: "special-attack" },
  "なまいき": { up: "special-defense", down: "speed" },
  
  "おくびょう": { up: "speed", down: "attack" },
  "せっかち": { up: "speed", down: "defense" },
  "ようき": { up: "speed", down: "special-attack" },
  "むじゃき": { up: "speed", down: "special-defense" }
};

function getMegaBaseName(name) {
  const m = /^(.+?)\((メガ[XY]?)\)$/.exec(name || '');
  return m ? m[1] : name;
}

function getMegaVariants(baseName) {
  return megaMap[baseName] || [];
}

function toggleMegaForm(poke) {
  const baseName = getMegaBaseName(poke.name);
  const variants = getMegaVariants(baseName);
  if (!variants.length) return;
  const states = [baseName, ...variants];
  const currentIdx = states.indexOf(poke.name);
  const nextIdx = (currentIdx === -1 ? 0 : currentIdx + 1) % states.length;
  poke.name = states[nextIdx];
  // メガシンカ/元に戻す際、そのフォルムの特性が1つしかない場合は自動で反映する
  const newAbilities = abilitiesByPokemon[poke.name];
  if (newAbilities && newAbilities.length === 1) {
    poke.ability = newAbilities[0];
  }
}

function renderMegaIcon(iconEl, poke) {
  if (!iconEl) return;
  const baseName = getMegaBaseName(poke.name);
  const variants = getMegaVariants(baseName);
  if (!poke.name || !variants.length) {
    iconEl.style.display = 'none';
    return;
  }
  const isMega = poke.name !== baseName;
  iconEl.style.display = 'block';
  iconEl.title = isMega ? `クリックで元のすがたに戻す（現在: ${poke.name}）` : `クリックでメガシンカ`;
  if (isMega) {
    iconEl.style.filter = 'none';
    iconEl.style.opacity = '1';
    iconEl.style.boxShadow = '0 0 0 2px #4ade80, 0 0 8px 2px rgba(74,222,128,0.7)';
  } else {
    iconEl.style.filter = 'grayscale(1)';
    iconEl.style.opacity = '0.55';
    iconEl.style.boxShadow = 'none';
  }
}

function getFormChangeVariants(baseName) {
  return formChangeMap[baseName] || [];
}

function getFormChangeBaseName(name) {
  for (const base in formChangeMap) {
    if (base === name || formChangeMap[base].includes(name)) return base;
  }
  return name;
}

function toggleFormChange(poke) {
  const baseName = getFormChangeBaseName(poke.name);
  const variants = getFormChangeVariants(baseName);
  if (!variants.length) return;
  const states = [baseName, ...variants];
  const currentIdx = states.indexOf(poke.name);
  const nextIdx = (currentIdx === -1 ? 0 : currentIdx + 1) % states.length;
  poke.name = states[nextIdx];
  const newAbilities = abilitiesByPokemon[poke.name];
  if (newAbilities && newAbilities.length === 1) {
    poke.ability = newAbilities[0];
  }
}

function renderFormChangeIcon(iconEl, poke) {
  if (!iconEl) return;
  const baseName = getFormChangeBaseName(poke.name);
  const variants = getFormChangeVariants(baseName);
  if (!poke.name || !variants.length) {
    iconEl.style.display = 'none';
    return;
  }
  const isAltForm = poke.name !== baseName;
  iconEl.style.display = 'block';
  iconEl.title = isAltForm ? `クリックで元のフォルムに戻す（現在: ${poke.name}）` : `クリックでフォルムチェンジ`;
  if (isAltForm) {
    iconEl.style.filter = 'none';
    iconEl.style.opacity = '1';
    iconEl.style.boxShadow = '0 0 0 2px #60a5fa, 0 0 8px 2px rgba(96,165,250,0.7)';
  } else {
    iconEl.style.filter = 'grayscale(1)';
    iconEl.style.opacity = '0.55';
    iconEl.style.boxShadow = 'none';
  }
}

function getMyMoveDamageClass() {
  if (activeMyIndex === null) return null;
  const myPoke = myParty[activeMyIndex];
  if (!myPoke) return null;
  // 選択中の技があればそれを優先、無ければ1つ目の入力済み技で判定
  let moveName = null;
  if (attackDirection === 'atk' && selectedMoveIndex !== null) {
    moveName = myPoke.moves[selectedMoveIndex];
  }
  if (!moveName) {
    moveName = (myPoke.moves || []).find(m => m);
  }
  if (!moveName) return null;
  const mData = movesDetail[moveName];
  return mData ? mData.damage_class : null;
}

// ポケモンのアイコンURLを取得する（同梱したローカル画像 / bulbaのアイコンのみを使用。PokeAPIは使わない）
function getPokemonIconUrl(pokeName, pData) {
  if (pokeName && bulbaPokemonIconMap && bulbaPokemonIconMap[pokeName]) {
    return toStableArchiveUrl(bulbaPokemonIconMap[pokeName]);
  }
  return '';
}

function updatePokeIcon(iconEl, pokeName) {
  if (!iconEl) return;
  const pData = pokeName ? pokemonDB[pokeName] : null;
  const url = getPokemonIconUrl(pokeName, pData);
  if (url) {
    iconEl.src = url;
    iconEl.style.display = 'block';
    iconEl.onerror = () => { iconEl.style.display = 'none'; };
  } else {
    iconEl.style.display = 'none';
    iconEl.src = '';
  }
}

// チャンピオンズの努力値仕様: ステータス毎の最大は32、1ポイントにつき実数値+1
// (レベル50・個体値31固定を前提とした簡易実数値計算)
const CHAMPIONS_MAX_EV_PER_STAT = 32;

// 努力値入力: 普段は数字だけのチップ表示、タップするとスライダーがポップアップする方式
let evPopupEl = null, evPopupSlider = null, evPopupLabel = null;
let evPopupActiveChip = null, evPopupOnChange = null;

function closeEvPopup() {
  if (evPopupEl) evPopupEl.style.display = 'none';
  if (evPopupActiveChip) evPopupActiveChip.classList.remove('ev-chip-active');
  evPopupActiveChip = null;
  evPopupOnChange = null;
}

function ensureEvPopup() {
  if (evPopupEl) return;
  evPopupEl = document.createElement('div');
  evPopupEl.className = 'ev-popup';
  evPopupEl.style.display = 'none';

  evPopupLabel = document.createElement('div');
  evPopupLabel.className = 'ev-popup-label';

  evPopupSlider = document.createElement('input');
  evPopupSlider.type = 'range';
  evPopupSlider.min = '0';
  evPopupSlider.max = String(CHAMPIONS_MAX_EV_PER_STAT);
  evPopupSlider.step = '1';
  evPopupSlider.className = 'ev-popup-slider';

  evPopupEl.appendChild(evPopupLabel);
  evPopupEl.appendChild(evPopupSlider);
  document.body.appendChild(evPopupEl);

  const commit = (v) => {
    evPopupLabel.textContent = v;
    if (evPopupActiveChip) evPopupActiveChip.textContent = v;
    if (evPopupOnChange) evPopupOnChange(v);
  };

  evPopupSlider.addEventListener('input', () => commit(parseInt(evPopupSlider.value) || 0));
  evPopupSlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    const v = Math.max(0, Math.min(CHAMPIONS_MAX_EV_PER_STAT, (parseInt(evPopupSlider.value) || 0) + delta));
    evPopupSlider.value = v;
    commit(v);
  }, { passive: false });

  // ポップアップ自体のクリックでは閉じない（外側タップでのみ閉じる）
  evPopupEl.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => closeEvPopup());
  window.addEventListener('scroll', () => closeEvPopup(), true);
  window.addEventListener('resize', () => closeEvPopup());
}

function openEvPopup(chip, value, onChange) {
  ensureEvPopup();
  document.querySelectorAll('.ev-chip-active').forEach(el => el.classList.remove('ev-chip-active'));
  evPopupActiveChip = chip;
  evPopupOnChange = onChange;
  chip.classList.add('ev-chip-active');
  evPopupSlider.value = value;
  evPopupLabel.textContent = value;
  evPopupEl.style.display = 'flex';

  const rect = chip.getBoundingClientRect();
  const popupRect = evPopupEl.getBoundingClientRect();
  let top = rect.top - popupRect.height - 8;
  if (top < 4) top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  left = Math.max(4, Math.min(window.innerWidth - popupRect.width - 4, left));
  evPopupEl.style.top = top + 'px';
  evPopupEl.style.left = left + 'px';
}

// container: 数字チップを表示する要素 / initialValue: 初期値 / onChange: 値確定時のコールバック
function createEvPicker(container, initialValue, onChange) {
  container.classList.add('ev-picker');
  container.innerHTML = '';

  const chip = document.createElement('div');
  chip.className = 'ev-chip';
  chip.textContent = initialValue;
  chip.classList.toggle('ev-chip-maxed', initialValue >= CHAMPIONS_MAX_EV_PER_STAT);
  container.appendChild(chip);

  const setValue = (v) => {
    chip.textContent = v;
    chip.classList.toggle('ev-chip-maxed', v >= CHAMPIONS_MAX_EV_PER_STAT);
    if (evPopupActiveChip === chip) {
      evPopupSlider.value = v;
      evPopupLabel.textContent = v;
    }
  };

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    openEvPopup(chip, parseInt(chip.textContent) || 0, (v) => {
      setValue(v);
      onChange(v);
    });
  });

  // タップ/クリックせずマウスホイールだけでも±1調整できるようにする
  chip.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cur = parseInt(chip.textContent) || 0;
    const delta = e.deltaY < 0 ? 1 : -1;
    const v = Math.max(0, Math.min(CHAMPIONS_MAX_EV_PER_STAT, cur + delta));
    setValue(v);
    onChange(v);
  }, { passive: false });

  return { setValue };
}

function calcRealStat(base, ev, type, nature) {
  if (!base) return "-";
  const b = parseInt(base) || 0;
  const e = Math.max(0, Math.min(CHAMPIONS_MAX_EV_PER_STAT, parseInt(ev) || 0));

  if (type === 'hp') {
    const baseStat = Math.floor((b * 2 + 31) * 0.5) + 60;
    return baseStat + e;
  } else {
    let stat = Math.floor((b * 2 + 31) * 0.5) + 5 + e;
    if (nature && NATURE_EFFECTS[nature]) {
      if (NATURE_EFFECTS[nature].up === type) stat = Math.floor(stat * 1.1);
      if (NATURE_EFFECTS[nature].down === type) stat = Math.floor(stat * 0.9);
    }
    return stat;
  }
}

// 能力を直接引き上げる持ち物の倍率(実数値そのものに反映されるもの)
function getStatItemMultiplier(statType, itemName) {
  if (!itemName) return 1.0;
  if (itemName === 'こだわりハチマキ' && statType === 'attack') return 1.5;
  if (itemName === 'こだわりメガネ' && statType === 'special-attack') return 1.5;
  if (itemName === 'こだわりスカーフ' && statType === 'speed') return 1.5;
  if (itemName === 'とつげきチョッキ' && statType === 'special-defense') return 1.5;
  return 1.0;
}

function calcRealStatWithItem(base, ev, statType, nature, itemName) {
  const raw = calcRealStat(base, ev, statType, nature);
  if (typeof raw !== 'number') return raw;
  const mult = getStatItemMultiplier(statType, itemName);
  return mult === 1.0 ? raw : Math.floor(raw * mult);
}

function applyRankToDisplay(rawVal, rank) {
  if (typeof rawVal !== 'number') return rawVal;
  return Math.floor(rawVal * getRankMult(rank || 0));
}

// UI Renderers
function renderMyParty() {
  const container = document.getElementById("my-party-container");
  container.innerHTML = "";
  const tmpl = document.getElementById("my-party-slot-template");
  
  myParty.forEach((poke, idx) => {
    const clone = tmpl.content.cloneNode(true);
    const slot = clone.querySelector(".party-slot");
    if (activeMyIndex === idx) slot.classList.add("active-battle");
    
    const btn = clone.querySelector(".battle-btn");
    btn.onclick = () => {
      activeMyIndex = idx;
      setDirection('atk');
      updateCalculator();
      renderMyParty();
    };
    
    const abiInput = clone.querySelector('.poke-ability-input');
    updatePokeIcon(clone.querySelector('.poke-icon'), poke.name);
    const megaIconEl = clone.querySelector('.mega-icon');
    renderMegaIcon(megaIconEl, poke);
    if (megaIconEl) {
      megaIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleMegaForm(poke);
        renderMyParty();
        updateCalculator();
      };
    }
    const formChangeIconEl = clone.querySelector('.form-change-icon');
    renderFormChangeIcon(formChangeIconEl, poke);
    if (formChangeIconEl) {
      formChangeIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleFormChange(poke);
        renderMyParty();
        updateCalculator();
      };
    }
    if (abiInput) {
      abiInput.value = poke.ability || '';
      abiInput.onclick = () => {
        const possible = poke.name ? abilitiesByPokemon[poke.name] : null;
        const abilityList = (possible && possible.length) ? possible : listsDB.abilities;
        const suffix = poke.name ? (possible && possible.length ? `${poke.name}が持てる特性のみ` : `${poke.name}の特性データなし・全特性表示`) : null;
        showGojuonModal('abilities', (val) => {
          poke.ability = val;
          renderMyParty();
          updateCalculator();
        }, abilityList, suffix);
      };
    }
    
    const updateStats = () => {
      const pData = pokemonDB[poke.name];
      if (!pData) return;
      const bs = pData.stats;

      const myTypesEl = slot.querySelector('.my-types');
      if (myTypesEl) {
        myTypesEl.innerHTML = (pData.types || []).map(t => {
          const typeJa = TYPE_EN_TO_JA[t] || t;
          return typeIconHtml(typeJa, 18);
        }).join('');
      }

      slot.querySelector('.bs-h').textContent = bs.hp || '-';
      slot.querySelector('.bs-a').textContent = bs.attack || '-';
      slot.querySelector('.bs-b').textContent = bs.defense || '-';
      slot.querySelector('.bs-c').textContent = bs['special-attack'] || '-';
      slot.querySelector('.bs-d').textContent = bs['special-defense'] || '-';
      slot.querySelector('.bs-s').textContent = bs.speed || '-';
      
      const myIsActive = (typeof idx !== 'undefined' && activeMyIndex === idx);
      const myR = myIsActive ? myRanks : {h:0,a:0,b:0,c:0,d:0,s:0};
      slot.querySelector('.rv-h').textContent = applyRankToDisplay(calcRealStatWithItem(bs.hp, poke.evs.h, 'hp', poke.nature, poke.item), myR.h);
      slot.querySelector('.rv-a').textContent = applyRankToDisplay(calcRealStatWithItem(bs.attack, poke.evs.a, 'attack', poke.nature, poke.item), myR.a);
      const myWeatherDefMult = getWeatherDefMult(pData.types || [], 'b');
      const myRawDef = applyRankToDisplay(calcRealStatWithItem(bs.defense, poke.evs.b, 'defense', poke.nature, poke.item), myR.b);
      slot.querySelector('.rv-b').textContent = typeof myRawDef === 'number' ? Math.floor(myRawDef * myWeatherDefMult) : myRawDef;
      slot.querySelector('.rv-c').textContent = applyRankToDisplay(calcRealStatWithItem(bs['special-attack'], poke.evs.c, 'special-attack', poke.nature, poke.item), myR.c);
      const myWeatherSpDefMult = getWeatherDefMult(pData.types || [], 'd');
      const myRawSpDef = applyRankToDisplay(calcRealStatWithItem(bs['special-defense'], poke.evs.d, 'special-defense', poke.nature, poke.item), myR.d);
      slot.querySelector('.rv-d').textContent = typeof myRawSpDef === 'number' ? Math.floor(myRawSpDef * myWeatherSpDefMult) : myRawSpDef;
      const myWeatherSpeedMult = myIsActive ? (getWeatherSpeedMult(poke.ability) * (myTailwind ? 2.0 : 1.0)) : 1.0;
      const myRawSpeed = applyRankToDisplay(calcRealStatWithItem(bs.speed, poke.evs.s, 'speed', poke.nature, poke.item), myR.s);
      slot.querySelector('.rv-s').textContent = typeof myRawSpeed === 'number' ? Math.floor(myRawSpeed * myWeatherSpeedMult) : myRawSpeed;
    };

    const nameInput = clone.querySelector(".poke-name-input");
    nameInput.value = poke.name;
    nameInput.addEventListener('click', () => {
      showGojuonModal('pokemons', async (selected) => {
        poke.name = selected;
        if(selected && !pokemonDB[selected]) {
           try {
              const det = pokemonDB[selected] || null;
              if(det) pokemonDB[selected] = det;
           } catch(e){}
        }
        if (selected) {
          const possible = abilitiesByPokemon[selected];
          poke.ability = (possible && possible.length) ? possible[0] : '';
        }
        updateCalculator();
        renderMyParty();
      });
    });

    const itemInput = clone.querySelector(".poke-item-input");
    itemInput.value = poke.item || '';
    if (STAT_BOOST_ITEMS.includes(poke.item) || TYPE_BOOST_ITEMS[poke.item]) {
       itemInput.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
       itemInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
       itemInput.style.color = '#fca5a5';
    } else {
       itemInput.style.backgroundColor = '';
       itemInput.style.borderColor = '';
       itemInput.style.color = '';
    }
    itemInput.addEventListener('click', () => {
      showGojuonModal('items', (selected) => {
        poke.item = selected;
        renderMyParty();
        updateCalculator();
      });
    });

    const natureInput = clone.querySelector(".poke-nature-input");
    natureInput.value = poke.nature || '';
    natureInput.addEventListener('click', () => {
      showGojuonModal('natures', (selected) => {
        poke.nature = selected;
        renderMyParty();
        updateCalculator();
      });
    });
    
    const CHAMPIONS_TOTAL_EV_CAP = 66;
    const evTotalLabel = clone.querySelector('.ev-total-label');
    const refreshEvTotal = () => {
      const total = ['h','a','b','c','d','s'].reduce((sum, k) => sum + (poke.evs[k] || 0), 0);
      if (evTotalLabel) {
        evTotalLabel.textContent = `努力値 ${total}/${CHAMPIONS_TOTAL_EV_CAP}`;
        evTotalLabel.style.color = total > CHAMPIONS_TOTAL_EV_CAP ? '#ef4444' : (total === CHAMPIONS_TOTAL_EV_CAP ? '#4ade80' : '#a0a0b0');
      }
    };

    ['h','a','b','c','d','s'].forEach(st => {
      const wheelEl = clone.querySelector(`.ev-wheel[data-stat="${st}"]`);
      if (!wheelEl) return;

      const applyValue = (rawV) => {
        let v = Math.max(0, Math.min(32, rawV));
        // 合計は66ポイントまでに自動制限（超過分はこの欄の値を削って調整）
        const otherTotal = ['h','a','b','c','d','s'].filter(k => k !== st).reduce((sum, k) => sum + (poke.evs[k] || 0), 0);
        const remaining = Math.max(0, CHAMPIONS_TOTAL_EV_CAP - otherTotal);
        if (v > remaining) v = remaining;
        poke.evs[st] = v;
        refreshEvTotal();
        updateStats();
        updateCalculator();
        return v;
      };

      const picker = createEvPicker(wheelEl, poke.evs[st] || 0, (v) => {
        const clamped = applyValue(v);
        if (clamped !== v) picker.setValue(clamped);
      });
    });
    refreshEvTotal();

    const moveInputs = clone.querySelectorAll(".move-input");
    moveInputs.forEach((mInput, moveIdx) => {
      mInput.value = poke.moves[moveIdx] || '';
      const iconEl = clone.querySelector(`.move-type-icon[data-move-idx="${moveIdx}"]`);
      updateMoveTypeIcon(iconEl, poke.moves[moveIdx]);
      mInput.addEventListener('click', () => {
        const learnable = poke.name ? learnsetDB[poke.name] : null;
        const moveList = (learnable && learnable.length) ? learnable : listsDB.moves;
        const suffix = poke.name ? (learnable && learnable.length ? `${poke.name}が覚える技のみ` : `${poke.name}の技データなし・全技表示`) : null;
        showGojuonModal('moves', (selected) => {
          poke.moves[moveIdx] = selected;
          renderMyParty();
          updateCalculator();
        }, moveList, suffix);
      });
    });
    
    if (pokemonDB[poke.name]) {
        updateStats();
    } else if (poke.name) {
        // data already preloaded; nothing to do
    }
    
    container.appendChild(clone);
  });
}

function renderEnemyParty() {
  const container = document.getElementById("enemy-party-container");
  container.innerHTML = "";
  const tmpl = document.getElementById("enemy-slot-template");
  
  enemyParty.forEach((poke, idx) => {
    const clone = tmpl.content.cloneNode(true);
    const slot = clone.querySelector(".enemy-slot");
    if (activeEnemyIndex === idx) slot.classList.add("active-battle");
    
    const btn = clone.querySelector(".battle-btn");
    btn.onclick = () => {
      activeEnemyIndex = idx;
      setDirection('def');
      selectedMoveIndex = null;
      renderEnemyParty();
      if(activeEnemyIndex !== null) showEnemySuggestions(enemyParty[activeEnemyIndex].name);
      updateCalculator();
    };
    
    const nameInput = clone.querySelector(".poke-name-input");
    updatePokeIcon(clone.querySelector('.poke-icon'), poke.name);
    const enemyMegaIconEl = clone.querySelector('.mega-icon');
    renderMegaIcon(enemyMegaIconEl, poke);
    if (enemyMegaIconEl) {
      enemyMegaIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleMegaForm(poke);
        renderEnemyParty();
        updateCalculator();
      };
    }
    const enemyFormChangeIconEl = clone.querySelector('.form-change-icon');
    renderFormChangeIcon(enemyFormChangeIconEl, poke);
    if (enemyFormChangeIconEl) {
      enemyFormChangeIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleFormChange(poke);
        renderEnemyParty();
        updateCalculator();
      };
    }
    nameInput.value = poke.name;
    nameInput.readOnly = true;
    nameInput.addEventListener('click', () => {
      showGojuonModal('pokemons', async (selected) => {
        poke.name = selected;
        if(selected) {
          try {
            const det = pokemonDB[selected] || null;
            if(det) pokemonDB[selected] = det;
          } catch(e){}
        }
        if (selected) {
          const possible = abilitiesByPokemon[selected];
          poke.ability = (possible && possible.length) ? possible[0] : '';
        }
        if(activeEnemyIndex === idx) showEnemySuggestions(selected);
        updateCalculator();
        renderEnemyParty();
      });
    });
    
    // 技凥の入力
    const moveInputs = clone.querySelectorAll(".move-input");
    moveInputs.forEach((mInput, moveIdx) => {
      mInput.value = poke.moves?.[moveIdx] || '';
      const iconEl = clone.querySelector(`.move-type-icon[data-move-idx="${moveIdx}"]`);
      updateMoveTypeIcon(iconEl, poke.moves?.[moveIdx]);
      mInput.addEventListener('click', () => {
        const learnable = poke.name ? learnsetDB[poke.name] : null;
        const moveList = (learnable && learnable.length) ? learnable : listsDB.moves;
        const suffix = poke.name ? (learnable && learnable.length ? `${poke.name}が覚える技のみ` : `${poke.name}の技データなし・全技表示`) : null;
        showGojuonModal('moves', (selected) => {
          if(!poke.moves) poke.moves = ["","","",""];
          poke.moves[moveIdx] = selected;
          renderEnemyParty();
          updateCalculator();
        }, moveList, suffix);
      });
    });
    
    // 種族値表示
    const bsH = clone.querySelector('.bs-h');
    const bsA = clone.querySelector('.bs-a');
    const bsB = clone.querySelector('.bs-b');
    const bsC = clone.querySelector('.bs-c');
    const bsD = clone.querySelector('.bs-d');
    const bsS = clone.querySelector('.bs-s');
    
    if(pokemonDB[poke.name]) {
      const bs = pokemonDB[poke.name].stats;
      if(bsH) bsH.textContent = bs.hp || '-';
      if(bsA) bsA.textContent = bs.attack || '-';
      if(bsB) bsB.textContent = bs.defense || '-';
      if(bsC) bsC.textContent = bs['special-attack'] || '-';
      if(bsD) bsD.textContent = bs['special-defense'] || '-';
      if(bsS) bsS.textContent = bs.speed || '-';
    }

    // 持ち物入力
    const itemInput = clone.querySelector(".poke-item-input");
    if (itemInput) {
      itemInput.value = poke.item || '';
      if (STAT_BOOST_ITEMS.includes(poke.item) || TYPE_BOOST_ITEMS[poke.item]) {
        itemInput.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        itemInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        itemInput.style.color = '#fca5a5';
      } else {
        itemInput.style.backgroundColor = '';
        itemInput.style.borderColor = '';
        itemInput.style.color = '';
      }
      itemInput.addEventListener('click', () => {
        showGojuonModal('items', (selected) => {
          poke.item = selected;
          renderEnemyParty();
          updateCalculator();
        });
      });
    }

    // 特性入力
    const enemyAbiInput = clone.querySelector(".poke-ability-input");
    if (enemyAbiInput) {
      enemyAbiInput.value = poke.ability || '';
      enemyAbiInput.onclick = () => {
        const possible = poke.name ? abilitiesByPokemon[poke.name] : null;
        const abilityList = (possible && possible.length) ? possible : listsDB.abilities;
        const suffix = poke.name ? (possible && possible.length ? `${poke.name}が持てる特性のみ` : `${poke.name}の特性データなし・全特性表示`) : null;
        showGojuonModal('abilities', (val) => {
          poke.ability = val;
          renderEnemyParty();
          updateCalculator();
        }, abilityList, suffix);
      };
    }

    // 性格入力
    const natureInput = clone.querySelector(".poke-nature-input");
    if (natureInput) {
      natureInput.value = poke.nature || '';
      natureInput.addEventListener('click', () => {
        showGojuonModal('natures', (selected) => {
          poke.nature = selected;
          renderEnemyParty();
          updateCalculator();
        });
      });
    }

    const updateStats = () => {
      const pData = pokemonDB[poke.name];
      if (!pData) return;
      const bs = pData.stats;
      const enIsActive = (typeof idx !== 'undefined' && activeEnemyIndex === idx);
      const enR = enIsActive ? enemyRanks : {h:0,a:0,b:0,c:0,d:0,s:0};
      slot.querySelector('.rv-h').textContent = applyRankToDisplay(calcRealStatWithItem(bs.hp, poke.evs.h, 'hp', poke.nature, poke.item), enR.h);
      slot.querySelector('.rv-a').textContent = applyRankToDisplay(calcRealStatWithItem(bs.attack, poke.evs.a, 'attack', poke.nature, poke.item), enR.a);
      const enWeatherDefMult = getWeatherDefMult(pData.types || [], 'b');
      const enRawDef = applyRankToDisplay(calcRealStatWithItem(bs.defense, poke.evs.b, 'defense', poke.nature, poke.item), enR.b);
      slot.querySelector('.rv-b').textContent = typeof enRawDef === 'number' ? Math.floor(enRawDef * enWeatherDefMult) : enRawDef;
      slot.querySelector('.rv-c').textContent = applyRankToDisplay(calcRealStatWithItem(bs['special-attack'], poke.evs.c, 'special-attack', poke.nature, poke.item), enR.c);
      const enWeatherSpDefMult = getWeatherDefMult(pData.types || [], 'd');
      const enRawSpDef = applyRankToDisplay(calcRealStatWithItem(bs['special-defense'], poke.evs.d, 'special-defense', poke.nature, poke.item), enR.d);
      slot.querySelector('.rv-d').textContent = typeof enRawSpDef === 'number' ? Math.floor(enRawSpDef * enWeatherSpDefMult) : enRawSpDef;
      const enWeatherSpeedMult = enIsActive ? (getWeatherSpeedMult(poke.ability) * (enemyTailwind ? 2.0 : 1.0)) : 1.0;
      const enRawSpeed = applyRankToDisplay(calcRealStatWithItem(bs.speed, poke.evs.s, 'speed', poke.nature, poke.item), enR.s);
      slot.querySelector('.rv-s').textContent = typeof enRawSpeed === 'number' ? Math.floor(enRawSpeed * enWeatherSpeedMult) : enRawSpeed;
    };

    const CHAMPIONS_TOTAL_EV_CAP = 66;
    const evTotalLabel = clone.querySelector('.ev-total-label');
    const refreshEvTotal = () => {
      const total = ['h','a','b','c','d','s'].reduce((sum, k) => sum + (poke.evs[k] || 0), 0);
      if (evTotalLabel) {
        evTotalLabel.textContent = `努力値 ${total}/${CHAMPIONS_TOTAL_EV_CAP}`;
        evTotalLabel.style.color = total > CHAMPIONS_TOTAL_EV_CAP ? '#ef4444' : (total === CHAMPIONS_TOTAL_EV_CAP ? '#4ade80' : '#a0a0b0');
      }
    };

    ['h','a','b','c','d','s'].forEach(st => {
      const wheelEl = clone.querySelector(`.ev-wheel[data-stat="${st}"]`);
      if (!wheelEl) return;

      const applyValue = (rawV) => {
        let v = Math.max(0, Math.min(32, rawV));
        const otherTotal = ['h','a','b','c','d','s'].filter(k => k !== st).reduce((sum, k) => sum + (poke.evs[k] || 0), 0);
        const remaining = Math.max(0, CHAMPIONS_TOTAL_EV_CAP - otherTotal);
        if (v > remaining) v = remaining;
        poke.evs[st] = v;
        refreshEvTotal();
        updateStats();
        updateCalculator();
        return v;
      };

      const picker = createEvPicker(wheelEl, poke.evs[st] || 0, (v) => {
        const clamped = applyValue(v);
        if (clamped !== v) picker.setValue(clamped);
      });
    });
    refreshEvTotal();
    if (pokemonDB[poke.name]) updateStats();

    // タイプ表示
    if(pokemonDB[poke.name]) {
      const typesEl = clone.querySelector('.enemy-types');
      if(typesEl) {
        typesEl.innerHTML = pokemonDB[poke.name].types.map(t => {
          const typeJa = TYPE_EN_TO_JA[t] || t;
          return typeIconHtml(typeJa, 18);
        }).join('');
      }
    }
    
    container.appendChild(clone);
  });
}

// Modal functionality
let listsDB = { pokemons: [], moves: [], items: [], natures: [] };
let activeModalCallback = null;



const TYPE_EFFECTIVENESS = {
  normal: { weak: ['fighting'], resist: [], immune: ['ghost'] },
  fire: { weak: ['water', 'ground', 'rock'], resist: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'], immune: [] },
  water: { weak: ['electric', 'grass'], resist: ['fire', 'water', 'ice', 'steel'], immune: [] },
  electric: { weak: ['ground'], resist: ['electric', 'flying', 'steel'], immune: [] },
  grass: { weak: ['fire', 'ice', 'poison', 'flying', 'bug'], resist: ['water', 'electric', 'grass', 'ground'], immune: [] },
  ice: { weak: ['fire', 'fighting', 'rock', 'steel'], resist: ['ice'], immune: [] },
  fighting: { weak: ['flying', 'psychic', 'fairy'], resist: ['bug', 'rock', 'dark'], immune: [] },
  poison: { weak: ['ground', 'psychic'], resist: ['grass', 'fighting', 'poison', 'bug', 'fairy'], immune: [] },
  ground: { weak: ['water', 'grass', 'ice'], resist: ['poison', 'rock'], immune: ['electric'] },
  flying: { weak: ['electric', 'ice', 'rock'], resist: ['grass', 'fighting', 'bug'], immune: ['ground'] },
  psychic: { weak: ['bug', 'ghost', 'dark'], resist: ['fighting', 'psychic'], immune: [] },
  bug: { weak: ['fire', 'flying', 'rock'], resist: ['grass', 'fighting', 'ground'], immune: [] },
  rock: { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], resist: ['normal', 'fire', 'poison', 'flying'], immune: [] },
  ghost: { weak: ['ghost', 'dark'], resist: ['poison', 'bug'], immune: ['normal', 'fighting'] },
  dragon: { weak: ['ice', 'dragon', 'fairy'], resist: ['fire', 'water', 'electric', 'grass'], immune: [] },
  dark: { weak: ['fighting', 'bug', 'fairy'], resist: ['ghost', 'dark'], immune: ['psychic'] },
  steel: { weak: ['fire', 'fighting', 'ground'], resist: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], immune: ['poison'] },
  fairy: { weak: ['poison', 'steel'], resist: ['fighting', 'bug', 'dark'], immune: ['dragon'] }
};

function getDefensiveMultipliers(defTypesEn) {
  const multipliers = {};
  Object.keys(TYPE_EN_TO_JA).forEach(atkType => {
    let mult = 1.0;
    defTypesEn.forEach(defType => {
      const eff = TYPE_EFFECTIVENESS[defType];
      if (!eff) return;
      if (eff.weak.includes(atkType)) mult *= 2;
      if (eff.resist.includes(atkType)) mult *= 0.5;
      if (eff.immune.includes(atkType)) mult = 0;
    });
    multipliers[atkType] = mult;
  });
  return multipliers;
}

function renderTypeMatchups(typesEn) {
  if(!typesEn || typesEn.length === 0) return '';
  const mults = getDefensiveMultipliers(typesEn);
  const groups = { 'x4': [], 'x2': [], 'x0.5': [], 'x0.25': [], 'x0': [] };
  Object.keys(mults).forEach(typeEn => {
    const val = mults[typeEn];
    const typeJa = TYPE_EN_TO_JA[typeEn];
    if (val === 4) groups['x4'].push(typeJa);
    else if (val === 2) groups['x2'].push(typeJa);
    else if (val === 0.5) groups['x0.5'].push(typeJa);
    else if (val === 0.25) groups['x0.25'].push(typeJa);
    else if (val === 0) groups['x0'].push(typeJa);
  });
  
  let html = `<div style="font-size:0.65rem; text-align:left; background:rgba(0,0,0,0.2); padding:0.2rem 0.4rem; border-radius:4px; line-height:1.2;">`;
  let hasAny = false;
  ['x4', 'x2', 'x0.5', 'x0.25', 'x0'].forEach(m => {
    if (groups[m].length > 0) {
      hasAny = true;
      const icons = groups[m].map(t => typeIconHtml(t, 16)).join(' ');
      html += `<div style="margin: 0.15rem 0; display:flex; align-items:center; gap:0.3rem;"><span style="color:${m==='x4'||m==='x2'?'#ef4444':(m==='x0'?'#9ca3af':'#3b82f6')}; font-weight:bold; width:32px; display:inline-block; flex-shrink:0;">${m}:</span> <span style="display:flex; gap:0.2rem; flex-wrap:wrap;">${icons}</span></div>`;
    }
  });
  html += `</div>`;
  return hasAny ? html : `<div style="font-size:0.65rem; text-align:left; background:rgba(0,0,0,0.2); padding:0.2rem 0.4rem; border-radius:4px;">弱点等なし</div>`;
}

// 指定タイプの小さいアイコン(img)のHTMLを生成する共通ヘルパー
function typeIconHtml(typeJa, size) {
  const s = size || 16;
  const path = TYPE_ICON_PATH[typeJa];
  if (!path) return '';
  return `<img src="${path}" title="${typeJa}" alt="${typeJa}" style="width:${s}px; height:${s}px; border-radius:4px; vertical-align:middle; flex-shrink:0;">`;
}

const GOJUON_ROWS = [
  { id: 'a', label: 'ア' }, { id: 'ka', label: 'カ' }, { id: 'sa', label: 'サ' },
  { id: 'ta', label: 'タ' }, { id: 'na', label: 'ナ' }, { id: 'ha', label: 'ハ' },
  { id: 'ma', label: 'マ' }, { id: 'ya', label: 'ヤ' }, { id: 'ra', label: 'ラ' },
  { id: 'wa', label: 'ワ' }, { id: 'other', label: '他' }
];

const ITEM_CATEGORY_ROWS = [
  { id: 'other', label: 'もちもの' },
  { id: 'berry', label: 'きのみ' },
  { id: 'mega', label: 'メガストーン' },
  { id: 'search', label: '全部' }
];

const NATURE_MATRIX = [
  { down: "攻撃↓", row: ["がんばりや", "ずぶとい", "ひかえめ", "おだやか", "おくびょう"] },
  { down: "防御↓", row: ["さみしがり", "きまぐれ", "おっとり", "おとなしい", "せっかち"] },
  { down: "特攻↓", row: ["いじっぱり", "わんぱく", "まじめ", "しんちょう", "ようき"] },
  { down: "特防↓", row: ["やんちゃ", "のうてんき", "うっかりや", "てれや", "むじゃき"] },
  { down: "早さ↓", row: ["ゆうかん", "のんき", "れいせい", "なまいき", "すなお"] }
];
const NATURE_COLUMNS = ["", "攻撃↑", "防御↑", "特攻↑", "特防↑", "早さ↑"];

function getGojuonStr(char) {
  if (!char) return 'other';
  const c = char.charCodeAt(0);
  if ((c >= 0x3041 && c <= 0x304A) || (c >= 0x30A1 && c <= 0x30AA)) return 'a';
  if ((c >= 0x304B && c <= 0x3054) || (c >= 0x30AB && c <= 0x30B4) || char==='ガ'||char==='ギ'||char==='グ'||char==='ゲ'||char==='ゴ') return 'ka';
  if ((c >= 0x3055 && c <= 0x305E) || (c >= 0x30B5 && c <= 0x30BE) || char==='ザ'||char==='ジ'||char==='ズ'||char==='ゼ'||char==='ゾ') return 'sa';
  if ((c >= 0x305F && c <= 0x3069) || (c >= 0x30BF && c <= 0x30C9) || char==='ダ'||char==='ヂ'||char==='ヅ'||char==='デ'||char==='ド') return 'ta';
  if ((c >= 0x306A && c <= 0x306E) || (c >= 0x30CA && c <= 0x30CE)) return 'na';
  if ((c >= 0x306F && c <= 0x307D) || (c >= 0x30CF && c <= 0x30DD) || char==='バ'||char==='ビ'||char==='ブ'||char==='ベ'||char==='ボ'||char==='パ'||char==='ピ'||char==='プ'||char==='ペ'||char==='ポ') return 'ha';
  if ((c >= 0x307E && c <= 0x3082) || (c >= 0x30DE && c <= 0x30E2)) return 'ma';
  if ((c >= 0x3083 && c <= 0x3088) || (c >= 0x30E3 && c <= 0x30E8)) return 'ya';
  if ((c >= 0x3089 && c <= 0x308D) || (c >= 0x30E9 && c <= 0x30ED)) return 'ra';
  if ((c >= 0x308E && c <= 0x3093) || (c >= 0x30EE && c <= 0x30F3)) return 'wa';
  return 'other';
}

function showGojuonModal(modalType, callback, overrideList, titleSuffix) {
  activeModalCallback = callback;
  const modal = document.getElementById("gojuon-modal");
  const title = document.getElementById("modal-title");
  
  if(modalType === 'pokemons') title.textContent = 'ポケモンを選択 (チャンピオンズフラグ対象のみ)';
  if(modalType === 'moves') title.textContent = '技を選択' + (titleSuffix ? `（${titleSuffix}）` : '');
  if(modalType === 'items') title.textContent = '持ち物を選択';
  if(modalType === 'natures') title.textContent = '性格を選択';
  if(modalType === 'abilities') title.textContent = '特性を選択' + (titleSuffix ? `（${titleSuffix}）` : '');

  modal.style.display = 'flex';
  const searchInput = document.getElementById("modal-search");
  searchInput.value = "";
  
  const currentList = overrideList || listsDB[modalType] || [];
  const tabsContainer = document.getElementById("modal-tabs");
  
  if (modalType === 'natures') {
    tabsContainer.style.display = 'none';
    searchInput.style.display = 'none';
    renderNatureMatrix();
    
    document.getElementById("modal-close-btn").onclick = () => {
      modal.style.display = 'none';
    };
    return;
  }
  
  tabsContainer.style.display = 'flex';
  searchInput.style.display = 'block';
  tabsContainer.innerHTML = "";

  // 技・特性・ポケモン選択は行タブ(あかさたな…)で区切らず、あいうえお順の単一リストで表示する
  if (modalType === 'moves' || modalType === 'abilities' || modalType === 'pokemons') {
    tabsContainer.style.display = 'none';
    renderModalList(currentList, null, "", modalType);
    searchInput.oninput = (e) => {
      renderModalList(currentList, null, e.target.value, modalType);
    };
    document.getElementById("modal-close-btn").onclick = () => {
      modal.style.display = 'none';
    };
    return;
  }
  
  let ROWS = GOJUON_ROWS;
  if (modalType === 'items') ROWS = ITEM_CATEGORY_ROWS;
  
  let activeTabId = ROWS[0].id;
  
  ROWS.forEach(row => {
    const btn = document.createElement("button");
    btn.textContent = row.label;
    btn.className = "modal-tab-btn";
    btn.style.cssText = `background:none; border:none; color:#fff; padding:1rem 0; cursor:pointer; width:100%; border-bottom:1px solid rgba(255,255,255,0.1); transition:background 0.2s; font-size: 0.9rem;`;
    if(row.id === activeTabId) btn.style.background = 'rgba(255,255,255,0.1)';
    
    btn.onclick = () => {
      document.querySelectorAll(".modal-tab-btn").forEach(b => b.style.background = 'none');
      btn.style.background = 'rgba(255,255,255,0.1)';
      renderModalList(currentList, row.id, "", modalType);
    };
    tabsContainer.appendChild(btn);
  });
  
  renderModalList(currentList, activeTabId, "", modalType);
  
  searchInput.oninput = (e) => {
    renderModalList(currentList, null, e.target.value, modalType);
  };
  
  document.getElementById("modal-close-btn").onclick = () => {
    modal.style.display = 'none';
  };
}

// ひらがな・カタカナの違いを無視して検索できるようにする（例:「ようせいのはね」で「ようせいのハネ」がヒットする）
function normalizeKana(str) {
  if (!str) return "";
  return str.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function renderModalList(fullList, filterId, searchQuery, modalType) {
  const container = document.getElementById("modal-list");
  container.innerHTML = "";
  container.style.display = "grid";
  let filtered = fullList;
  const normQuery = normalizeKana(searchQuery);
  
  if (modalType === 'items') {
    if (searchQuery) {
      filtered = filtered.filter(item => normalizeKana(item.name).includes(normQuery));
    } else if (filterId && filterId !== 'search') {
      filtered = filtered.filter(item => item.category === filterId);
    }

    if (!searchQuery) {
      const noneBtn = createModalButton('なし', null);
      noneBtn.onclick = () => {
        document.getElementById("gojuon-modal").style.display = 'none';
        if (activeModalCallback) activeModalCallback('');
      };
      container.appendChild(noneBtn);
    }

    filtered.forEach(item => {
      let iconUrl = itemIconLocalMap[item.name] || null;
      if (!iconUrl) {
        const enId = itemIconMap[item.name];
        if (enId && enId.startsWith('serebii:')) {
          iconUrl = `https://www.serebii.net/itemdex/sprites/${enId.slice(8)}.png`;
        } else if (enId && enId.startsWith('bulba:')) {
          iconUrl = toStableArchiveUrl(enId.slice(6));
        } else if (enId) {
          iconUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${enId}.png`;
        }
      }
      const btn = createModalButton(item.name, iconUrl);
      container.appendChild(btn);
    });
  } else {
    if (searchQuery) {
      filtered = filtered.filter(item => normalizeKana(item).includes(normQuery));
    } else if (filterId) {
      filtered = filtered.filter(item => getGojuonStr(item) === filterId);
    }
    if (modalType === 'moves' || modalType === 'abilities' || modalType === 'pokemons') {
      filtered = [...filtered].sort((a, b) => a.localeCompare(b, 'ja'));
    }
    
    filtered.forEach(item => {
      let iconUrl = null;
      if (modalType === 'pokemons') {
        const pData = pokemonDB[item];
        iconUrl = getPokemonIconUrl(item, pData);
      } else if (modalType === 'moves') {
        const mData = movesDetail[item];
        if (mData) {
          const typeJa = TYPE_EN_TO_JA[mData.type] || mData.type || '';
          iconUrl = TYPE_ICON_PATH[typeJa] || null;
        }
      }
      const btn = createModalButton(item, iconUrl);
      container.appendChild(btn);
    });
  }
}

function createModalButton(text, iconUrl) {
  const btn = document.createElement("button");
  btn.style.cssText = `background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:0.6rem 0.8rem; border-radius:8px; cursor:pointer; text-align:left; transition:background 0.2s; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem;`;
  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "";
    img.style.cssText = `width:28px; height:28px; object-fit:contain; flex-shrink:0;`;
    img.onerror = () => { img.style.display = 'none'; };
    btn.appendChild(img);
  }
  const label = document.createElement("span");
  label.textContent = text;
  btn.appendChild(label);
  btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.15)';
  btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.05)';
  
  btn.onclick = () => {
    document.getElementById("gojuon-modal").style.display = 'none';
    if(activeModalCallback) activeModalCallback(text);
  };
  return btn;
}

function renderNatureMatrix() {
  const container = document.getElementById("modal-list");
  container.innerHTML = "";
  container.style.display = "block"; 
  
  let html = `<table style="width:100%; border-collapse:collapse; text-align:center; color:#fff; font-size:1.1rem; line-height:2.2;">`;
  html += `<tr>`;
  NATURE_COLUMNS.forEach(c => {
    html += `<th style="border:1px solid rgba(255,255,255,0.3); padding:0.5rem; background:rgba(255,255,255,0.1);">${c}</th>`;
  });
  html += `</tr>`;
  
  NATURE_MATRIX.forEach(r => {
    html += `<tr>`;
    html += `<th style="border:1px solid rgba(255,255,255,0.3); padding:0.5rem; background:rgba(255,255,255,0.1);">${r.down}</th>`;
    r.row.forEach((nature) => {
      const isNeutral = ['がんばりや', 'きまぐれ', 'まじめ', 'てれや', 'すなお'].includes(nature);
      const color = isNeutral ? '#fff' : '#0ff';
      const bg = isNeutral ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
      
      html += `<td class="nature-cell" data-nature="${nature}" style="border:1px solid rgba(255,255,255,0.3); padding:0.5rem; background:${bg}; color:${color}; cursor:pointer; transition:background 0.2s;">${nature}</td>`;
    });
    html += `</tr>`;
  });
  html += `</table>`;
  
  container.innerHTML = html;
  
  container.querySelectorAll('.nature-cell').forEach(td => {
    td.onmouseenter = () => td.style.background = 'rgba(255,255,255,0.3)';
    td.onmouseleave = () => {
      const n = td.getAttribute('data-nature');
      td.style.background = ['がんばりや', 'きまぐれ', 'まじめ', 'てれや', 'すなお'].includes(n) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
    };
    td.onclick = () => {
      document.getElementById("gojuon-modal").style.display = 'none';
      if(activeModalCallback) activeModalCallback(td.getAttribute('data-nature'));
    };
  });
}

function showEnemySuggestions(name) {
  const content = document.getElementById("suggestion-content");
  let lookupName = name;
  if (name && !rankingDB[lookupName]) {
    // メガシンカ/フォルムチェンジ後の名前でデータが無い場合は元の種族のデータを表示し続ける
    const megaBase = getMegaBaseName(name);
    if (rankingDB[megaBase]) lookupName = megaBase;
    else {
      const formBase = getFormChangeBaseName(name);
      if (rankingDB[formBase]) lookupName = formBase;
    }
  }
  if (!name || !rankingDB[lookupName]) {
    content.innerHTML = `<p class="empty-state">「${name||''}」の詳細データは見つかりませんでした。</p>`;
    return;
  }
  
  const data = rankingDB[lookupName];
  let html = "";
  
  const renderList = (title, items, limit, rankMode) => {
    if(!items || items.length === 0) return "";
    let res = `<div class="section-title" style="margin-top:0.8rem; font-size:0.75rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.1rem; margin-bottom:0.2rem;">${title}</div>`;
    items.slice(0, limit).forEach(i => {
      const valueLabel = rankMode ? `${i.rank}位` : i.percent;
      res += `<div class="stat-item" style="padding:0.1rem 0; font-size:0.72rem; display:flex; justify-content:space-between;"><span class="stat-name">${i.name}</span><span class="stat-perc" style="color:var(--accent-color);">${valueLabel}</span></div>`;
    });
    return res;
  };

  html += renderList("調整(努力値)", data.ev_spread, 3);
  html += renderList("特性", data.ability, 3);
  html += renderList("性格", data.nature, 3);
  html += renderList("採用技", data.moves, 5);
  html += renderList("持ち物", data.items, 5);
  html += renderList("同じチームに多いポケモン", data.partners, 5, true);
  
  content.innerHTML = html;
}

// Calculator Logic
async function updateCalculator() {
  const mySide = document.getElementById("calc-my-side");
  const enemySide = document.getElementById("calc-enemy-side");
  const resultLog = document.getElementById("damage-log");
  
  if (activeMyIndex === null || activeEnemyIndex === null) {
    resultLog.textContent = "\u81ea\u9663\u304a\u3088\u3073\u6575\u9663\u304b\u3089\u6226\u95d8\u4e2d\u306e\u30dd\u30b1\u30e2\u30f3\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
    renderCalcMoves();
    return;
  }
  
  const myPoke = myParty[activeMyIndex];
  const enemyPoke = enemyParty[activeEnemyIndex];
  
  if (!myPoke.name || !enemyPoke.name) { renderCalcMoves(); return; }
  
  if (!pokemonDB[myPoke.name]) {
    // data already preloaded
  }
  if (!pokemonDB[enemyPoke.name]) {
    // data already preloaded
  }
  
  const myData = pokemonDB[myPoke.name];
  const enData = pokemonDB[enemyPoke.name];
  if(!myData || !enData) { renderCalcMoves(); return; }
  
  // タイプは英語キーから日本語名に変換
  const myTypesJa = (myData.types || []).map(t => TYPE_EN_TO_JA[t] || t);
  const enTypesJa = (enData.types || []).map(t => TYPE_EN_TO_JA[t] || t);
  
  // VSボード
  const myIconUrl = getPokemonIconUrl(myPoke.name, myData);
  const enIconUrl = getPokemonIconUrl(enemyPoke.name, enData);

  // 素早さ比較(実数値+持ち物補正)して速い方に矢印を表示
  const myEvsForSpeed = myPoke.evs || {h:0,a:0,b:0,c:0,d:0,s:0};
  const enEvsForSpeed = enemyPoke.evs || {h:0,a:0,b:0,c:0,d:0,s:0};
  const mySpeedRaw = calcRealStatWithItem(myData.stats.speed, myEvsForSpeed.s, 'speed', myPoke.nature, myPoke.item);
  const enSpeedRaw = calcRealStatWithItem(enData.stats.speed, enEvsForSpeed.s, 'speed', enemyPoke.nature, enemyPoke.item);
  const mySpeedRanked = typeof mySpeedRaw === 'number' ? Math.floor(mySpeedRaw * getRankMult(myRanks.s || 0)) : mySpeedRaw;
  const enSpeedRanked = typeof enSpeedRaw === 'number' ? Math.floor(enSpeedRaw * getRankMult(enemyRanks.s || 0)) : enSpeedRaw;
  const myWeatherMult = getWeatherSpeedMult(myPoke.ability) * (myTailwind ? 2.0 : 1.0);
  const enWeatherMult = getWeatherSpeedMult(enemyPoke.ability) * (enemyTailwind ? 2.0 : 1.0);
  const mySpeedReal = typeof mySpeedRanked === 'number' ? Math.floor(mySpeedRanked * myWeatherMult) : mySpeedRanked;
  const enSpeedReal = typeof enSpeedRanked === 'number' ? Math.floor(enSpeedRanked * enWeatherMult) : enSpeedRanked;
  let mySpeedArrow = '', enSpeedArrow = '';
  if (typeof mySpeedReal === 'number' && typeof enSpeedReal === 'number' && mySpeedReal !== enSpeedReal) {
    const fasterStyle = `position:absolute; top:0; right:0; font-size:1.3rem; color:#4ade80; font-weight:800;`;
    const slowerStyle = `position:absolute; top:0; right:0; font-size:1.3rem; color:#6b7280; font-weight:800;`;
    if (mySpeedReal > enSpeedReal) {
      mySpeedArrow = `<span style="${fasterStyle}">↑</span>`;
      enSpeedArrow = `<span style="${slowerStyle}">↓</span>`;
    } else {
      mySpeedArrow = `<span style="${slowerStyle}">↓</span>`;
      enSpeedArrow = `<span style="${fasterStyle}">↑</span>`;
    }
  }

  mySide.innerHTML = `
    <div style="position:relative; display:inline-block;">
      <img src="${myIconUrl}" alt="" style="width:110px; height:110px; object-fit:contain; display:block; margin:0 auto;" onerror="this.style.display='none';">
      ${mySpeedArrow}
    </div>
    <div class="vs-name" style="font-size:0.95rem; font-weight:800;">${myPoke.name}</div>
    <div class="vs-types" style="display:flex; gap:0.3rem; flex-wrap:wrap; justify-content:center;">
      ${myTypesJa.map(t => typeBadgeHTML(t)).join('')}
    </div>
  `;
  enemySide.innerHTML = `
    <div style="position:relative; display:inline-block;">
      <img src="${enIconUrl}" alt="" style="width:110px; height:110px; object-fit:contain; display:block; margin:0 auto;" onerror="this.style.display='none';">
      ${enSpeedArrow}
    </div>
    <div class="vs-name" style="font-size:0.95rem; font-weight:800;">${enemyPoke.name}</div>
    <div class="vs-types" style="display:flex; gap:0.3rem; flex-wrap:wrap; justify-content:center;">
      ${enTypesJa.map(t => typeBadgeHTML(t)).join('')}
    </div>
  `;
  
  const typeResistMy = document.getElementById("type-resist-my");
  const typeResistEnemy = document.getElementById("type-resist-enemy");
  if(typeResistMy) typeResistMy.innerHTML = renderTypeMatchups(myData.types || []);
  if(typeResistEnemy) typeResistEnemy.innerHTML = renderTypeMatchups(enData.types || []);
  
  renderCalcMoves();
  
  // 攻撃方向
  const isAtk = attackDirection === 'atk';
  const atkPoke = isAtk ? myPoke : enemyPoke;
  const defPoke = isAtk ? enemyPoke : myPoke;
  const atkData = isAtk ? myData : enData;
  const defData = isAtk ? enData : myData;
  const atkRanks = isAtk ? myRanks : enemyRanks;
  const defRanks = isAtk ? enemyRanks : myRanks;
  const atkItem = isAtk ? myPoke.item : (enemyPoke.item || '');
  const defItem = isAtk ? (enemyPoke.item || '') : myPoke.item;
  const atkTypesJa = isAtk ? myTypesJa : enTypesJa;
  
  // 自陣の努力値/性格
  const myEvsObj = myPoke.evs || {h:0,a:0,b:0,c:0,d:0,s:0};
  const myNatureStr = myPoke.nature || '';

  // 敵陣の努力値/性格 (直接入力)
  const enEvsObj = enemyPoke.evs || {h:0,a:0,b:0,c:0,d:0,s:0};
  const enNatureStr = enemyPoke.nature || '';

  // 敵陣の攻撃時は、攻撃努力値・補正が不明なため現状は無振り扱いとする
  const atkEvs = isAtk ? myEvsObj : enEvsObj;
  const defEvs = isAtk ? enEvsObj : myEvsObj;
  const atkNature = isAtk ? myNatureStr : enNatureStr;
  const defNature = isAtk ? enNatureStr : myNatureStr;
  
  if(selectedMoveIndex === null) {
    resultLog.textContent = "技ボタンを選択するとダメージ計算を行います。";
    document.getElementById("damage-bar-remain").style.width = '0%';
    document.getElementById("damage-marker-min").style.display = 'none';
    document.getElementById("damage-marker-max").style.display = 'none';
    document.querySelector(".dmg-percent").textContent = "--% ~ --%";
    document.querySelector(".dmg-rolls").textContent = "\u78ba--\u767a";
    return;
  }
  
  const moveName = atkPoke.moves?.[selectedMoveIndex];
  if(!moveName) { resultLog.textContent = "\u6280\u30dc\u30bf\u30f3\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002"; return; }
  
  // 技データ
  const mData = movesDetail[moveName];
  const dmgClass = mData?.damage_class || 'physical';
  let movePower = mData?.power || null;
  let moveTypeEn = mData?.type || null;
  // ウェザーボール: 天候によってタイプが変化し、威力も2倍(通常時のみ50)になる
  if (moveName === 'ウェザーボール' && currentWeather !== 'none') {
    const WEATHER_BALL_TYPE = { sun: 'fire', rain: 'water', sand: 'rock', snow: 'ice' };
    moveTypeEn = WEATHER_BALL_TYPE[currentWeather] || moveTypeEn;
    movePower = 100;
  }
  const moveTypeJa = moveTypeEn ? (TYPE_EN_TO_JA[moveTypeEn] || moveTypeEn) : null;
  
  if(dmgClass === 'status') {
    resultLog.innerHTML = `<span style="color:#94a3b8;">「${moveName}」は変化技のためダメージはありません。</span>`;
    document.getElementById("damage-bar-remain").style.width = '100%';
    document.getElementById("damage-bar-remain").style.background = '#22c55e';
    document.getElementById("damage-marker-min").style.display = 'none';
    document.getElementById("damage-marker-max").style.display = 'none';
    document.querySelector(".dmg-percent").textContent = "---";
    document.querySelector(".dmg-rolls").textContent = "変化技";
    return;
  }
  if(!movePower) {
    resultLog.innerHTML = `<span style="color:#94a3b8;">「${moveName}」の威力データが見つかりません。可変威力技の可能性があります。</span>`;
    document.getElementById("damage-bar-remain").style.width = '0%';
    document.getElementById("damage-marker-min").style.display = 'none';
    document.getElementById("damage-marker-max").style.display = 'none';
    document.querySelector(".dmg-percent").textContent = "---";
    return;
  }
  
  const isSpecial = dmgClass === 'special';
  
  // 実数値 (能力を直接引き上げる持ち物も反映)
  const atkStatBase = isSpecial
    ? calcRealStatWithItem(atkData.stats['special-attack'], atkEvs.c||0, 'special-attack', atkNature, atkItem)
    : calcRealStatWithItem(atkData.stats.attack, atkEvs.a||0, 'attack', atkNature, atkItem);
  const defStatBase = isSpecial
    ? calcRealStatWithItem(defData.stats['special-defense'], defEvs.d||0, 'special-defense', defNature, defItem)
    : calcRealStatWithItem(defData.stats.defense, defEvs.b||0, 'defense', defNature, defItem);
  const defHp = calcRealStat(defData.stats.hp, defEvs.h||0, 'hp', '');
  const weatherDefMult = getWeatherDefMult(defData.types || [], isSpecial ? 'd' : 'b');
  if (weatherDefMult !== 1.0) notes.push(`天候(耐久)×${weatherDefMult}`);

  // ランク補正
  const atkStatRanked = Math.floor(atkStatBase * getRankMult(isSpecial ? atkRanks.c : atkRanks.a));
  const defStatRanked = Math.floor(defStatBase * getRankMult(isSpecial ? defRanks.d : defRanks.b));
  
  // \u6301\u3061\u7269\u88dc\u6b63(\u653b\u6483\u5074)
  const notes = [];
  let atkMult = 1.0;
  if(atkItem === 'こだわりハチマキ' && !isSpecial) { atkMult = 1.5; notes.push('ハチマキ×1.5'); }
  if(atkItem === 'こだわりメガネ' && isSpecial)  { atkMult = 1.5; notes.push('メガネ×1.5'); }
  if(atkItem === 'いのちのたま')                     { atkMult = 1.3; notes.push('いのちのたま×1.3'); }
  if(atkItem === 'パンチグローブ' && !isSpecial){ atkMult = 1.1; notes.push('パンチグローブ×1.1'); }
  if(TYPE_BOOST_ITEMS[atkItem] === moveTypeJa)     { atkMult *= 1.2; notes.push(atkItem + "×1.2"); }
  // すなのちから: すなあらし中、いわ/じめん/はがね技の威力+30%
  if(currentWeather === 'sand' && atkPoke.ability === 'すなのちから' && ['rock','ground','steel'].includes(moveTypeEn)) {
    atkMult *= 1.3; notes.push('すなのちから×1.3');
  }
  // ソーラーパワー: 晴れの間、とくこうが1.5倍(特殊技のみダメージに反映)
  if(currentWeather === 'sun' && atkPoke.ability === 'ソーラーパワー' && isSpecial) {
    atkMult *= 1.5; notes.push('ソーラーパワー×1.5');
  }
  
  // 持ち物(防御側)
  let defMult = 1.0;
  if(defItem === 'とつげきチョッキ' && isSpecial) { defMult = 1.5; notes.push('チョッキ特防×1.5'); }
  if(defItem === '\u3057\u3093\u304b\u306e\u304d\u305b\u304d')                   { defMult = 1.5; notes.push('\u3057\u3093\u304b\u306e\u304d\u305b\u304d\xd71.5'); }
  
  // STAB
  const hasStab = moveTypeJa && atkTypesJa.includes(moveTypeJa);
  if(hasStab) notes.push('STAB\xd71.5');
  const stabMult = hasStab ? 1.5 : 1.0;

  // タイプ相性
  let typeMult = 1.0;
  if (moveTypeEn) {
    const mults = getDefensiveMultipliers(defData.types || []);
    typeMult = mults[moveTypeEn] !== undefined ? mults[moveTypeEn] : 1.0;
  }
  const weatherTypeMult = moveTypeEn ? getWeatherTypeMult(moveTypeEn) : 1.0;
  if (weatherTypeMult !== 1.0) {
    typeMult *= weatherTypeMult;
    notes.push(`天候補正×${weatherTypeMult}`);
  }
  if (typeMult > 1.0) notes.push(`効果絶大×${typeMult}`);
  if (typeMult < 1.0 && typeMult > 0) notes.push(`今ひとつ×${typeMult}`);
  if (typeMult === 0) notes.push('効果なし×0');

  const finalAtk = Math.floor(atkStatRanked * atkMult);
  const finalDef = Math.floor(defStatRanked * defMult * weatherDefMult);

  // 急所用の実数値 (攻撃側の下降ランク・防御側の上昇ランクは無視)
  const atkStatCrit = Math.floor(atkStatBase * getRankMult(Math.max(0, isSpecial ? atkRanks.c : atkRanks.a)));
  const defStatCrit = Math.floor(defStatBase * getRankMult(Math.min(0, isSpecial ? defRanks.d : defRanks.b)));
  const finalAtkCrit = Math.floor(atkStatCrit * atkMult);
  const finalDefCrit = Math.floor(defStatCrit * defMult);

  // 複数回攻撃技のデータ (固定回数・同威力/固定回数・威力変化/2〜5回のランダム回数)
  const MULTI_HIT_FIXED = {
    'ダブルニードル': 2, 'にどげり': 2, 'ダブルウイング': 2, 'ドラゴンアロー': 2,
    'すいりゅうれんだ': 3
  };
  const MULTI_HIT_INCREASING = {
    'トリプルアクセル': [20, 40, 60],
    'トリプルキック': [10, 20, 30]
  };
  const MULTI_HIT_VARIABLE = new Set([
    'タネマシンガン', 'ロックブラスト', 'れんぞくぎり', 'みだれひっかき',
    'ボーンラッシュ', 'ミサイルばり', 'こなゆき', 'スケイルショット'
  ]);

  let perHitPowers = [movePower];
  let hitCountNote = '';
  let maxSelectableHits = 1;
  if (MULTI_HIT_INCREASING[moveName]) {
    maxSelectableHits = MULTI_HIT_INCREASING[moveName].length;
    const chosen = (manualHitCount && manualHitCount <= maxSelectableHits) ? manualHitCount : maxSelectableHits;
    perHitPowers = MULTI_HIT_INCREASING[moveName].slice(0, chosen);
    hitCountNote = `${perHitPowers.length}回攻撃(威力${MULTI_HIT_INCREASING[moveName].join('/')})`;
  } else if (MULTI_HIT_FIXED[moveName]) {
    maxSelectableHits = MULTI_HIT_FIXED[moveName];
    const chosen = (manualHitCount && manualHitCount <= maxSelectableHits) ? manualHitCount : maxSelectableHits;
    perHitPowers = Array(chosen).fill(movePower);
    hitCountNote = `${chosen}回攻撃(1発威力${movePower})`;
  } else if (MULTI_HIT_VARIABLE.has(moveName)) {
    maxSelectableHits = 5;
    const chosen = manualHitCount || 2;
    perHitPowers = Array(chosen).fill(movePower);
    hitCountNote = `${chosen}回攻撃(1発威力${movePower}、実際は2〜5回でランダム)`;
  }
  const isMultiHit = maxSelectableHits > 1;
  renderHitCountSelector(moveName, maxSelectableHits, isMultiHit ? perHitPowers.length : 1);

  // 1回分のダメージ乱数(16段階)を計算する関数(通常/急所共通)
  const rollsForPower = (power, atkVal, defVal, critMult) => {
    const bd = Math.floor(Math.floor(Math.floor(22 * power * atkVal / defVal) / 50) + 2);
    const bdCrit = critMult ? Math.floor(bd * critMult) : bd;
    return Array.from({length:16}, (_,k) => {
      const rolled = Math.floor(bdCrit * (85+k) / 100);
      const stabbed = Math.floor(rolled * stabMult);
      return Math.floor(stabbed * typeMult);
    });
  };


  // 通常ダメージ: 各撃の乱数を独立計算して合算
  const perHitRollsNormal = perHitPowers.map(p => rollsForPower(p, finalAtk, finalDef, null));
  const rolls = Array.from({length:16}, (_,k) => perHitRollsNormal.reduce((s, r) => s + r[k], 0));
  // 急所ダメージ: 同様に各撃で計算(×1.5)して合算
  const perHitRollsCrit = perHitPowers.map(p => rollsForPower(p, finalAtkCrit, finalDefCrit, 1.5));
  const critRolls = Array.from({length:16}, (_,k) => perHitRollsCrit.reduce((s, r) => s + r[k], 0));

  // 1撃分の表示用範囲(多段技の場合のみ使う、全撃同威力の場合は1本目を代表として使用)
  const perHitMin = perHitRollsNormal[0][0];
  const perHitMax = perHitRollsNormal[0][15];
  const perHitMinPct = Math.floor(perHitMin / defHp * 1000) / 10;
  const perHitMaxPct = Math.floor(perHitMax / defHp * 1000) / 10;

  const minDmg = rolls[0];
  const maxDmg = rolls[15];
  const minPct = Math.floor(minDmg / defHp * 1000) / 10;
  const maxPct = Math.floor(maxDmg / defHp * 1000) / 10;
  
  const ohkoCount = rolls.filter(r => r >= defHp).length;
  let killText = '';
  if(ohkoCount === 16)       killText = '確1発';
  else if(ohkoCount > 0)     killText = `乱数1発 (${Math.round(ohkoCount/16*1000)/10}%)`;
  else if(minDmg*2 >= defHp) killText = '確2発';
  else if(maxDmg*2 >= defHp) killText = '乱数2発';
  else                       killText = '確3発以上';
  
  const minHpPct = Math.max(0, 100 - maxPct);
  const maxHpPct = Math.max(0, 100 - minPct);
  
  const remainBar = document.getElementById("damage-bar-remain");
  remainBar.style.width = `${maxHpPct}%`;
  if (maxHpPct >= 50) remainBar.style.background = '#22c55e'; // Green
  else if (maxHpPct >= 20) remainBar.style.background = '#eab308'; // Yellow/Orange
  else remainBar.style.background = '#ef4444'; // Red
  
  const markerMin = document.getElementById("damage-marker-min");
  const markerMax = document.getElementById("damage-marker-max");
  markerMax.style.display = 'block';
  markerMax.style.left = `${maxHpPct}%`;
  
  if (minHpPct < maxHpPct) {
    markerMin.style.display = 'block';
    markerMin.style.left = `${minHpPct}%`;
  } else {
    markerMin.style.display = 'none';
  }
  
  document.querySelector(".dmg-percent").textContent = `${minPct}% ~ ${maxPct}%`;
  document.querySelector(".dmg-rolls").textContent = killText;

  const minCrit = critRolls[0];
  const maxCrit = critRolls[15];
  const minCritPct = Math.floor(minCrit / defHp * 1000) / 10;
  const maxCritPct = Math.floor(maxCrit / defHp * 1000) / 10;

  // N発でのKO確率 (16通りの乱数を均等7%ずつとしてN回分の和がHP以上になる確率をDPで計算)
  function nHitKoInfo(rollsArr, hp) {
    const maxR = rollsArr[rollsArr.length - 1];
    if (maxR <= 0) return { n: '--', prob: 0 };
    const n = Math.max(1, Math.ceil(hp / maxR));
    let dist = new Map([[0, 1]]);
    for (let hit = 0; hit < n; hit++) {
      const next = new Map();
      for (const [sum, p] of dist) {
        for (const r of rollsArr) {
          const ns = Math.min(sum + r, hp);
          next.set(ns, (next.get(ns) || 0) + p / rollsArr.length);
        }
      }
      dist = next;
    }
    let koProb = 0;
    for (const [sum, p] of dist) { if (sum >= hp) koProb += p; }
    const prob = Math.round(koProb * 1000) / 10;
    const label = prob >= 100 ? `確定${n}発` : `乱数${n}発 (${prob}%)`;
    return { n, prob, label };
  }
  const normalKo = nHitKoInfo(rolls, defHp);
  const critKo = nHitKoInfo(critRolls, defHp);

  const remainMin = Math.max(0, defHp - maxDmg);
  const remainMax = Math.max(0, defHp - minDmg);

  const typeInfo = moveTypeJa ? typeBadgeHTML(moveTypeJa) : '';
  const classStr = isSpecial ? '特殊' : '物理';
  if (hitCountNote) notes.unshift(hitCountNote);
  const notesStr = notes.length ? `<div style="font-size:0.72rem; color:#94a3b8; margin-top:0.2rem;">補正: ${notes.join(' / ')}</div>` : '';

  const perHitLine = isMultiHit
    ? `<div>1～${perHitPowers.length}回目<b>${perHitMin}～${perHitMax}</b> (${perHitMinPct}%～${perHitMaxPct}%)</div>`
    : '';
  const totalLabel = isMultiHit ? '合計' : 'ダメージ';

  resultLog.innerHTML = `
    <div><b>▶ ${atkPoke.name}</b> の ${typeInfo} <b>「${moveName}」</b> [${classStr}・威力${movePower}] → <b>${defPoke.name}</b></div>
    <div style="margin-top:0.3rem; font-size:0.85rem;">
      残りHP<b>${remainMin}～${remainMax}</b>
      <span style="color:#94a3b8; font-size:0.75rem; margin-left:0.4rem;">最小 / 最大</span>
    </div>
    <div style="font-size:0.85rem;">初期HP<b>${defHp}</b></div>
    ${perHitLine}
    <div style="margin-top:0.2rem;">${totalLabel}<b>${minDmg}～${maxDmg}</b> (${minPct}%～${maxPct}%) ${normalKo.label}</div>
    <div>急所<b>${minCrit}～${maxCrit}</b> (${minCritPct}%～${maxCritPct}%) ${critKo.label}</div>
    ${notesStr}
  `;
}

/* ==========================================================================
   写真からパーティを自動判定（選出画面のスクリーンショットからアイコンを画像照合）
   ========================================================================== */
const PHOTO_ICON_DB_KEY = "pi_icon_hash_db_v5_local"; // ローカル画像+色違い対応でキャッシュを無効化
const PHOTO_HASH_N = 16; // dHash: 16x16（解像度を上げてシルエットの識別力を強化）
const PHOTO_COLOR_GRID = 6; // 色シグネチャ: 6x6グリッドの平均色

// 画像(またはcanvasの一部)から「構造(dHash)」と「色シグネチャ」を計算する
function piComputeSignature(source, sx, sy, sw, sh) {
  // 構造用グレースケール勾配ハッシュ（形のシルエットを捉える。色には左右されにくい）
  const dw = PHOTO_HASH_N + 1, dh = PHOTO_HASH_N;
  const tmp = document.createElement("canvas");
  tmp.width = dw; tmp.height = dh;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  const data = tctx.getImageData(0, 0, dw, dh).data;
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  let bits = "";
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < PHOTO_HASH_N; x++) {
      bits += gray[y * dw + x] > gray[y * dw + x + 1] ? "1" : "0";
    }
  }
  let hash = "";
  for (let i = 0; i < bits.length; i += 4) hash += parseInt(bits.substr(i, 4), 2).toString(16);

  // 色シグネチャ（似た形でも色違い・進化違いを区別しやすくする）
  const g = PHOTO_COLOR_GRID;
  const ctmp = document.createElement("canvas");
  ctmp.width = g; ctmp.height = g;
  const cctx = ctmp.getContext("2d");
  cctx.drawImage(source, sx, sy, sw, sh, 0, 0, g, g);
  const cdata = cctx.getImageData(0, 0, g, g).data;
  const colors = [];
  for (let i = 0; i < cdata.length; i += 4) colors.push(cdata[i], cdata[i + 1], cdata[i + 2]);

  return { hash, colors };
}

function piHammingDist(a, b) {
  let dist = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

function piColorDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - (b[i] || 0); sum += d * d; }
  return Math.sqrt(sum);
}

// 構造距離を主軸にしつつ、色距離も加味する（色違い/シャイニーでもシルエットが同じなら
// 構造距離がほぼ0になり正しく一致し、形が違うものは色が近くても構造距離で区別できる）
const PHOTO_HASH_BITS = PHOTO_HASH_N * PHOTO_HASH_N;
function piCombinedScore(sigA, sigB) {
  const structDist = piHammingDist(sigA.hash, sigB.hash); // 0〜PHOTO_HASH_BITS
  const colorDist = piColorDist(sigA.colors, sigB.colors); // 0〜約2649 (6x6グリッド)
  return (structDist / PHOTO_HASH_BITS) * 0.7 + (colorDist / 2649) * 0.3;
}

function piLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

let photoIconDB = null; // { 名前: dHash }
let photoIconDBShiny = null; // { 名前: dHash } (色違い版)

async function piEnsureIconDB() {
  if (photoIconDB) return;
  try {
    const cached = localStorage.getItem(PHOTO_ICON_DB_KEY);
    const cachedShiny = localStorage.getItem(PHOTO_ICON_DB_KEY + "_shiny");
    if (cached) {
      photoIconDB = JSON.parse(cached);
      photoIconDBShiny = cachedShiny ? JSON.parse(cachedShiny) : {};
      return;
    }
  } catch (e) {}

  const stepIndex = document.getElementById("pi-step-index");
  const stepUpload = document.getElementById("pi-step-upload");
  const bar = document.getElementById("pi-progress-bar");
  const text = document.getElementById("pi-progress-text");
  if (stepUpload) stepUpload.style.display = "none";
  if (stepIndex) stepIndex.style.display = "block";

  const entries = Object.entries(bulbaPokemonIconMap || {});
  const shinyEntries = Object.entries(pokemonIconLocalShiny || {});
  const totalCount = entries.length + shinyEntries.length;
  const db = {};
  const dbShiny = {};
  let done = 0, ok = 0;
  const CONCURRENCY = 16; // 同時に読み込む枚数（サーバー負荷とスピードのバランス）

  const updateProgress = () => {
    done++;
    if (bar) bar.style.width = Math.round((done / totalCount) * 100) + "%";
    if (text) text.textContent = `${done} / ${totalCount}`;
  };

  const loadOne = (targetDb) => async ([name, url]) => {
    try {
      const img = await piLoadImage(toStableArchiveUrl(url));
      targetDb[name] = piComputeSignature(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height);
      ok++;
    } catch (e) { /* CORS等で読めない画像はスキップ */ }
    updateProgress();
  };

  // CONCURRENCY件ずつ並列で読み込む（1枚ずつ待つより大幅に高速化）
  const allEntries = [...entries.map(e => ({ e, target: db })), ...shinyEntries.map(e => ({ e, target: dbShiny }))];
  for (let i = 0; i < allEntries.length; i += CONCURRENCY) {
    const batch = allEntries.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(({ e, target }) => loadOne(target)(e)));
  }

  photoIconDB = db;
  photoIconDBShiny = dbShiny;
  try {
    localStorage.setItem(PHOTO_ICON_DB_KEY, JSON.stringify(db));
    localStorage.setItem(PHOTO_ICON_DB_KEY + "_shiny", JSON.stringify(dbShiny));
  } catch (e) {}

  if (ok < totalCount * 0.3) {
    alert("画像認識用データの取得に一部失敗しました（ネットワーク状況やブロックの影響の可能性があります）。認識精度が下がる場合があります。");
  }
}

function piMatchCrop(canvas, sx, sy, sw, sh, topN = 4) {
  const sig = piComputeSignature(canvas, sx, sy, sw, sh);
  const best = {};
  Object.entries(photoIconDB || {}).forEach(([name, s]) => {
    best[name] = piCombinedScore(sig, s);
  });
  Object.entries(photoIconDBShiny || {}).forEach(([name, s]) => {
    const d = piCombinedScore(sig, s);
    if (!(name in best) || d < best[name]) best[name] = d;
  });
  const scores = Object.entries(best).map(([name, dist]) => ({ name, dist }));
  scores.sort((a, b) => a.dist - b.dist);
  return scores.slice(0, topN);
}

// 指定した枠だけでなく、位置・大きさを少しずつずらした複数パターンでも照合し、
// 一番スコアの良い結果を採用する（ガイド枠と実際のアイコン位置に多少のズレがあっても拾えるようにする）
function piMatchCropRobust(canvas, sx, sy, sw, sh, topN = 4) {
  const offsets = [0, -0.12, 0.12];
  const scales = [1, 0.88, 1.12];
  const candidateSets = [];

  offsets.forEach((ox) => {
    offsets.forEach((oy) => {
      scales.forEach((sc) => {
        const w2 = sw * sc, h2 = sh * sc;
        const x2 = sx + sw * ox - (w2 - sw) / 2;
        const y2 = sy + sh * oy - (h2 - sh) / 2;
        if (x2 < 0 || y2 < 0 || x2 + w2 > canvas.width || y2 + h2 > canvas.height) return;
        candidateSets.push(piMatchCrop(canvas, x2, y2, w2, h2, topN));
      });
    });
  });

  // 名前ごとに一番良かったスコアを採用して統合する
  const best = {};
  candidateSets.forEach((set) => {
    set.forEach(({ name, dist }) => {
      if (!(name in best) || dist < best[name]) best[name] = dist;
    });
  });
  const merged = Object.entries(best).map(([name, dist]) => ({ name, dist }));
  merged.sort((a, b) => a.dist - b.dist);
  return merged.slice(0, topN);
}

// 判定対象12枠のラベル（表示順は 自陣→敵陣。スロット番号は敵0-5/自分6-11で既存ロジックと合わせる）
const PI_SLOT_LABELS = [
  "敵 1体目", "敵 2体目", "敵 3体目", "敵 4体目", "敵 5体目", "敵 6体目",
  "自分 1体目", "自分 2体目", "自分 3体目", "自分 4体目", "自分 5体目", "自分 6体目",
];

// 実際の選出画面は「1体目〜6体目が縦に等間隔で並ぶ」固定レイアウトなので、
// 1体目と6体目の2箇所だけ囲めば、間の4体は自動計算できる（12回→4回ドラッグに削減、精度も向上）
const PI_ANCHOR_STEPS = [
  { side: "my", rowIndex: 0, label: "自陣 1体目（一番上）" },
  { side: "my", rowIndex: 5, label: "自陣 6体目（一番下）" },
  { side: "enemy", rowIndex: 0, label: "敵陣 1体目（一番上）" },
  { side: "enemy", rowIndex: 5, label: "敵陣 6体目（一番下）" },
];

// 実機の選出画面レイアウトを実測して求めた、12枠の位置（画面に対する割合）。
// カメラのプレビュー表示とキャプチャ後の切り出しの両方でこの同じ数値を使うことで、
// 「画面に見えている通りに」正確に切り出せる（ドラッグ操作が不要になる）。
const PI_GUIDE_ROW_TOP_PCT = [0.178, 0.283, 0.388, 0.493, 0.598, 0.703];
const PI_GUIDE_ROW_H_PCT = 0.095;
const PI_GUIDE_LEFT_X_PCT = 0.124;   // 自陣（左）
const PI_GUIDE_LEFT_W_PCT = 0.207;
const PI_GUIDE_RIGHT_X_PCT = 0.693;  // 敵陣（右）
const PI_GUIDE_RIGHT_W_PCT = 0.117;

function piBuildGuideBoxes() {
  const boxes = [];
  for (let i = 0; i < 6; i++) {
    boxes.push({ side: "enemy", rowIndex: i, x: PI_GUIDE_RIGHT_X_PCT, y: PI_GUIDE_ROW_TOP_PCT[i], w: PI_GUIDE_RIGHT_W_PCT, h: PI_GUIDE_ROW_H_PCT });
  }
  for (let i = 0; i < 6; i++) {
    boxes.push({ side: "my", rowIndex: i, x: PI_GUIDE_LEFT_X_PCT, y: PI_GUIDE_ROW_TOP_PCT[i], w: PI_GUIDE_LEFT_W_PCT, h: PI_GUIDE_ROW_H_PCT });
  }
  return boxes;
}

let piCameraStream = null;

window.openPhotoCamera = async function() {
  const video = document.getElementById("pi-video");
  const guides = document.getElementById("pi-camera-guides");
  guides.innerHTML = "";
  piBuildGuideBoxes().forEach((b) => {
    const div = document.createElement("div");
    div.className = "pi-guide-box" + (b.side === "enemy" ? " pi-guide-enemy" : "");
    div.style.left = (b.x * 100) + "%";
    div.style.top = (b.y * 100) + "%";
    div.style.width = (b.w * 100) + "%";
    div.style.height = (b.h * 100) + "%";
    guides.appendChild(div);
  });

  try {
    piCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch (e) {
    alert("カメラを起動できませんでした。ブラウザのカメラ許可設定をご確認いただくか、「アルバムから選択」をお使いください。");
    return;
  }
  video.srcObject = piCameraStream;

  document.getElementById("pi-step-upload").style.display = "none";
  document.getElementById("pi-step-camera").style.display = "block";

  // シャッターを押す前にアイコン認識用データを裏で準備しておく
  piEnsureIconDB();
};

window.closePhotoCamera = function() {
  if (piCameraStream) {
    piCameraStream.getTracks().forEach((t) => t.stop());
    piCameraStream = null;
  }
  document.getElementById("pi-step-camera").style.display = "none";
  document.getElementById("pi-step-upload").style.display = "block";
};

window.photoCameraShutter = async function() {
  const video = document.getElementById("pi-video");
  const shutterBtn = document.getElementById("pi-shutter-btn");
  shutterBtn.disabled = true;
  shutterBtn.textContent = "解析中…";

  const cap = document.createElement("canvas");
  cap.width = video.videoWidth;
  cap.height = video.videoHeight;
  const capCtx = cap.getContext("2d");
  capCtx.drawImage(video, 0, 0, cap.width, cap.height);

  if (piCameraStream) {
    piCameraStream.getTracks().forEach((t) => t.stop());
    piCameraStream = null;
  }

  await piEnsureIconDB();

  piResults = [];
  piBuildGuideBoxes().forEach((b) => {
    const rx = b.x * cap.width, ry = b.y * cap.height, rw = b.w * cap.width, rh = b.h * cap.height;
    const matches = piMatchCropRobust(cap, rx, ry, rw, rh);
    const slot = b.side === "enemy" ? b.rowIndex : 6 + b.rowIndex;
    piResults.push({ slot, name: matches[0] ? matches[0].name : "", matches, skipped: false });
  });

  shutterBtn.disabled = false;
  shutterBtn.textContent = "📸 シャッター";
  document.getElementById("pi-step-camera").style.display = "none";
  piFinishTapping();
};


let piCanvas, piCtx, piImage = null;
let piAnchorStepIdx = 0; // 0-3
let piAnchors = {}; // { my0:{x,y,w,h}, my5:{...}, enemy0:{...}, enemy5:{...} }
let piResults = []; // { slot, name, dist, skipped }

window.openPhotoImport = function() {
  piAnchorStepIdx = 0;
  piAnchors = {};
  piResults = [];
  piImage = null;
  document.getElementById("photo-import-modal").style.display = "flex";
  document.getElementById("pi-step-upload").style.display = "block";
  document.getElementById("pi-step-camera").style.display = "none";
  document.getElementById("pi-step-index").style.display = "none";
  document.getElementById("pi-step-tap").style.display = "none";
  document.getElementById("pi-step-confirm").style.display = "none";
  const fileInput = document.getElementById("pi-file-input");
  fileInput.value = "";
  fileInput.onchange = piHandleFile;
};

window.closePhotoImport = function() {
  if (piCameraStream) {
    piCameraStream.getTracks().forEach((t) => t.stop());
    piCameraStream = null;
  }
  document.getElementById("photo-import-modal").style.display = "none";
};

async function piHandleFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  piImage = await piLoadImage(url);

  await piEnsureIconDB();

  document.getElementById("pi-step-index").style.display = "none";
  document.getElementById("pi-step-tap").style.display = "block";

  piCanvas = document.getElementById("pi-canvas");
  piCtx = piCanvas.getContext("2d");
  const wrap = document.getElementById("pi-canvas-wrap");
  const maxW = wrap.clientWidth || 600;
  const scale = Math.min(1, maxW / piImage.width);
  piCanvas.width = piImage.width * scale;
  piCanvas.height = piImage.height * scale;
  piDrawBase();

  piSetupDragHandlers();
  piAnchorStepIdx = 0;
  piAnchors = {};
  piUpdateTapInstruction();
}

function piDrawBase() {
  piCtx.clearRect(0, 0, piCanvas.width, piCanvas.height);
  piCtx.drawImage(piImage, 0, 0, piCanvas.width, piCanvas.height);
}

function piUpdateTapInstruction() {
  const el = document.getElementById("pi-tap-instruction");
  if (piAnchorStepIdx >= PI_ANCHOR_STEPS.length) {
    piRunAutoMatch();
    return;
  }
  const step = PI_ANCHOR_STEPS[piAnchorStepIdx];
  el.innerHTML = `${piAnchorStepIdx + 1} / 4：<b>${step.label}</b> のアイコンを、写真の上でドラッグして囲んでください`;
}

function piSetupDragHandlers() {
  let dragging = false, x0 = 0, y0 = 0;
  const getPos = (ev) => {
    const rect = piCanvas.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };
  const onDown = (ev) => {
    ev.preventDefault();
    const p = getPos(ev);
    dragging = true; x0 = p.x; y0 = p.y;
  };
  const onMove = (ev) => {
    if (!dragging) return;
    ev.preventDefault();
    const p = getPos(ev);
    piDrawBase();
    piCtx.strokeStyle = "#3b82f6";
    piCtx.lineWidth = 2;
    piCtx.strokeRect(Math.min(x0, p.x), Math.min(y0, p.y), Math.abs(p.x - x0), Math.abs(p.y - y0));
  };
  const onUp = (ev) => {
    if (!dragging) return;
    dragging = false;
    const p = getPos(ev.changedTouches ? { clientX: ev.changedTouches[0].clientX, clientY: ev.changedTouches[0].clientY } : ev);
    const rx = Math.min(x0, p.x), ry = Math.min(y0, p.y);
    const rw = Math.abs(p.x - x0), rh = Math.abs(p.y - y0);
    piDrawBase();
    if (rw < 6 || rh < 6) return; // 小さすぎるドラッグは無視

    const step = PI_ANCHOR_STEPS[piAnchorStepIdx];
    piAnchors[`${step.side}${step.rowIndex}`] = { x: rx, y: ry, w: rw, h: rh };
    piAnchorStepIdx++;
    piUpdateTapInstruction();
  };

  piCanvas.onmousedown = onDown;
  piCanvas.onmousemove = onMove;
  piCanvas.onmouseup = onUp;
  piCanvas.ontouchstart = onDown;
  piCanvas.ontouchmove = onMove;
  piCanvas.ontouchend = onUp;
}

// 1体目・6体目のアンカーから、間の2〜5体目の位置を等間隔で自動計算する
function piInterpolateRows(anchorTop, anchorBottom) {
  const w = (anchorTop.w + anchorBottom.w) / 2;
  const h = (anchorTop.h + anchorBottom.h) / 2;
  const x = (anchorTop.x + anchorBottom.x) / 2;
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const y = anchorTop.y + (anchorBottom.y - anchorTop.y) * t;
    rows.push({ x, y, w, h });
  }
  return rows;
}

function piRunAutoMatch() {
  document.getElementById("pi-tap-instruction").innerHTML = "判定中…";

  const enemySkipped = !!(piAnchors.enemy0 && piAnchors.enemy0.__skip);
  const mySkipped = !!(piAnchors.my0 && piAnchors.my0.__skip);

  piResults = [];

  if (enemySkipped) {
    for (let i = 0; i < 6; i++) piResults.push({ slot: i, name: "", matches: [], skipped: true });
  } else {
    const enemyRows = piInterpolateRows(piAnchors.enemy0, piAnchors.enemy5);
    enemyRows.forEach((r, i) => {
      const matches = piMatchCropRobust(piCanvas, r.x, r.y, r.w, r.h);
      piResults.push({ slot: i, name: matches[0] ? matches[0].name : "", matches, skipped: false });
    });
  }

  if (mySkipped) {
    for (let i = 0; i < 6; i++) piResults.push({ slot: 6 + i, name: "", matches: [], skipped: true });
  } else {
    const myRows = piInterpolateRows(piAnchors.my0, piAnchors.my5);
    myRows.forEach((r, i) => {
      const matches = piMatchCropRobust(piCanvas, r.x, r.y, r.w, r.h);
      piResults.push({ slot: 6 + i, name: matches[0] ? matches[0].name : "", matches, skipped: false });
    });
  }

  piFinishTapping();
}

window.photoImportSkip = function() {
  // 現在の面（自陣/敵陣）をまるごとスキップする
  const step = PI_ANCHOR_STEPS[piAnchorStepIdx];
  if (!step) return;
  const otherIdx = PI_ANCHOR_STEPS.findIndex((s, i) => s.side === step.side && i !== piAnchorStepIdx);
  // 同じ面のもう片方のアンカーが未取得なら、ダミー値を入れてこの面をスキップ扱いにする
  piAnchors[`${step.side}0`] = piAnchors[`${step.side}0`] || { x: 0, y: 0, w: 0, h: 0, __skip: true };
  piAnchors[`${step.side}5`] = piAnchors[`${step.side}5`] || { x: 0, y: 0, w: 0, h: 0, __skip: true };
  // 未処理の同じ面のステップも飛ばす
  while (piAnchorStepIdx < PI_ANCHOR_STEPS.length && PI_ANCHOR_STEPS[piAnchorStepIdx].side === step.side) {
    piAnchorStepIdx++;
  }
  piUpdateTapInstruction();
};

window.photoImportUndo = function() {
  if (piAnchorStepIdx === 0) return;
  piAnchorStepIdx--;
  const step = PI_ANCHOR_STEPS[piAnchorStepIdx];
  delete piAnchors[`${step.side}${step.rowIndex}`];
  piUpdateTapInstruction();
};

function piFinishTapping() {
  document.getElementById("pi-step-tap").style.display = "none";
  document.getElementById("pi-step-confirm").style.display = "block";
  piRenderResults();
}

function piRenderResults() {
  const list = document.getElementById("pi-results-list");
  list.innerHTML = "";
  piResults.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "pi-result-row" + (r.skipped ? " pi-skipped" : "");

    const label = document.createElement("div");
    label.className = "pi-result-label";
    label.textContent = PI_SLOT_LABELS[r.slot];
    row.appendChild(label);

    const thumb = document.createElement("img");
    thumb.className = "pi-result-thumb";
    thumb.src = r.name && bulbaPokemonIconMap[r.name] ? toStableArchiveUrl(bulbaPokemonIconMap[r.name]) : "";
    row.appendChild(thumb);

    const nameEl = document.createElement("div");
    nameEl.className = "pi-result-name";
    nameEl.textContent = r.skipped ? "（スキップ）" : (r.name || "候補なし");
    nameEl.onclick = () => {
      showGojuonModal("pokemons", async (selected) => {
        r.name = selected;
        r.skipped = false;
        piRenderResults();
      });
    };
    row.appendChild(nameEl);

    const conf = document.createElement("div");
    conf.className = "pi-result-conf";
    if (!r.skipped && r.matches && r.matches.length) {
      conf.textContent = `候補: ${r.matches.slice(0, 3).map(m => m.name).join(" / ")}`;
    }
    row.appendChild(conf);

    list.appendChild(row);
  });
}

window.applyPhotoImport = function() {
  piResults.forEach((r) => {
    if (r.skipped || !r.name) return;
    const idx = r.slot < 6 ? r.slot : r.slot - 6;
    const target = r.slot < 6 ? enemyParty : myParty;
    if (!target[idx]) return;
    target[idx].name = r.name;
    const possible = abilitiesByPokemon[r.name];
    target[idx].ability = (possible && possible.length) ? possible[0] : "";
  });
  renderEnemyParty();
  renderMyParty();
  updateCalculator();
  closePhotoImport();
};

init();

