/* Хаб «Пусковые устройства».
   «В корзину», корзину и аккордеон ведёт main.js. Здесь одно: карточка товара помнит, что модель уже в корзине,
   и показывает «В корзине: 2 шт.» (клик открывает корзину). Состояние берётся из JOIM.cart и переживает перезагрузку. */
(() => {
  'use strict';

  const JOIM = window.JOIM;
  if (!JOIM || !JOIM.cart) return;

  const NBSP = ' ';
  const marks = Array.from(document.querySelectorAll('[data-hub-incart]'));
  if (!marks.length) return;

  const sync = () => {
    const qty = {};
    JOIM.cart.items().forEach((it) => { qty[it.id] = it.qty; });
    marks.forEach((el) => {
      const n = qty[el.getAttribute('data-hub-incart')] || 0;
      if (n > 0) el.textContent = 'В' + NBSP + 'корзине: ' + n + NBSP + 'шт.';
      el.hidden = n === 0;
    });
  };

  document.addEventListener('cart:change', sync);
  sync();
})();
