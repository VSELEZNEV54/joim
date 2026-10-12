/* favorites: страница избранного. Список лежит в localStorage (JOIM.fav), плитки готовые: JOIM.cardHtml(id).
   Сетка: товары из избранного в порядке добавления. Ряд «Вам может быть интересно»: до четырёх товаров, которых в избранном нет,
   в порядке каталога. Обе части пересобираются по событию fav:change (сердце на этой странице, другая вкладка, очистка). */
(() => {
  'use strict';
  const J = window.JOIM;
  const grid = document.querySelector('[data-fav-grid]');
  if (!J || !grid) return;

  const empty = document.querySelector('[data-fav-empty]');
  const summary = document.querySelector('[data-fav-summary]');
  const clearBtn = document.querySelector('[data-fav-clear]');
  const more = document.querySelector('[data-fav-more]');
  const moreSection = document.querySelector('[data-fav-more-section]');
  const NB = ' ';
  const MORE_MAX = 4;
  const cards = (ids) => ids.map((id) => `<li data-id="${id}">${J.cardHtml(id)}</li>`).join('');
  const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

  let shown = null;      // что сейчас стоит в сетке
  let shownMore = null;  // и в нижнем ряду

  function render() {
    const ids = J.fav.items();
    const rest = J.order.filter((id) => !ids.includes(id)).slice(0, MORE_MAX);

    // фокус стоял на сердце плитки, которая сейчас переедет или исчезнет: после пересборки возвращаем его на то же сердце или на соседнее
    const active = document.activeElement && document.activeElement.closest('[data-fav]');
    const activeId = active && (grid.contains(active) || (more && more.contains(active))) ? active.getAttribute('data-fav') : null;
    const activeIndex = active && grid.contains(active) ? Array.from(grid.children).findIndex((li) => li.contains(active)) : -1;

    if (!shown || !same(shown, ids)) {
      const before = shown || ids;
      grid.innerHTML = cards(ids);
      // подсветка только для товара, добавленного на этой странице
      if (shown) Array.from(grid.children).forEach((li) => { if (!before.includes(li.getAttribute('data-id'))) li.classList.add('is-new'); });
      J.fav.sync(grid);
      shown = ids;
    }
    grid.hidden = ids.length === 0;
    if (empty) empty.hidden = ids.length > 0;
    if (clearBtn) clearBtn.hidden = ids.length === 0;
    if (summary) summary.textContent = ids.length ? `${ids.length}${NB}${J.plural(ids.length, ['товар', 'товара', 'товаров'])}` : '';

    if (more && (!shownMore || !same(shownMore, rest))) {
      more.innerHTML = cards(rest);
      J.fav.sync(more);
      shownMore = rest;
    }
    if (moreSection) moreSection.hidden = rest.length === 0;

    if (activeId && !document.activeElement.closest('[data-fav]')) {
      const again = document.querySelector(`main [data-fav="${activeId}"]`);
      const near = grid.children[Math.min(Math.max(activeIndex, 0), grid.children.length - 1)];
      const target = again || (near && near.querySelector('[data-fav]')) || (empty && !empty.hidden && empty.querySelector('a'));
      if (target) target.focus({ preventScroll: true });
    }
  }

  if (clearBtn) clearBtn.addEventListener('click', () => {
    J.fav.clear();
    J.announce('Избранное очищено');
    const link = empty && empty.querySelector('a');
    if (link) link.focus({ preventScroll: true });
  });

  render();
  document.addEventListener('fav:change', render);
  window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
})();
