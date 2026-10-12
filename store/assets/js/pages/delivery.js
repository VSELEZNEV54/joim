/* delivery: строка чипов-якорей на странице «Доставка и оплата» (src/pages/delivery.html).
   Активный чип идёт за прокруткой; пока строка прилипла под шапкой, у неё появляется линия снизу. Без скрипта чипы остаются обычными якорями. */
(function () {
  'use strict';

  var nav = document.querySelector('[data-dlv-nav]');
  if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  var sections = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  if (!links.length || sections.some(function (s) { return !s; })) return;
  var frame = 0;
  var forced = -1;
  var forcedTimer = 0;

  function setActive(i) {
    links.forEach(function (a, n) {
      if (n === i) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  function update() {
    frame = 0;
    var navBox = nav.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(nav).top) || 0;
    nav.classList.toggle('is-stuck', navBox.top <= top + 0.5 && window.scrollY > 0);
    if (forced >= 0) return;
    // активен раздел, который пересёк линию под строкой чипов; в самом низу страницы активен последний
    var line = navBox.bottom + 40;
    var current = 0;
    sections.forEach(function (s, n) { if (s.getBoundingClientRect().top <= line) current = n; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      var last = sections[sections.length - 1].getBoundingClientRect();
      if (last.top < window.innerHeight * 0.6) current = sections.length - 1;
    }
    setActive(current);
  }

  function onScroll() { if (!frame) frame = window.requestAnimationFrame(update); }

  // клик по чипу: он сразу активен, а пока страница едет к разделу, прокрутка его не перебивает
  links.forEach(function (a, n) {
    a.addEventListener('click', function () {
      forced = n;
      setActive(n);
      window.clearTimeout(forcedTimer);
      forcedTimer = window.setTimeout(function () { forced = -1; update(); }, 900);
    });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
