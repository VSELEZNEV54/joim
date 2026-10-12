/* cart: страница корзины /cart/ (бриф, раздел 7а).
   Рисует список из window.JOIM.cart и обновляет его по событию cart:change (эта страница, другая вкладка, возврат по истории).
   Три состояния: товары и сводка · пусто · «Заявка принята» (после успешной проверки формы корзина очищается).
   Кнопки количества и удаления (data-cart-inc, data-cart-dec, data-cart-remove внутри строки с data-id) и проверку формы
   (data-form) ведёт main.js; здесь: строки, сводка, порог бесплатной доставки, ряд плиток, липкая сводка и нижняя панель. */
(() => {
  'use strict';
  const J = window.JOIM;
  const box = document.querySelector('[data-cart-page]');
  if (!J || !box) return;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const list = $('[data-cart-list]', box);
  const fulls = $$('[data-cart-full]', box); // список и сводка
  const empty = $('[data-cart-empty]', box);
  const done = $('[data-cart-done]', box);
  const doneTitle = $('[data-cart-done-title]', box);
  const doneOrder = $('[data-cart-done-order]', box);
  const sum = $('[data-cart-sum]', box);
  const units = $('[data-cart-units]', box);
  const free = $('[data-cart-free]', box);
  const freeFill = $('[data-cart-free-fill]', box);
  const freeText = $('[data-cart-delivery]', box);
  const form = $('[data-cart-form]', box);
  const submit = $('[data-cart-submit]', box);
  const more = $('[data-cart-more]');
  const moreSection = $('[data-cart-more-section]');
  const bar = $('[data-cart-bar]');
  const footer = $('.footer');
  const NB = '\u00A0'; // неразрывный пробел
  const MORE_MAX = 6; // до 2000 px показаны первые четыре плитки, шире — шесть (cart.css)
  const GOODS = ['товар', 'товара', 'товаров'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Строка товара ---------- */
  // рендер в строке: та же плитка, что в карточке товара (подгонка кадра приходит из готовой разметки карточки)
  const tileCache = {};
  function tileOf(id) {
    if (tileCache[id]) return tileCache[id];
    const tpl = document.createElement('template');
    tpl.innerHTML = J.cardHtml(id);
    const tile = tpl.content.querySelector('.tile');
    const img = tile && tile.querySelector('img');
    tileCache[id] = { style: (tile && tile.getAttribute('style')) || '', cls: (img && img.className) || 'tile__img tile__img--tall' };
    return tileCache[id];
  }
  const eachText = (it) => `${it.qty}${NB}×${NB}${J.formatPrice(it.price)}`;

  function itemHtml(it) {
    const t = tileOf(it.id);
    const short = J.escapeHtml(it.short);
    return `
    <li class="cart-item" data-id="${it.id}">
      <a class="cart-item__media tile"${t.style ? ` style="${J.escapeHtml(t.style)}"` : ''} href="${it.url}" tabindex="-1" aria-hidden="true">
        <span class="tile__link"><img class="${t.cls}" src="${it.img}" alt="" width="${it.w}" height="${it.h}" decoding="async"></span>
      </a>
      <div class="cart-item__info">
        <a class="cart-item__name" href="${it.url}">${J.nameHtml(it)}</a>
        ${it.specsHtml ? `<p class="cart-item__specs">${it.specsHtml}</p>` : ''}
        <p class="cart-item__unit"><span class="label">Цена за${NB}штуку</span>${J.formatPrice(it.price)}</p>
      </div>
      <div class="cart-item__buy">
        <div class="qty" role="group" aria-label="Количество: ${short}">
          <button class="qty__btn" type="button" data-cart-dec data-focus-key="${it.id}:dec" aria-label="Уменьшить количество"${it.qty <= 1 ? ' disabled' : ''}>${J.icon('minus')}</button>
          <span class="qty__val" aria-live="polite" data-cart-item-qty>${it.qty}</span>
          <button class="qty__btn" type="button" data-cart-inc data-focus-key="${it.id}:inc" aria-label="Увеличить количество"${it.qty >= 99 ? ' disabled' : ''}>${J.icon('plus')}</button>
        </div>
        <p class="cart-item__sum"><span class="visually-hidden">Сумма: </span><b data-cart-item-sum>${J.formatPrice(it.sum)}</b><span class="cart-item__each" data-cart-item-each${it.qty > 1 ? '' : ' hidden'}>${eachText(it)}</span></p>
      </div>
      <button class="cart-item__remove" type="button" data-cart-remove data-focus-key="${it.id}:remove" aria-label="Удалить из корзины: ${short}">${J.icon('trash')}</button>
    </li>`;
  }

  // состав не изменился: меняются только количество и сумма, строки и картинки остаются на месте
  function patchItem(li, it) {
    const dec = $('[data-cart-dec]', li);
    const inc = $('[data-cart-inc]', li);
    const each = $('[data-cart-item-each]', li);
    // кнопка под фокусом сейчас выключится: переводим фокус на соседнюю
    if (it.qty <= 1 && document.activeElement === dec) inc.focus();
    if (it.qty >= 99 && document.activeElement === inc) dec.focus();
    dec.disabled = it.qty <= 1;
    inc.disabled = it.qty >= 99;
    $('[data-cart-item-qty]', li).textContent = String(it.qty);
    $('[data-cart-item-sum]', li).textContent = J.formatPrice(it.sum);
    each.textContent = eachText(it);
    each.hidden = it.qty <= 1;
  }

  /* ---------- Сводка: число товаров и порог бесплатной доставки ---------- */
  function renderSummary(count, total) {
    if (units) units.textContent = `${count}${NB}${J.plural(count, GOODS)}`;
    const left = J.freeDeliveryFrom - total;
    const isFree = left <= 0;
    if (free) free.classList.toggle('is-free', isFree);
    if (freeFill) freeFill.style.setProperty('--fill', String(Math.max(0, Math.min(1, total / J.freeDeliveryFrom))));
    if (freeText) {
      freeText.innerHTML = isFree
        ? `${J.icon('check')}<span>Доставка курьером по${NB}Москве и${NB}СДЭК бесплатно</span>`
        : `<span>До${NB}бесплатной доставки курьером и${NB}СДЭК осталось <b>${J.formatPrice(left)}</b></span>`;
    }
    // у курьера и СДЭК вместо цены «бесплатно»
    $$('[data-cart-way-paid]', box).forEach((el) => { el.hidden = isFree; });
    $$('[data-cart-way-free]', box).forEach((el) => { el.hidden = !isFree; });
  }

  /* ---------- Ряд плиток: товары, которых в корзине нет, в порядке каталога ---------- */
  let moreKey = null;
  function renderMore(ids) {
    if (!more) return;
    const rest = J.order.filter((id) => !ids.includes(id)).slice(0, MORE_MAX);
    const key = rest.join(',');
    if (key !== moreKey) {
      more.innerHTML = rest.map((id) => `<li data-id="${id}">${J.cardHtml(id)}</li>`).join('');
      J.fav.sync(more);
      moreKey = key;
    }
    if (moreSection) moreSection.hidden = rest.length === 0;
  }

  /* ---------- Состояния ---------- */
  let shown = null;      // id товаров, которые сейчас стоят в списке
  let sent = false;      // заявка принята: вместо «пусто» показано сообщение
  let moreDrawn = false;

  function render() {
    const items = J.cart.items();
    const ids = items.map((it) => it.id);
    if (items.length) sent = false;

    let refocus = null; // после перерисовки списка фокус возвращается на ту же кнопку
    if (shown && shown.length === ids.length && shown.every((id, i) => id === ids[i])) {
      items.forEach((it, i) => patchItem(list.children[i], it));
    } else {
      const active = document.activeElement && list.contains(document.activeElement) ? document.activeElement : null;
      if (active) refocus = { key: active.getAttribute('data-focus-key'), index: Array.from(list.children).findIndex((li) => li.contains(active)) };
      const before = shown;
      list.innerHTML = items.map(itemHtml).join('');
      if (before) Array.from(list.children).forEach((li) => { if (!before.includes(li.getAttribute('data-id'))) li.classList.add('is-new'); });
      shown = ids;
    }

    fulls.forEach((el) => { el.hidden = items.length === 0; });
    empty.hidden = items.length > 0 || sent;
    done.hidden = !(sent && items.length === 0);
    if (items.length) renderSummary(J.cart.count(), J.cart.total());

    // строку удалили: фокус встаёт на удаление соседней строки, а в опустевшей корзине на кнопку «Перейти в каталог»
    if (refocus) {
      const near = list.children[Math.min(Math.max(refocus.index, 0), list.children.length - 1)];
      const target = (refocus.key && $(`[data-focus-key="${refocus.key}"]:not(:disabled)`, list)) || (near && $('[data-cart-remove]', near))
        || (!empty.hidden && $('a.btn', empty)) || $('.cart__back-link', box);
      if (target) target.focus({ preventScroll: true });
    }

    // ряд плиток пересобирается, когда корзина опустела или страница открыта впервые: плитка не исчезает из-под руки
    // сразу после «В корзину»
    if (!moreDrawn || items.length === 0) { renderMore(ids); moreDrawn = true; }

    fitSticky();
    syncBar();
  }

  /* ---------- Оформление: проверку ведёт main.js, после неё приходит form:sent ---------- */
  if (form) form.addEventListener('form:sent', () => {
    const count = J.cart.count();
    const total = J.cart.total();
    if (doneOrder) doneOrder.innerHTML = count ? `В${NB}заявке <b>${count}${NB}${J.plural(count, GOODS)}</b> на${NB}<b>${J.formatPrice(total)}</b>` : '';
    sent = true;
    J.cart.clear(); // придёт cart:change, render() покажет сообщение вместо пустой корзины
    // форма возвращается в исходное состояние: следующий заказ с этой страницы начнётся с чистых полей
    form.reset();
    form.classList.remove('is-sent');
    $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
    $$('.field__error', form).forEach((el) => { el.hidden = true; });
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (doneTitle) doneTitle.focus({ preventScroll: true });
    J.announce(`Заявка принята. Менеджер перезвонит и${NB}подтвердит заказ`);
  });

  /* ---------- Сводка прилипает, пока помещается в окно под шапкой ---------- */
  const desktop = window.matchMedia('(min-width: 1024px)');
  function fitSticky() {
    if (!sum) return;
    const header = $('.header');
    const top = (header ? header.getBoundingClientRect().height : 0) + ($('.topbar') ? $('.topbar').getBoundingClientRect().height : 0);
    sum.classList.toggle('is-sticky', desktop.matches && !sum.hidden && sum.offsetHeight <= window.innerHeight - top - 40);
  }

  /* ---------- Нижняя панель: видна, пока кнопка формы за экраном; у футера прячется ---------- */
  const seen = new Map();
  function syncBar() {
    if (!bar) return;
    const open = !!sum && !sum.hidden && !seen.get(submit) && !seen.get(footer);
    if (!open && bar.contains(document.activeElement)) document.activeElement.blur();
    bar.classList.toggle('is-open', open);
  }
  if (bar && submit && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => seen.set(en.target, en.isIntersecting));
      syncBar();
    }, { rootMargin: '-60px 0px -72px 0px' });
    io.observe(submit);
    if (footer) io.observe(footer);
  }
  // «Оформить» в панели: страница едет к форме, фокус встаёт в первое поле
  const go = $('[data-cart-go]');
  if (go && form) go.addEventListener('click', (e) => {
    e.preventDefault();
    form.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
    const first = $('input', form);
    if (first) first.focus({ preventScroll: true });
  });

  document.addEventListener('cart:change', render);
  window.addEventListener('resize', fitSticky);
  // высота сводки меняется, когда форма показывает ошибки полей
  if (sum && 'ResizeObserver' in window) new ResizeObserver(fitSticky).observe(sum);
  render();
})();
