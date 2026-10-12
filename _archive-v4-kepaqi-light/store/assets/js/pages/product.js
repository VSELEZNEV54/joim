/* product: скрипт карточки товара (src/templates/product.html).
   Галерея (стрелки, миниатюры, свайп через scroll-snap, клавиши, видео по клику, запасной адрес для лёгких копий кадров), счётчик количества,
   липкая панель покупки на узком экране, стрелки ленты отзывов. Корзина, избранное, окна и аккордеон живут в main.js. */
(function () {
  'use strict';

  var doc = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (sel, root) { return (root || doc).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

  /* ---------- Галерея ---------- */
  function initGallery(box) {
    var track = $('[data-gallery-track]', box);
    // кадры, скрытые стилями (общий план у товаров «скоро»), в листании не участвуют: у них нет ни места в ленте, ни миниатюры
    var shown = function (el) { return el.offsetWidth > 0; };
    var slides = $$('[data-gallery-slide]', box).filter(shown);
    var thumbs = $$('[data-gallery-thumb]', box).filter(shown);
    var thumbsBox = $('[data-gallery-thumbs]', box);
    var prev = $('[data-gallery-prev]', box);
    var next = $('[data-gallery-next]', box);
    var counter = $('[data-gallery-current]', box);
    if (!track || !slides.length) return;
    var index = 0;
    var frame = 0;
    var lock = 0;

    function stopVideo(slide) {
      var video = $('video', slide);
      if (video && !video.paused) video.pause();
    }

    // миниатюра активного кадра всегда видна в своей ленте (страницу при этом не двигаем)
    function revealThumb(btn) {
      if (!thumbsBox || thumbsBox.scrollWidth <= thumbsBox.clientWidth + 1) return;
      var item = btn.parentElement;
      var left = item.offsetLeft - thumbsBox.offsetLeft;
      var pad = 16;
      var to = null;
      if (left - pad < thumbsBox.scrollLeft) to = left - pad;
      else if (left + item.offsetWidth + pad > thumbsBox.scrollLeft + thumbsBox.clientWidth) to = left + item.offsetWidth + pad - thumbsBox.clientWidth;
      if (to !== null) thumbsBox.scrollTo({ left: Math.max(0, to), behavior: reduce.matches ? 'auto' : 'smooth' });
    }

    function setActive(i) {
      if (i !== index) stopVideo(slides[index]);
      index = i;
      thumbs.forEach(function (btn, n) {
        var on = n === i;
        btn.classList.toggle('is-active', on);
        if (on) { btn.setAttribute('aria-current', 'true'); revealThumb(btn); }
        else btn.removeAttribute('aria-current');
      });
      if (counter) counter.textContent = String(i + 1);
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
    }

    function unlock() { window.clearTimeout(lock); lock = 0; }

    function sync() {
      frame = 0;
      if (lock) return;
      var width = track.clientWidth;
      if (!width) return;
      var i = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
      if (i !== index) setActive(i);
    }

    // Переход по кнопке или миниатюре: состояние меняется сразу, а пока лента едет, события прокрутки его не трогают.
    function go(i, instant) {
      var to = Math.max(0, Math.min(slides.length - 1, i));
      var smooth = !(instant || reduce.matches);
      setActive(to);
      unlock();
      if (smooth) lock = window.setTimeout(function () { lock = 0; sync(); }, 800);
      track.scrollTo({ left: to * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    }

    track.addEventListener('scroll', function () {
      if (!frame) frame = window.requestAnimationFrame(sync);
    }, { passive: true });
    track.addEventListener('scrollend', function () { unlock(); sync(); });
    // палец или колесо перехватывают ленту: дальше состояние снова идёт за прокруткой
    ['touchstart', 'wheel'].forEach(function (type) { track.addEventListener(type, unlock, { passive: true }); });

    // остальные кадры подгружаются заранее при первом обращении к галерее: листание без пустых окон
    var warmed = false;
    function warm() {
      if (warmed) return;
      warmed = true;
      slides.forEach(function (slide) {
        $$('img[loading="lazy"]', slide).forEach(function (img) { img.loading = 'eager'; });
      });
    }
    ['pointerenter', 'touchstart', 'focusin'].forEach(function (type) {
      box.addEventListener(type, warm, { passive: true, once: true });
    });

    thumbs.forEach(function (btn, n) {
      btn.addEventListener('click', function () { warm(); go(n); });
    });
    if (prev) prev.addEventListener('click', function () { warm(); go(index - 1); });
    if (next) next.addEventListener('click', function () { warm(); go(index + 1); });

    // стрелки клавиатуры, когда фокус в окне галереи (кроме плеера: там они перематывают ролик)
    box.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'VIDEO') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });

    // видео: ролик начинает грузиться только после клика по постеру
    $$('[data-video-play]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var video = $('video', btn.parentElement);
        if (!video) return;
        video.hidden = false;
        btn.hidden = true;
        var started = video.play();
        if (started && typeof started.catch === 'function') started.catch(function () { /* автозапуск запрещён: остаются кнопки плеера */ });
        video.focus({ preventScroll: true });
      });
    });

    // лёгкие копии кадров (миниатюра .thumb.webp, комплект .webp): если файла нет, ставим исходный кадр из data-full
    function fallback(img) {
      var full = img.getAttribute('data-full');
      if (!full || img.getAttribute('src') === full) return;
      img.removeAttribute('data-full');
      img.src = full;
      var link = img.closest('[data-lightbox]');
      if (link) link.setAttribute('href', full);
    }
    box.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') fallback(e.target);
    }, true);
    $$('img[data-full]', box).forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fallback(img);
    });

    // лента миниатюр в одну строку: пока справа есть скрытые миниатюры, её правый край тает
    function markThumbs() {
      if (!thumbsBox) return;
      var rest = thumbsBox.scrollWidth - thumbsBox.clientWidth - thumbsBox.scrollLeft;
      thumbsBox.classList.toggle('has-more', rest > 8);
    }
    if (thumbsBox) thumbsBox.addEventListener('scroll', markThumbs, { passive: true });

    // после поворота экрана и смены ширины окно остаётся на своём кадре
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { track.scrollLeft = index * track.clientWidth; markThumbs(); }, 120);
    });

    setActive(0);
    markThumbs();
  }

  /* ---------- Количество: значение уходит кнопкам «В корзину» через data-qty ---------- */
  function initQty() {
    var box = $('[data-qty-box]');
    if (!box) return;
    var dec = $('[data-qty-dec]', box);
    var inc = $('[data-qty-inc]', box);
    var out = $('[data-qty-val]', box);
    var MAX = 99;
    var value = 1;
    function set(v) {
      value = Math.max(1, Math.min(MAX, v));
      out.textContent = String(value);
      dec.disabled = value <= 1;
      inc.disabled = value >= MAX;
      $$('.pdp [data-add-to-cart], .pdp-bar [data-add-to-cart]').forEach(function (btn) { btn.setAttribute('data-qty', String(value)); });
    }
    dec.addEventListener('click', function () { set(value - 1); });
    inc.addEventListener('click', function () { set(value + 1); });
    set(1);
  }

  /* ---------- Липкая панель покупки ----------
     Видна, пока основной кнопки нет на экране. Над формой внизу страницы и над футером прячется: не закрывает поля и ссылки. */
  function initBar() {
    var bar = $('[data-buy-bar]');
    var buy = $('[data-buy]');
    if (!bar || !buy || !('IntersectionObserver' in window)) return;
    var state = { buy: true, end: false };
    var apply = function () { bar.classList.toggle('is-visible', !state.buy && !state.end); };
    // «на экране» значит видна хотя бы половина ряда с кнопкой, а не его краешек
    new IntersectionObserver(function (entries) {
      state.buy = entries[entries.length - 1].intersectionRatio >= 0.5;
      apply();
    }, { rootMargin: '-88px 0px 0px 0px', threshold: [0, 0.5, 1] }).observe(buy);
    var seen = [];
    var endIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var i = seen.indexOf(entry.target);
        if (entry.isIntersecting && i < 0) seen.push(entry.target);
        if (!entry.isIntersecting && i >= 0) seen.splice(i, 1);
      });
      state.end = seen.length > 0;
      apply();
    }, { rootMargin: '0px 0px -120px 0px' });
    $$('.pdp-ask__card, .footer').forEach(function (el) { endIo.observe(el); });
  }

  /* ---------- Отзывы: стрелки не нужны, если все карточки помещаются ---------- */
  function initReviews() {
    var track = $('.pdp-reviews__track');
    var nav = $('.pdp-reviews__nav');
    if (!track || !nav) return;
    var check = function () { nav.classList.toggle('is-static', track.scrollWidth <= track.clientWidth + 2); };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('load', check);
  }

  function init() {
    $$('[data-gallery]').forEach(initGallery);
    initQty();
    initBar();
    initReviews();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
