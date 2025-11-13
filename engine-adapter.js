// engine-adapter.js —— 中文題面 + A 六符號、B 中文標籤/可換圖、C 中文敘事
// 並加入「present_fp（表象指紋）」＋ 整輪表象去重
(function () {
  // ---------- 工具 ----------
  const _STEP2ARROW = { UP:'↑', RIGHT:'→', DOWN:'↓', LEFT:'←', CCW:'↺', CW:'↻' };
  const _stepsToArrows = steps => steps.map(s => _STEP2ARROW[s] || s);
  const _pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const _hash = s => {
    // 輕量字串 hash（表象指紋用）
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  };

  // A：六動作中文詞彙
  const _TEXT_POOL = {
    UP:["往上","向上","上面","上"],
    DOWN:["往下","向下","下面","下"],
    LEFT:["向左","往左","左轉","左邊","左側","左"],
    RIGHT:["向右","往右","右轉","右邊","右側","右"],
    CCW:["逆時針","逆時針旋轉","向左旋轉"],
    CW:["順時針","順時針旋轉","向右旋轉"]
  };
  const _A_STEMS = [
    t=>`依序執行：${t.join("、")}。`,
    t=>`請按照提示操作：${t.join("、")}。`,
    t=>`角色要依序做：${t.join("、")}。`,
  ];
  function _stepsToTextTokens(steps){ return steps.map(s => _pick(_TEXT_POOL[s] || [s])); }

  // B/C：中文對照與模板
  const _FACE_ZH = { front:"正面", right:"右側", back:"背面", left:"左側" };
  // 註：用「右轉90°／左轉90°／不轉／迴轉180°」語義最明確
  const _STEP_ZH = { UP:"往前轉", RIGHT:"右轉90°", LEFT:"左轉90°", DOWN:"往後轉", CCW:"逆時針旋轉", CW:"順時針旋轉" };
  const _legendZh = steps => steps.map(s => _STEP_ZH[s] || s).join("、");

  // B：中文標籤池（可擴充）
  const _LABEL_SETS = [
    { front:"正面", right:"右側", back:"背面", left:"左側" },
    { front:"前",   right:"右",   back:"後",   left:"左"   },
    { front:"前方", right:"右方", back:"後方", left:"左方" },
    { front:"向前", right:"向右", back:"向後", left:"向左" },
  ];

  // 預設四張面向圖（若你之後有 packs，前端可自行切換）
  function _defaultFaces(){
    return { front:"img/front.png", right:"img/right.png", back:"img/back.png", left:"img/left.png" };
  }

  // ---------- bundle → 你的舊 item 形狀 ----------
  function _bundleToLegacyItem(type, bundle) {
    if (type === "A") {
      const seqArrows  = _stepsToArrows(bundle.blueprint.steps);
      const textTokens = _stepsToTextTokens(bundle.blueprint.steps);
      const stemText   = _pick(_A_STEMS)(textTokens);
      return {
        layout_type: "A",
        textTokens,
        question: { tokens: textTokens, wording: stemText },
        meta: { seq: seqArrows },
        seq: seqArrows,
        options: ['↑','→','↓','←','↺','↻'],
        time_limit: 20
      };
    }

    if (type === "B") {
      // 題目：箭頭序列；提供中文標籤與（可選）圖示
      const seqArrows = _stepsToArrows(bundle.blueprint.steps);
      const labels = _pick(_LABEL_SETS);
      return {
        layout_type: "B",
        meta: { seq: seqArrows },
        question: { tokens: seqArrows, wording: "請依序點擊每一步的面向。" },
        options: ["front","right","back","left"],
        ui: {
          option_labels: labels,   // 中文標籤（正面/右側/背面/左側 或 前/右/後/左）
          face_pack: null         // 之後若有包名可填；現在用預設圖
        },
        optionFaces: _defaultFaces(), // 預設四張圖路徑（可改）
        time_limit: 25
      };
    }

    // C：題頭中文敘事（包含「依序：右轉90°、不轉…」）
    const start = (bundle.blueprint.start || 'front').toLowerCase();
    const stemText = `起始面向：${_FACE_ZH[start]}。依序：${_legendZh(bundle.blueprint.steps)}。最後面向？`;
    return {
      layout_type: "C",
      meta: {
        reference: start,
        seq: _stepsToArrows(bundle.blueprint.steps)
      },
      question: { wording: stemText },
      options: ["front","right","back","left"],
      time_limit: 25
    };
  }

  // ---------- 表象裝飾（present_fp） ----------
  function _decoratePresentation(type, legacyItem, bundle) {
    if (type === "A") {
      // 句型粗略編碼（stem1/2/3）
      const w = legacyItem.question?.wording || '';
      const stemId = w.includes('角色要依序做') ? 'stem3'
                 : w.includes('請按照提示操作') ? 'stem2'
                 : 'stem1';
      const tokens = (legacyItem.textTokens || []).join('/');
      legacyItem.present_fp = _hash(`A|${stemId}|${tokens}`);
      legacyItem.ui = Object.assign({}, legacyItem.ui, { stem_id: stemId });
      return legacyItem;
    }
    if (type === "B") {
      // 以中文標籤內容、圖包名、箭頭符號序列作為表象
      const labels = (legacyItem.ui && legacyItem.ui.option_labels) || _LABEL_SETS[0];
      const facePack = (legacyItem.ui && legacyItem.ui.face_pack) || 'default';
      const seqSym = (legacyItem.meta?.seq || []).join('');
      const labelKey = JSON.stringify(labels);
      legacyItem.present_fp = _hash(`B|${labelKey}|${facePack}|${seqSym}`);
      return legacyItem;
    }
    if (type === "C") {
      // 以中文模板形狀（stem 前綴）、起始面向、中文 legend 作為表象
      const wording = legacyItem.question?.wording || '';
      const tplId = wording.includes('機器人起始於') ? 'c_tpl3'
                 : wording.includes('角色一開始朝向') ? 'c_tpl2'
                 : 'c_tpl1';
      const start = legacyItem.meta?.reference || 'front';
      const legendZh = wording.split('依序：')[1]?.split('。')[0] || '';
      legacyItem.present_fp = _hash(`C|${tplId}|${start}|${legendZh}`);
      legacyItem.ui = Object.assign({}, legacyItem.ui, { template_id: tplId });
      return legacyItem;
    }
    return legacyItem;
  }

  function _bundleToLegacyItemWithPresentation(type, bundle) {
    const base = _bundleToLegacyItem(type, bundle);
    return _decoratePresentation(type, base, bundle);
  }

  // ---------- 對外 API（含整輪表象去重） ----------
  function generateLegacyQueue(type, count, startDifficulty = 3) {
    const session = window.generateSessionQueue(type, count, startDifficulty);
    const legacyItems = [];
    const usedPresent = new Set();   // 表象指紋（整輪不重複）
    const usedFp = new Set();        // blueprint 指紋（雙保險）

    for (let i = 0; i < session.items.length; i++) {
      let bundle = session.items[i];
      let item   = _bundleToLegacyItemWithPresentation(type, bundle);

      // 若撞表象或 blueprint，就以同難度重抽
      let tries = 0;
      while ((usedPresent.has(item.present_fp) || usedFp.has(bundle.dedup_fingerprint)) && tries < 12) {
        bundle = window.genOneByType(type, session.difficulties[i]);
        item   = _bundleToLegacyItemWithPresentation(type, bundle);
        tries++;
      }

      legacyItems.push(item);
      usedPresent.add(item.present_fp);
      usedFp.add(bundle.dedup_fingerprint);
    }
    return { legacyItems, difficulties: session.difficulties };
  }

  function generateLegacyOne(type, difficulty, recentFps = [], recentPresent = []) {
    let tries = 0, b, item;
    do {
      b = window.genOneByType(type, difficulty);
      item = _bundleToLegacyItemWithPresentation(type, b);
      tries++;
    } while ((recentFps.includes(b.dedup_fingerprint) || recentPresent.includes(item.present_fp)) && tries < 12);

    return { item, fp: b.dedup_fingerprint, present_fp: item.present_fp };
  }

  window.generateLegacyQueue = generateLegacyQueue;
  window.generateLegacyOne = generateLegacyOne;
})();
