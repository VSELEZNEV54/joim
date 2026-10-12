/* Сравнение ES-19 и ES-29: переключатель «Только отличия» (в шапке таблицы и в липкой панели),
   липкая панель с товарами (от 768 px), нижняя панель покупки на телефоне, разница в цене в блоке «Кому какая».
   Корзину и кнопки «В корзину» ведёт main.js. */
(() => {
  'use strict';

  const J = window.JOIM || {};
  const root = document.querySelector('[data-cmp]');
  const table = root && root.querySelector('[data-cmp-table]');
  if (!table) return;

  const plural = J.plural || ((n, forms) => forms[2]);
  const announce = J.announce || (() => {});

  /* ---------- Роли таблицы ----------
     На телефоне строки перестроены через display: grid. Явные роли сохраняют таблицу
     для скринридеров в браузерах, которые при этом теряют её семантику. */
  table.setAttribute('role', 'table');
  table.querySelectorAll('thead, tbody').forEach((el) => el.setAttribute('role', 'rowgroup'));
  table.querySelectorAll('tr').forEach((el) => el.setAttribute('role', 'row'));
  table.querySelectorAll('td').forEach((el) => el.setAttribute('role', 'cell'));
  table.querySelectorAll('th').forEach((el) => {
    // название группы (scope="rowgroup") озаглавливает строки своей группы, а не столбцы
    const scope = el.getAttribute('scope');
    const rowish = scope === 'row' || scope === 'rowgroup';
    el.setAttribute('role', rowish ? 'rowheader' : 'columnheader');
    if (el.colSpan > 1) el.setAttribute('aria-colspan', String(el.colSpan));
  });

  /* ---------- Дефисы в значениях ----------
     Type-C и Micro-USB приходят из справочника с обычным дефисом, и в узкой колонке телефона
     строка рвётся по нему. Если одна из частей слова короткая, дефис становится неразрывным;
     длинные составные слова («литий-полимерная») переносятся как обычно. */
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.includes('-') || !node.parentElement.closest('tbody td')) continue;
    node.nodeValue = node.nodeValue.replace(/([0-9A-Za-zА-Яа-яЁё]+)-([0-9A-Za-zА-Яа-яЁё]+)/g,
      (word, left, right) => (left.length <= 3 || right.length <= 3 ? `${left}\u2011${right}` : word));
  }

  /* ---------- «Только отличия» ----------
     Тумблеров два: в шапке таблицы и в липкой панели. Состояние у них общее. */
  const SAME = 'cmp-table__row--same';
  const toggles = Array.from(root.querySelectorAll('[data-cmp-diff]'));
  const counters = Array.from(root.querySelectorAll('[data-cmp-count]'));
  const groups = Array.from(table.tBodies);
  const rows = Array.from(table.querySelectorAll('tbody tr')).filter((tr) => !tr.classList.contains('cmp-table__group'));
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const forms = ['параметр', 'параметра', 'параметров'];
  const NBSP = '\u00a0';

  // строка совпадает, если значения двух моделей одинаковы
  rows.forEach((tr) => {
    const cells = tr.querySelectorAll('td');
    tr.classList.toggle(SAME, cells.length === 2 && text(cells[0]) === text(cells[1]));
  });
  const total = rows.length;
  const different = rows.filter((tr) => !tr.classList.contains(SAME)).length;

  let diffOn = toggles.some((el) => el.checked);

  // Строка под липкой панелью, которая видна в обоих режимах: после переключения она остаётся на месте.
  // Если ниже панели таких строк уже нет (конец таблицы), на месте остаётся сноска под таблицей.
  function anchorRow() {
    const shownBar = root.querySelector('.cmp-bar--on');
    if (!shownBar || !shownBar.offsetHeight) return null; // панели нет на экране (или это телефон): таблица не сдвинется под рукой
    const edge = shownBar.getBoundingClientRect().bottom;
    return rows.find((tr) => !tr.classList.contains(SAME) && tr.getBoundingClientRect().top >= edge) || root.querySelector('.cmp-note');
  }

  function applyDiff(byUser) {
    const on = diffOn;
    toggles.forEach((el) => { el.checked = on; });
    const anchor = byUser ? anchorRow() : null;
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    table.classList.toggle('cmp-table--diff', on);
    // группа без единой строки прячется вместе с заголовком
    groups.forEach((body) => {
      const left = Array.from(body.rows).some((tr) => !tr.classList.contains('cmp-table__group') && !(on && tr.classList.contains(SAME)));
      body.hidden = !left;
    });
    const label = on ? `${different} из${NBSP}${total}${NBSP}${plural(total, forms)}` : `${total}${NBSP}${plural(total, forms)}`;
    counters.forEach((el) => { el.textContent = label; });
    if (!byUser) return;
    if (anchor) {
      // строки выше скрылись или вернулись: возвращаем страницу так, чтобы взгляд остался на той же строке
      const shift = Math.round(anchor.getBoundingClientRect().top - before);
      if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
    }
    table.classList.remove('cmp-table--swap');
    void table.offsetWidth; // перезапуск перехода
    table.classList.add('cmp-table--swap');
    announce(on ? `Показаны только отличия: ${different} ${plural(different, forms)}` : `Показаны все параметры: ${total}`);
    update();
  }
  toggles.forEach((el) => {
    // все строки совпадают или все различаются: переключать нечего
    el.disabled = different === 0 || different === total;
    el.addEventListener('change', () => { diffOn = el.checked; applyDiff(true); });
  });

  /* ---------- «Кому какая»: разница в цене из справочника товаров ---------- */
  const saveEl = document.querySelector('[data-cmp-save]');
  const cat = J.catalog;
  if (saveEl && cat && cat.es19 && cat.es29 && J.formatPrice) {
    const save = cat.es29.price - cat.es19.price;
    if (save > 0) saveEl.textContent = ` на${NBSP}${J.formatPrice(save)}`;
  }
  table.addEventListener('animationend', () => table.classList.remove('cmp-table--swap'));

  /* ---------- Липкая панель и нижняя панель покупки ----------
     Верхняя появляется, когда карточки товаров ушли под шапку сайта, и уходит вместе с таблицей.
     Нижняя (телефон) видна, пока таблица на экране, а кнопок из её шапки не видно. */
  const header = document.querySelector('.header');
  const bar = root.querySelector('[data-cmp-bar]');
  const buy = document.querySelector('[data-cmp-buy]');
  const headRow = table.tHead;
  const headBtn = headRow && headRow.querySelector('[data-add-to-cart]');
  let ticking = false;

  function setOn(el, cls, on) {
    if (!el || el.classList.contains(cls) === on) return;
    // фокус не должен остаться на спрятанной кнопке
    if (!on && el.contains(document.activeElement)) document.activeElement.blur();
    el.classList.toggle(cls, on);
  }

  function update() {
    ticking = false;
    if (!headRow) return;
    const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const vh = window.innerHeight;
    const area = table.getBoundingClientRect();
    const head = headRow.getBoundingClientRect();
    const barH = bar ? bar.offsetHeight : 0;

    setOn(bar, 'cmp-bar--on', head.bottom < top + 8 && area.bottom > top + barH + 24);

    if (buy) {
      const btn = headBtn ? headBtn.getBoundingClientRect() : head;
      // кнопка считается видимой, когда по ней уже можно попасть пальцем
      const btnSeen = btn.bottom > top + 16 && btn.top < vh - 16;
      const areaSeen = area.top < vh - 96 && area.bottom > top + 96;
      setOn(buy, 'cmp-buy--on', areaSeen && !btnSeen);
    }
  }
  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // возврат по истории: браузер мог восстановить положение одного из тумблеров
  window.addEventListener('pageshow', () => { diffOn = toggles.some((el) => el.checked); applyDiff(false); schedule(); });

  applyDiff(false);
  update();
})();
