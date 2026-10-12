/* Подбор по машине (/podbor/).
   Формула из справочника товаров (JOIM.catalog.es19): нужно = объём × (улица ? 1,5 : 1).
   Если нужно больше предела ES-19 (бензин: limitPetrol, дизель: limitDiesel), подходит ES-29, иначе ES-19.
   По этой же функции пересчитывается таблица-шпаргалка. Цифр моделей в скрипте нет: цены и пределы из JOIM.catalog,
   названия и характеристики уже стоят в разметке (у ES-19 предел объёма в двух вариантах, показан вариант выбранного топлива). */
(() => {
  'use strict';

  const J = window.JOIM;
  const root = document.querySelector('[data-pick]');
  if (!J || !root) return;

  const cat = J.catalog;
  const LIMIT = { petrol: cat.es19.limitPetrol, diesel: cat.es19.limitDiesel };
  const STREET_FACTOR = 1.5;            // запас в полтора раза, если машина зимует на улице
  const NB = '\u00A0';          // неразрывный пробел
  const FUEL_NAME = { petrol: 'Бензин', diesel: 'Дизель' };

  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const range = root.querySelector('[data-pick-volume]');
  const MIN = Math.round(parseFloat(range.min) * 10);
  const MAX = Math.round(parseFloat(range.max) * 10);

  /* Расчёт в сотых долях литра целыми числами: 5,7 × 1,5 даёт ровно 855, а не 8,549999. */
  function calc(fuel, tenths, street) {
    const limit = Math.round(LIMIT[fuel] * 100);
    const need = Math.round(tenths * 10 * (street ? STREET_FACTOR : 1));
    return {
      need,
      limit,
      id: need > limit ? 'es29' : 'es19',
      // «с запасом»: до предела ES-19 остаётся ещё полуторный запас сверх расчётного объёма
      spare: Math.round(need * STREET_FACTOR) <= limit,
    };
  }

  // 160 → «1,6 л», 855 → «8,55 л»; short: 800 → «8 л»
  function litres(hundredths, short) {
    const whole = Math.floor(hundredths / 100);
    const frac = hundredths % 100;
    let s = String(whole);
    if (frac % 10) s += ',' + String(frac).padStart(2, '0');
    else if (frac || !short) s += ',' + frac / 10;
    return s + NB + 'л';
  }

  // названия моделей не переносятся по дефису
  const M19 = '<span class="nowrap">ES-19</span>';
  const M29 = '<span class="nowrap">ES-29</span>';

  // строка объяснения: только заранее заданные фразы и числа из расчёта, поэтому её можно вставлять как HTML
  function explain(s, r) {
    const head = `${FUEL_NAME[s.fuel]} ${litres(s.tenths * 10)}, ` + (s.street
      ? `зимует на${NB}улице: берём запас в${NB}полтора раза.`
      : `гараж или паркинг: считаем как есть.`);
    if (r.id === 'es29') return `${head} Это больше предела ${M19}, нужна ${M29}.`;
    if (r.spare) return `${head} ${M19} хватит с${NB}запасом.`;
    if (s.street) return `${head} ${M19} хватит.`;
    return `${head} ${M19} хватит, но${NB}для${NB}зимовки на${NB}улице нужна ${M29}.`;
  }

  function readState() {
    const fuel = root.querySelector('input[name="fuel"]:checked');
    const parking = root.querySelector('input[name="parking"]:checked');
    const tenths = Math.round(parseFloat(range.value) * 10);
    return {
      fuel: fuel && fuel.value === 'diesel' ? 'diesel' : 'petrol',
      tenths: Math.min(MAX, Math.max(MIN, Number.isFinite(tenths) ? tenths : MIN)),
      street: !!parking && parking.value === 'street',
    };
  }

  const els = {
    out: root.querySelector('[data-pick-out]'),
    dec: root.querySelector('[data-pick-step="-1"]'),
    inc: root.querySelector('[data-pick-step="1"]'),
    result: root.querySelector('[data-pick-result]'),
    why: root.querySelector('[data-pick-why]'),
    need: root.querySelector('[data-pick-need]'),
    limit: root.querySelector('[data-pick-limit]'),
    fill: root.querySelector('[data-pick-fill]'),
  };

  const replay = (el) => {
    el.classList.remove('is-swap');
    void el.offsetWidth; // перезапуск короткого перехода
    el.classList.add('is-swap');
  };

  let shown = els.result.getAttribute('data-model');
  function showModel(id, animate) {
    const p = cat[id];
    shown = id;
    els.result.setAttribute('data-model', id);
    all('[data-pick-model]').forEach((el) => {
      const on = el.getAttribute('data-pick-model') === id;
      el.hidden = !on;
      if (on && animate) replay(el); else el.classList.remove('is-swap');
    });
    all('[data-pick-img]').forEach((img) => img.classList.toggle('is-active', img.getAttribute('data-pick-img') === id));
    all('[data-pick-price]').forEach((el) => { el.textContent = J.formatPrice(p.price); if (animate) replay(el); });
    all('[data-pick-short]').forEach((el) => { el.textContent = p.short; });
    all('[data-pick-url]').forEach((a) => a.setAttribute('href', p.url));
    // во время «Добавлено» содержимое кнопки не трогаем: меняется только товар следующего клика
    all('[data-pick-add]').forEach((btn) => btn.setAttribute('data-add-to-cart', id));
  }

  let announceTimer = 0;
  function update(opts) {
    const silent = opts && opts.silent;
    const s = readState();
    const r = calc(s.fuel, s.tenths, s.street);
    const value = litres(s.tenths * 10);

    els.out.textContent = value;
    range.setAttribute('aria-valuetext', value.replace(NB + 'л', ' литра'));
    els.dec.disabled = s.tenths <= MIN;
    els.inc.disabled = s.tenths >= MAX;

    els.need.textContent = litres(r.need);
    els.limit.textContent = litres(r.limit, true);
    els.fill.style.setProperty('--fill', String(Math.min(1, r.need / r.limit)));
    const why = explain(s, r);
    els.why.innerHTML = why;
    // строка под названием ES-19: предел для выбранного топлива (оба варианта стоят в разметке)
    all('[data-pick-fuel]').forEach((el) => { el.hidden = el.getAttribute('data-pick-fuel') !== s.fuel; });

    if (r.id !== shown) showModel(r.id, !silent);

    if (!silent) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => J.announce(`Подойдёт ${cat[r.id].short}, ${J.formatPrice(cat[r.id].price)}. ${els.why.textContent}`), 600);
    }
  }

  /* ---------- Вопросы ---------- */
  range.addEventListener('input', () => update());
  root.addEventListener('change', (e) => { if (e.target.matches('input[type="radio"]')) update(); });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-step]');
    if (!btn || btn.disabled) return;
    const next = Math.min(MAX, Math.max(MIN, readState().tenths + Number(btn.getAttribute('data-pick-step'))));
    range.value = (next / 10).toFixed(1);
    J.setRangeFill(range);
    update();
  });

  /* ---------- Шпаргалка: те же calc() и litres() ---------- */
  all('[data-pick-row]').forEach((tr) => {
    const fuel = tr.getAttribute('data-fuel') === 'diesel' ? 'diesel' : 'petrol';
    const tenths = Math.round(parseFloat(tr.getAttribute('data-volume')) * 10);
    const r = calc(fuel, tenths, tr.getAttribute('data-parking') === 'street');
    const need = tr.querySelector('[data-pick-row-need]');
    const model = tr.querySelector('[data-pick-row-model]');
    const tpl = document.querySelector(`template[data-pick-cell="${r.id}"]`);
    if (need) need.textContent = litres(r.need);
    if (model && tpl) model.replaceChildren(tpl.content.cloneNode(true));
  });

  /* ---------- Нижняя панель: видна, пока кнопка в блоке результата за экраном; у футера прячется ---------- */
  const bar = document.querySelector('[data-pick-bar]');
  const buy = root.querySelector('[data-pick-buy]');
  const footer = document.querySelector('.footer');
  if (bar && buy && 'IntersectionObserver' in window) {
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => seen.set(en.target, en.isIntersecting));
      bar.classList.toggle('is-open', !seen.get(buy) && !seen.get(footer));
    }, { rootMargin: '-60px 0px -72px 0px' });
    io.observe(buy);
    if (footer) io.observe(footer);
  }

  /* ---------- Запуск ---------- */
  // браузер мог восстановить значения полей (назад по истории): пересчитываем по тому, что стоит в форме
  const sync = () => { J.setRangeFill(range); update({ silent: true }); };
  sync();
  window.addEventListener('pageshow', sync);
})();
