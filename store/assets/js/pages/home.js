/* home: печатающийся хвост заголовка первого экрана.
   В разметке заголовок всегда полный. Скрипт делит хвост на «напечатанную» и «ещё не напечатанную» части:
   вторая остаётся в потоке прозрачной, поэтому строки не прыгают, а скринридер читает заголовок целиком.
   При prefers-reduced-motion ничего не делаем: текст стоит сразу. Ленту отзывов ведёт общий data-slider из main.js. */
(() => {
  'use strict';
  const el = document.querySelector('[data-type]');
  if (!el) return;
  const text = el.textContent;
  if (!text || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const done = document.createElement('span');
  const caret = document.createElement('span');
  const rest = document.createElement('span');
  done.className = 'type__done';
  caret.className = 'type__caret';
  caret.setAttribute('aria-hidden', 'true');
  rest.className = 'type__rest';
  rest.textContent = text;
  el.textContent = '';
  el.append(done, caret, rest);
  el.classList.add('is-typing');

  let i = 0;
  const step = () => {
    i += 1;
    done.textContent = text.slice(0, i);
    rest.textContent = text.slice(i);
    if (i >= text.length) { el.classList.add('is-typed'); return; }
    const pause = /[,.:]/.test(text[i - 1]) ? 260 : 0; // после запятой короткая пауза
    setTimeout(step, 42 + Math.random() * 26 + pause);
  };
  setTimeout(step, 600);
})();
