// master.js
const TYPE_COLORS = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
  grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
  ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
  rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705898',
  steel: '#B7B7CE', fairy: '#D685AD'
};

const TYPE_NAMES_JA = {
  normal:'ノーマル', fire:'ほのお', water:'みず', electric:'でんき', grass:'くさ',
  ice:'こおり', fighting:'かくとう', poison:'どく', ground:'じめん', flying:'ひこう',
  psychic:'エスパー', bug:'むし', rock:'いわ', ghost:'ゴースト', dragon:'ドラゴン',
  dark:'あく', steel:'はがね', fairy:'フェアリー'
};

let allMasterData = [];
let allItemsData = [];
let showChampionOnly = false;
let currentTab = 'pokemon'; // 'pokemon' or 'item'
let pokemonIconLocalMap = {};

// localStorage-based override helpers (replaces server-side flags_db writes)
function getFlagOverrides(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; }
}
function setFlagOverride(key, name, is_champion) {
  const overrides = getFlagOverrides(key);
  overrides[name] = is_champion;
  localStorage.setItem(key, JSON.stringify(overrides));
}
function getRankingOverrides() {
  try { return JSON.parse(localStorage.getItem('ranking_overrides') || '{}'); } catch(e) { return {}; }
}

// --- Client-side CSV import (ported from backend/server.py import_csv) ---
function parseCsvText(text) {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = parseLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = (cols[i] || '').trim());
    return row;
  });
}

function importCsvClientSide(text) {
  const rows = parseCsvText(text);
  const percentPattern = /^\s*(.+?)\s*\(([\d.]+%)\)\s*$/;
  const rankingOverrides = getRankingOverrides();
  const pokeFlags = getFlagOverrides('pokemon_flags');
  const itemFlags = getFlagOverrides('item_flags');
  let count = 0;

  const parseColumns = (row, prefix, maxRank, targetList) => {
    for (let i = 1; i <= maxRank; i++) {
      const val = (row[`${prefix}${i}位`] || '').trim();
      if (val && val !== '-') {
        const m = percentPattern.exec(val);
        if (m) targetList.push({ name: m[1], percent: m[2] });
        else targetList.push({ name: val.split('(')[0], percent: '-' });
      }
    }
  };

  rows.forEach(row => {
    const pokeName = (row['ポケモン'] || '').trim();
    if (!pokeName) return;

    const pokeData = { ev_spread: [], nature: [], ability: [], moves: [], items: [] };

    const ev = (row['調整1位'] || '').trim();
    if (ev && ev !== '-') {
      const m = /^([\d-]+)\(([\d.]+%)\)$/.exec(ev);
      if (m) pokeData.ev_spread.push({ name: m[1], percent: m[2] });
      else pokeData.ev_spread.push({ name: ev.split('(')[0], percent: '-' });
    }

    parseColumns(row, '性格', 3, pokeData.nature);
    parseColumns(row, '特性', 3, pokeData.ability);
    parseColumns(row, '技', 5, pokeData.moves);
    parseColumns(row, '道具', 5, pokeData.items);

    rankingOverrides[pokeName] = pokeData;
    if (!(pokeName in pokeFlags)) pokeFlags[pokeName] = true;
    pokeData.items.forEach(it => { if (!(it.name in itemFlags)) itemFlags[it.name] = true; });
    count++;
  });

  localStorage.setItem('ranking_overrides', JSON.stringify(rankingOverrides));
  localStorage.setItem('pokemon_flags', JSON.stringify(pokeFlags));
  localStorage.setItem('item_flags', JSON.stringify(itemFlags));
  return count;
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('master-tbody');
  const itemsTbody = document.getElementById('item-tbody');

  try {
    const localReq = await fetch('./data/pokemon_icon_local.json');
    pokemonIconLocalMap = await localReq.json();
  } catch (e) { pokemonIconLocalMap = {}; }
  try {
    const bulbaReq = await fetch('./data/bulba_pokemon_icons.json');
    const bulbaMap = await bulbaReq.json();
    pokemonIconLocalMap = Object.assign({}, bulbaMap, pokemonIconLocalMap);
  } catch (e) { /* なければローカル画像のみで運用 */ }

  try {
    const res = await fetch('./data/masterdata.json');
    if (!res.ok) throw new Error('Failed to fetch data');
    allMasterData = await res.json();
    // apply any CSV-imported overrides saved locally in this browser
    const rankingOverrides = getRankingOverrides();
    Object.entries(rankingOverrides).forEach(([name, data]) => {
      const entry = allMasterData.find(d => d.name === name);
      if (entry) { entry.moves = data.moves || entry.moves; entry.items = data.items || entry.items; }
    });
    // apply locally-saved champion flag overrides
    const pokeOverrides = getFlagOverrides('pokemon_flags');
    Object.entries(pokeOverrides).forEach(([name, val]) => {
      const entry = allMasterData.find(d => d.name === name);
      if (entry) entry.is_champion = val;
    });
    renderTable(allMasterData);
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #ff5555;">データの読み込みに失敗しました</td></tr>`;
  }

  try {
    const res2 = await fetch('./data/masterdata_items.json');
    if (!res2.ok) throw new Error('Failed to fetch items data');
    allItemsData = await res2.json();
    const itemOverrides = getFlagOverrides('item_flags');
    Object.entries(itemOverrides).forEach(([name, val]) => {
      const entry = allItemsData.find(d => d.name === name);
      if (entry) entry.is_champion = val;
    });
    renderItemsTable(allItemsData);
  } catch (e) {
    console.error(e);
    itemsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #ff5555;">アイテムデータの読み込みに失敗しました</td></tr>`;
  }

  // CSVアップロード
  const csvForm = document.getElementById('csv-upload-form');
  if(csvForm) {
    csvForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('csv-file');
      if(!fileInput.files || fileInput.files.length === 0) {
        alert('CSVファイルを選択してください。');
        return;
      }
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      const btn = document.getElementById('csv-submit-btn');
      btn.textContent = '読込中...';
      btn.disabled = true;
      
      try {
        const text = await file.text();
        const count = importCsvClientSide(text);
        alert(`${count}件のポケモンのデータを読み込みました。ページをリロードします。`);
        location.reload();
      } catch(err) {
        console.error(err);
        alert('インポートに失敗しました。');
      } finally {
        btn.textContent = 'CSV読込';
        btn.disabled = false;
      }
    });
  }

  const searchInput = document.getElementById('search-input');
  const filterChampion = document.getElementById('filter-champion');

  function applyFilters() {
    const query = searchInput.value.trim();
    if (currentTab === 'pokemon') {
      let filtered = allMasterData;
      if (showChampionOnly) filtered = filtered.filter(d => d.is_champion);
      if (query) filtered = filtered.filter(d => d.name.includes(query));
      renderTable(filtered);
    } else {
      let filtered = allItemsData;
      if (showChampionOnly) filtered = filtered.filter(d => d.is_champion);
      if (query) filtered = filtered.filter(d => d.name.includes(query));
      renderItemsTable(filtered);
    }
  }

  searchInput.addEventListener('input', applyFilters);
  filterChampion.addEventListener('change', (e) => {
    showChampionOnly = e.target.checked;
    applyFilters();
  });
  
  document.getElementById('tab-pokemon').addEventListener('click', () => {
    currentTab = 'pokemon';
    document.getElementById('tab-pokemon').classList.add('active');
    document.getElementById('tab-item').classList.remove('active');
    document.getElementById('pokemon-table').style.display = 'table';
    document.getElementById('item-table').style.display = 'none';
    applyFilters();
  });
  
  document.getElementById('tab-item').addEventListener('click', () => {
    currentTab = 'item';
    document.getElementById('tab-item').classList.add('active');
    document.getElementById('tab-pokemon').classList.remove('active');
    document.getElementById('item-table').style.display = 'table';
    document.getElementById('pokemon-table').style.display = 'none';
    applyFilters();
  });
});

function renderTable(data) {
  const tbody = document.getElementById('master-tbody');
  tbody.innerHTML = '';

  if(data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center;">該当するデータがありません</td></tr>`;
    return;
  }

  data.forEach(p => {
    const tr = document.createElement('tr');
    
    // Types
    const typesHtml = p.types.map(t => {
      const color = TYPE_COLORS[t] || '#777';
      const label = TYPE_NAMES_JA[t] || t;
      return `<span class="type-badge-small" style="background-color: ${color}40; border: 1px solid ${color}; color: ${color};">${label}</span>`;
    }).join('');

    // Stats
    const st = p.stats;
    const h = st.hp || 0, a = st.attack || 0, b = st.defense || 0;
    const c = st['special-attack'] || 0, d = st['special-defense'] || 0, s = st.speed || 0;

    // Moves top 3
    const movesTop3 = (p.moves || []).slice(0, 3).map(m => `<li>${m.name} <span style="opacity:0.6;font-size:0.75rem;">${m.percent}</span></li>`).join('');
    const movesHtml = movesTop3 ? `<ul class="top-list">${movesTop3}</ul>` : '<span style="opacity:0.3">-</span>';

    // Items top 3
    const itemsTop3 = (p.items || []).slice(0, 3).map(i => `<li>${i.name} <span style="opacity:0.6;font-size:0.75rem;">${i.percent}</span></li>`).join('');
    const itemsHtml = itemsTop3 ? `<ul class="top-list">${itemsTop3}</ul>` : '<span style="opacity:0.3">-</span>';

    const spriteUrl = pokemonIconLocalMap[p.name] || '';

    tr.innerHTML = `
      <td class="poke-name-col">
        ${spriteUrl ? `<img src="${spriteUrl}" alt="" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">` : ''}
        ${p.name}
      </td>
      <td>${typesHtml}</td>
      <td style="text-align:center;">
        <input type="checkbox" class="champion-flag-checkbox" data-poke="${p.name}" ${p.is_champion ? 'checked' : ''} style="width:1.2rem; height:1.2rem; cursor:pointer;" title="採用フラグ">
      </td>
      <td><span class="stat-val">${h}</span></td>
      <td><span class="stat-val">${a}</span></td>
      <td><span class="stat-val">${b}</span></td>
      <td><span class="stat-val">${c}</span></td>
      <td><span class="stat-val">${d}</span></td>
      <td><span class="stat-val">${s}</span></td>
      <td><span class="stat-val stat-total">${p.bst}</span></td>
      <td>${movesHtml}</td>
      <td>${itemsHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  // バインディング：フラグ更新
  document.querySelectorAll(".champion-flag-checkbox").forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const name = e.target.getAttribute('data-poke');
      const is_champion = e.target.checked;
      
      const poke = allMasterData.find(d => d.name === name);
      if(poke) poke.is_champion = is_champion;
      setFlagOverride('pokemon_flags', name, is_champion);
    });
  });
}

function renderItemsTable(data) {
  const tbody = document.getElementById('item-tbody');
  tbody.innerHTML = '';
  
  if(data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center;">該当するデータがありません</td></tr>`;
    return;
  }
  
  data.forEach(item => {
    const tr = document.createElement('tr');
    
    const catJa = item.category === 'berry' ? 'きのみ' : item.category === 'mega' ? 'メガストーン' : 'その他';
    
    tr.innerHTML = `
      <td style="font-weight:600; color:#fff;">${item.name}</td>
      <td><span class="type-badge-small" style="background-color:rgba(255,255,255,0.1); color:#ccc;">${catJa}</span></td>
      <td style="text-align:center;">
        <input type="checkbox" class="item-flag-checkbox" data-item="${item.name}" ${item.is_champion ? 'checked' : ''} style="width:1.2rem; height:1.2rem; cursor:pointer;" title="採用フラグ">
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  document.querySelectorAll('.item-flag-checkbox').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const name = e.target.getAttribute('data-item');
      const is_champion = e.target.checked;
      
      const targetData = allItemsData.find(d => d.name === name);
      if(targetData) targetData.is_champion = is_champion;
      setFlagOverride('item_flags', name, is_champion);
    });
  });
}
