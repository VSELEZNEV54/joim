/* product-es19: скрипт страницы /product/joim-easy-start-es19/
   Галерея (миниатюры, свайп на телефоне, видео по клику) · под-навигация (текущий раздел, цена и кнопка
   после прокрутки) · нижняя панель покупки на телефоне · сброс формы «Купить в 1 клик» после закрытия окна. */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => (reduced.matches ? 'auto' : 'smooth');

  /* ---------- Галерея ----------
     На десктопе кадры лежат стопкой и меняются по клику на миниатюру.
     На телефоне лента кадров листается пальцем (scroll-snap), миниатюры и счётчик идут следом. */
  const gallery = $('[data-gallery]');
  if (gallery) {
    const track = $('[data-gallery-track]', gallery);
    const frames = $$('[data-frame]', track);
    const strip = $('[data-gallery-thumbs]', gallery);
    const thumbs = $$('[data-thumb]', gallery);
    const counter = $('[data-gallery-current]', gallery);
    const video = $('video', gallery);
    const playBtn = $('[data-video-play]', gallery);
    let active = 0;
    let target = -1;      // кадр, к которому лента едет после клика по миниатюре
    let targetTimer = 0;

    const isSwipe = () => track.scrollWidth > track.clientWidth + 1;

    // активная миниатюра всегда видна в своей ленте (страницу при этом не двигаем)
    const revealThumb = (i) => {
      const item = thumbs[i] && thumbs[i].parentElement;
      if (!item || strip.scrollWidth <= strip.clientWidth + 1) return;
      const left = item.offsetLeft, right = left + item.offsetWidth, pad = 24;
      const max = strip.scrollWidth - strip.clientWidth;
      let to = null;
      if (left - pad < strip.scrollLeft) to = i === 0 ? 0 : left - pad;
      else if (right + pad > strip.scrollLeft + strip.clientWidth) to = i === thumbs.length - 1 ? max : right + pad - strip.clientWidth;
      if (to !== null) strip.scrollTo({ left: Math.max(0, Math.min(max, to)), behavior: behavior() });
    };

    const setActive = (i, { scroll = true } = {}) => {
      const next = Math.max(0, Math.min(frames.length - 1, i));
      if (next !== active && video && !video.paused && frames[active].contains(video)) video.pause();
      active = next;
      frames.forEach((f, n) => f.classList.toggle('is-active', n === active));
      thumbs.forEach((t, n) => {
        t.classList.toggle('is-active', n === active);
        if (n === active) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
      });
      if (counter) counter.textContent = String(active + 1);
      revealThumb(active);
      if (scroll && isSwipe()) {
        // пока лента едет к выбранному кадру, промежуточные кадры активными не становятся
        target = active;
        clearTimeout(targetTimer);
        targetTimer = setTimeout(() => { target = -1; }, 800);
        track.scrollTo({ left: frames[active].offsetLeft, behavior: behavior() });
      }
    };

    thumbs.forEach((t, i) => t.addEventListener('click', () => setActive(i)));

    // стрелки влево и вправо на миниатюрах
    strip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = thumbs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = Math.max(0, Math.min(thumbs.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
      e.preventDefault();
      thumbs[next].focus({ preventScroll: true });
      setActive(next);
    });

    // свайп: активным становится кадр, ближайший к левому краю ленты
    let ticking = false;
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!isSwipe()) return;
        if (target >= 0) {
          if (Math.abs(frames[target].offsetLeft - track.scrollLeft) < 2) target = -1;
          return;
        }
        let best = 0, dist = Infinity;
        frames.forEach((f, n) => { const d = Math.abs(f.offsetLeft - track.scrollLeft); if (d < dist) { dist = d; best = n; } });
        if (best !== active) setActive(best, { scroll: false });
      });
    }, { passive: true });

    // смена раскладки (поворот, ширина окна): лента встаёт на активный кадр
    window.matchMedia('(max-width: 767px)').addEventListener('change', () => {
      track.scrollLeft = isSwipe() ? frames[active].offsetLeft : 0;
    });

    // видео: до клика по постеру файл не запрашивается (preload="none")
    if (video && playBtn) {
      playBtn.addEventListener('click', () => {
        playBtn.hidden = true;
        video.hidden = false;
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* автозапуск запрещён: остаются штатные кнопки плеера */ });
        video.focus({ preventScroll: true });
      });
    }
  }

  /* ---------- Под-навигация: текущий раздел, цена и кнопка после прокрутки ---------- */
  const nav = $('[data-pdp-nav]');
  const actions = $('[data-buy-actions]');
  const bar = $('[data-buy-bar]');

  if (nav) {
    const list = $('[data-pdp-nav-list]', nav);
    const links = $$('a[href^="#"]', list);
    const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
    let current = -1;

    const spy = () => {
      const style = getComputedStyle(nav);
      let found = -1;
      // на телефоне под-навигация не липкая: раздел не отмечаем
      if (style.position === 'sticky') {
        // линия под прилипшей панелью: раздел считается текущим, когда его верх поднялся до неё
        const line = (parseFloat(style.top) || 0) + nav.offsetHeight + 28;
        sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= line) found = i; });
        const last = sections[found];
        if (last && last.getBoundingClientRect().bottom <= line) found = -1;
      }
      if (found === current) return;
      current = found;
      links.forEach((a, i) => { if (i === current) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      // на узком экране список прокручивается: текущий пункт остаётся на виду, без текущего список возвращается в начало
      if (list.scrollWidth > list.clientWidth + 1) {
        const a = links[current];
        if (!a) { list.scrollTo({ left: 0, behavior: behavior() }); return; }
        const box = list.getBoundingClientRect(), r = a.getBoundingClientRect();
        if (r.left < box.left) list.scrollBy({ left: r.left - box.left - 16, behavior: behavior() });
        else if (r.right > box.right) list.scrollBy({ left: r.right - box.right + 16, behavior: behavior() });
      }
    };
    let spyTick = false;
    const onScroll = () => {
      if (spyTick) return;
      spyTick = true;
      requestAnimationFrame(() => { spyTick = false; spy(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    spy();
  }

  /* Кнопки блока покупки ушли вверх под шапку: показываем цену и кнопку в под-навигации.
     Кнопки на экране: нижняя панель на телефоне не нужна. */
  if (actions && 'IntersectionObserver' in window) {
    const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
    if (nav) {
      new IntersectionObserver(([e]) => {
        nav.classList.toggle('is-buy', !e.isIntersecting && e.boundingClientRect.top < headerH() + 56);
      }, { rootMargin: `-${headerH() + 56}px 0px 0px 0px` }).observe(actions);
    }
    if (bar) {
      new IntersectionObserver(([e]) => {
        bar.classList.toggle('is-hidden', e.isIntersecting);
      }, { rootMargin: '0px 0px -72px 0px' }).observe(actions);
    }
  }

  /* ---------- Характеристики на телефоне: вторая таблица раскрывается кнопкой ----------
     На экранах шире 599 px кнопки нет, таблица видна всегда (см. CSS). */
  const specsBtn = $('[data-specs-toggle]');
  const specsMore = $('[data-specs-more]');
  if (specsBtn && specsMore) {
    specsBtn.addEventListener('click', () => {
      const open = !specsMore.classList.contains('is-open');
      specsMore.classList.toggle('is-open', open);
      specsBtn.setAttribute('aria-expanded', String(open));
      specsBtn.textContent = open ? 'Свернуть характеристики' : 'Все характеристики';
      // после сворачивания кнопка остаётся на экране
      if (!open) {
        const settle = () => { if (specsBtn.getBoundingClientRect().top < 72) specsBtn.scrollIntoView({ block: 'center', behavior: 'auto' }); };
        setTimeout(settle, reduced.matches ? 0 : 300);
      }
    });
  }

  /* ---------- «Купить в 1 клик»: после закрытия окна отправленная форма возвращается в исходное состояние ---------- */
  const dialog = document.getElementById('one-click');
  const form = dialog && $('[data-one-click-form]', dialog);
  if (form) {
    dialog.addEventListener('dialog:close', () => {
      if (!form.classList.contains('is-sent')) return;
      form.reset();
      form.classList.remove('is-sent');
      const ok = $('[data-form-success]', form);
      if (ok) ok.hidden = true;
    });
  }
})();
