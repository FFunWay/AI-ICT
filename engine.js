// engine.js

/* =========================
 * 面向與解題器
 * ========================= */

// 面向定義（順時針順序）
const ORDER = ["front", "right", "back", "left"];
// B/C 用到的轉向（A 會另外處理 CCW/CW，不影響這裡）
const ROT = { UP: 0, RIGHT: +1, LEFT: -1, DOWN: +2 };

// 給起始面向 + 步驟，算出最後面向（B/C 用）
function finalFacing(start, steps) {
  let idx = ORDER.indexOf(start);
  for (const s of steps) idx = (idx + ROT[s] + 4) % 4;
  return ORDER[idx];
}

// 解題器
function solveA(bp) { return [...bp.steps]; } // A：答案就是序列（token 陣列）
function solveB(bp) { return finalFacing(bp.start ?? "front", bp.steps); }
function solveC(bp) { return finalFacing(bp.start, bp.steps); }

function sigOf(item) {
  if (!item || typeof item !== 'object') return 'NULL|' + String(item);
  try {
    return item?.meta?.sig4
        || item?.item_id
        || item?.id
        || ((item.layout_type || '') + '|' + JSON.stringify(item.meta || {}) + '|' + (item.stem || ''));
  } catch {
    return 'FALLBACK|' + (item?.layout_type || '') + '|' + (item?.stem || '');
  }
}


// 依簽章去重
function dedupBySig(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = sigOf(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}


// （若你有用到下列驗證器，可以保留）
function validateVariantA(variant, bp) {
  const needed = new Set(bp.steps);
  const provided = new Set(variant.options);
  for (const s of needed) if (!provided.has(s)) return false;
  return true;
}
function validateVariantB(variant, bp) {
  const gold = solveB(bp);
  return variant.answer_key === gold && variant.options.includes(gold);
}
function validateVariantC(variant, bp) {
  const gold = solveC(bp);
  return variant.answer_key === gold && variant.options.includes(gold);
}

// 匯出到全域（供其他腳本使用）
window.solveA = solveA;
window.solveB = solveB;
window.solveC = solveC;
window.validateVariantA = validateVariantA;
window.validateVariantB = validateVariantB;
window.validateVariantC = validateVariantC;

/* =========================
 * 工具
 * ========================= */

function randInt(min, max) { // [min, max]
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function shuffle(arr, seed = null) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hashFingerprint(obj) {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// ==== 語意同義庫 ====
const SEMWORDS = {
  up   : ['往上','向上','上方','朝著天空'],
  down : ['往下','向下','底下','朝向地面'],
  left : ['往左','向左','左邊','朝左側'],
  right: ['往右','向右','右邊','朝右側'],
  cw   : ['順時針','順時鐘','朝鐘錶轉動方向'],
  ccw  : ['逆時針','逆時鐘','與鐘錶轉動方向相反'],
};
const _pick = arr => arr[Math.floor(Math.random() * arr.length)];

function token2Semantic(token) {
  switch (token) {
    case '↑': case 'UP': case '上':   return _pick(SEMWORDS.up);
    case '↓': case 'DOWN': case '下': return _pick(SEMWORDS.down);
    case '←': case 'LEFT': case '左':  return _pick(SEMWORDS.left);
    case '→': case 'RIGHT': case '右': return _pick(SEMWORDS.right);
    case '↻': case '⟳': case 'CW':     return _pick(SEMWORDS.cw);
    case '↺': case '⟲': case 'CCW':    return _pick(SEMWORDS.ccw);
    default: return token;
  }
}

function semanticizeText(s) {
  if (!s || typeof s !== 'string') return s;
  let out = s;

  // 先把中文方向詞做語意替換
  [
    [/順時針|順時鐘/g,        () => _pick(SEMWORDS.cw)],
    [/逆時針|逆時鐘/g,        () => _pick(SEMWORDS.ccw)],
    [/向上|往上|上方|上面|朝著天空|朝向天空|上/g, () => _pick(SEMWORDS.up)],
    [/向下|往下|下方|底下|朝向地面|下面|下/g,       () => _pick(SEMWORDS.down)],
    [/向左|往左|左邊|靠左側|朝左側|左/g,           () => _pick(SEMWORDS.left)],
    [/向右|往右|右邊|靠右側|朝右側|右/g,           () => _pick(SEMWORDS.right)],
  ].forEach(([re, fn]) => { if (re.test(out)) out = out.replace(re, fn); });

  // 再把箭頭符號換掉
  const map = {
    '↑': () => _pick(SEMWORDS.up),   '↓': () => _pick(SEMWORDS.down),
    '←': () => _pick(SEMWORDS.left), '→': () => _pick(SEMWORDS.right),
    '↻': () => _pick(SEMWORDS.cw),   '⟳': () => _pick(SEMWORDS.cw),
    '↺': () => _pick(SEMWORDS.ccw),  '⟲': () => _pick(SEMWORDS.ccw),
  };
  Object.entries(map).forEach(([k, fn]) => {
    if (out.includes(k)) out = out.split(k).join(fn());
  });
  return out;
}



/* =========================
 * 難度錨
 * ========================= */

// A：控制「序列長度」與「允許的步種」的權重（含 CCW/CW）
const DIFF_A = {
  // len: [minLen, maxLen]；allow: 權重（0 不出、1 普通、2 偏多）
  1: { len: [2, 3], allow: { UP:1, RIGHT:1, DOWN:0, LEFT:1, CCW:0, CW:0 } },
  2: { len: [3, 3], allow: { UP:1, RIGHT:1, DOWN:1, LEFT:1, CCW:0, CW:0 } },
  3: { len: [3, 4], allow: { UP:1, RIGHT:1, DOWN:1, LEFT:1, CCW:1, CW:1 } },
  4: { len: [4, 4], allow: { UP:1, RIGHT:1, DOWN:1, LEFT:1, CCW:1, CW:1 } },
  5: { len: [4, 5], allow: { UP:1, RIGHT:1, DOWN:1, LEFT:1, CCW:2, CW:2 } },
};

// B：箭頭→面向（起始 front），只用 UP/RIGHT/LEFT/DOWN
const DIFF_B = {
  1: { len: 1, allowDown: false, allowUp: true  },
  2: { len: 2, allowDown: false, allowUp: true  },
  3: { len: 2, allowDown: true,  allowUp: true  },
  4: { len: 3, allowDown: true,  allowUp: true  },
  5: { len: 4, allowDown: true,  allowUp: true  },
};

// C：起始面向 + 相對轉向，只用 UP/RIGHT/LEFT/DOWN
const DIFF_C = {
  1: { len: 2, allowDown: false, allowUp: true  },
  2: { len: 3, allowDown: false, allowUp: true  },
  3: { len: 3, allowDown: true,  allowUp: true  },
  4: { len: 4, allowDown: true,  allowUp: true  },
  5: { len: 4, allowDown: true,  allowUp: true  },
};

/* =========================
 * 步驟產生器
 * ========================= */

// B/C 用：從允許集合抽步驟（不含 CCW/CW）
function genSteps(len, { allowDown = false, allowUp = true }) {
  let pool = ["LEFT", "RIGHT"];
  if (allowUp)   pool.push("UP");
  if (allowDown) pool.push("DOWN");
  const out = [];
  for (let i = 0; i < len; i++) out.push(pick(pool));
  return out;
}

// A 用：照 DIFF_A 的權重抽步驟（可含 CCW/CW）
function weightedPick(pool) { // pool: {UP:1, RIGHT:1, ...}
  const entries = Object.entries(pool).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * sum;
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}
function genStepsA(difficulty) {
  const d = Math.max(1, Math.min(5, difficulty));
  const cfg = DIFF_A[d];
  const [minL, maxL] = cfg.len;
  const len = randInt(minL, maxL);
  const steps = [];
  for (let i = 0; i < len; i++) steps.push(weightedPick(cfg.allow));
  return steps; // 可能含 UP/RIGHT/LEFT/DOWN/CCW/CW
}

/* =========================
 * Blueprint 產生器
 * ========================= */

// A：中文指令 → 依序點擊 6 符號（含 CCW/CW）
function genBlueprintA(difficulty = 3) {
  const steps = genStepsA(difficulty); // 可能含 CCW/CW
  const bp = { steps };
  const answer = solveA(bp); // 就是 steps（token 陣列）
  // A 題選項：完整六種（供需要 options 的流程使用）
  const options = ["UP", "RIGHT", "DOWN", "LEFT", "CCW", "CW"];
  const option_shuffle_seed = Math.floor(Math.random() * 1e9);
  return {
    concept_id: "A_TEXT→ARROWS",
    difficulty,
    blueprint: bp,
    options: shuffle(options, option_shuffle_seed),
    answer,
    option_shuffle_seed,
    dedup_fingerprint: hashFingerprint({ concept: "A", bp }),
  };
}

// B：箭頭→面向（起始 front），步數 1~4 隨機
function genBlueprintB(difficulty = 3) {
  const cfg = DIFF_B[Math.max(1, Math.min(5, difficulty))];
  const len = randInt(1, 4); // 你之前的需求：1~4 隨機
  const steps = genSteps(len, { allowDown: cfg.allowDown, allowUp: cfg.allowUp });
  const bp = { start: "front", steps };
  const answer = solveB(bp);
  const options = ["front", "right", "back", "left"];
  const option_shuffle_seed = Math.floor(Math.random() * 1e9);
  return {
    concept_id: "B_ARROWS→FACING(front)",
    difficulty,
    blueprint: bp,
    options: shuffle(options, option_shuffle_seed),
    answer,
    option_shuffle_seed,
    dedup_fingerprint: hashFingerprint({ concept: "B", bp }),
  };
}

// C：起始面向 + 相對轉向，步數 1~4 隨機
function genBlueprintC(difficulty = 3) {
  const cfg = DIFF_C[Math.max(1, Math.min(5, difficulty))];
  const start = pick(["front", "right", "back", "left"]);
  const len = randInt(1, 4); // 你之前的需求：1~4 隨機
  const steps = genSteps(len, { allowDown: cfg.allowDown, allowUp: cfg.allowUp });
  const bp = { start, steps };
  const answer = solveC(bp);
  const options = ["front", "right", "back", "left"];
  const option_shuffle_seed = Math.floor(Math.random() * 1e9);
  return {
    concept_id: "C_START+ARROWS→FINAL_FACING",
    difficulty,
    blueprint: bp,
    options: shuffle(options, option_shuffle_seed),
    answer,
    option_shuffle_seed,
    dedup_fingerprint: hashFingerprint({ concept: "C", bp }),
  };
}

/* =========================
 * 對外 API：單題與佇列
 * ========================= */

function genOneByType(type, difficulty) {
  if (type === "A") return genBlueprintA(difficulty);
  if (type === "B") return genBlueprintB(difficulty);
  if (type === "C") return genBlueprintC(difficulty);
  throw new Error("Unknown type: " + type);
}

/**
 * 產生一輪題目佇列（不重複、含難度軌跡）
 * @param {"A"|"B"|"C"} type
 * @param {number} count 題數
 * @param {number} startDifficulty 1~5
 * @returns {{items: Array, difficulties: number[]}}
 */
function generateSessionQueue(type, count, startDifficulty = 3) {
  const items = [];
  const difficulties = [];

  // ✅ 整輪防重：關卡期間已使用的題目指紋（以 blueprint 為準）
  const usedFp = new Set();

  // （可留可刪）概念冷卻：避免同概念連發；你現在是單一 type，所以影響不大
  const recentConcept = [];
  const CONCEPT_COOLDOWN = 3;

  let d = Math.max(1, Math.min(5, startDifficulty));

  for (let i = 0; i < count; i++) {
    let tries = 0, q;

    // 連續嘗試直到本輪未出現過
    do {
      q = genOneByType(type, d);
      tries++;

      const fpHit = usedFp.has(q.dedup_fingerprint);                  // ← 整輪防重
      const conceptHit = recentConcept.slice(-CONCEPT_COOLDOWN).includes(q.concept_id);

      if (!fpHit && !conceptHit) break;
    } while (tries < 50); // 給足夠嘗試次數，避免極端情況

    // 若實在撞到上限（題庫空間太小），最後一次也會放進來
    items.push(q);
    difficulties.push(d);
    usedFp.add(q.dedup_fingerprint);
    recentConcept.push(q.concept_id);

    // （可留）微幅調難度；若你不想浮動，改成 d = d; 即可
    const fakePerf = { avgTime: 3, errRate: 0.2, last3Correct: true, targetTime: 4 };
    d = adaptNextDifficulty(d, fakePerf);
  }

  return { items, difficulties };
}


// 簡易適性：根據最近表現調整難度（上下限 1~5）
function adaptNextDifficulty(curr, perf) {
  let d = curr;
  if (perf.last3Correct && perf.avgTime <= perf.targetTime && perf.errRate <= 0.15) d++;
  else if (perf.errRate >= 0.35 || perf.avgTime >= 1.5 * perf.targetTime) d--;
  return Math.max(1, Math.min(5, d));
}

// === 舊版 A 題題幹：把 steps 變成語意詞一句話 ===
function buildStemAFromSteps(bp) {
  // bp.steps 可能是 ["UP","RIGHT","CCW",...]
  const phrases = (bp.steps || []).map(token2Semantic); // 逐步轉語意
  return `請依序按下：${phrases.join('、')}。`;
}
window.buildStemAFromSteps = buildStemAFromSteps;


// 匯出到全域
window.genBlueprintA = genBlueprintA;
window.genBlueprintB = genBlueprintB;
window.genBlueprintC = genBlueprintC;
window.generateSessionQueue = generateSessionQueue;
window.adaptNextDifficulty = adaptNextDifficulty;
window.genOneByType = genOneByType;
// 匯出到全域（你原本已有很多 export，補上這兩個）
window.sigOf = sigOf;
window.dedupBySig = dedupBySig;
window.semanticizeText = semanticizeText;
window.token2Semantic = token2Semantic;

