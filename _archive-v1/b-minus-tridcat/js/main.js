/* JOIM, вариант B. Ванильный JS без зависимостей. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const NB = ' ';
  const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

  const GOODS = {
    es19: { name: 'ES-19', note: 'хит продаж', price: 5837, url: '/product/joim-easy-start-es19' },
    es29: { name: 'ES-29', note: 'для дизеля', price: 7604, url: '/product/joim-easy-start-es29' },
    pvc1: { name: 'PVC-1', note: 'автопылесос', price: 7281, url: '/product/joim-pvc1' },
  };
  // липкая панель на телефоне показывает модель по контексту
  const barCtx = { picked: null, pvc: false, sync: () => {} };

  /* ---------- шапка: фон появляется после прокрутки ---------- */
  const hdr = $('#hdr');
  let ticking = false;
  const parallaxJobs = [];
  const onFrame = () => {
    ticking = false;
    hdr.classList.toggle('is-stuck', window.scrollY > 24);
    parallaxJobs.forEach((job) => job());
  };
  const requestFrame = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onFrame); }
  };
  addEventListener('scroll', requestFrame, { passive: true });
  addEventListener('resize', requestFrame, { passive: true });
  onFrame();

  /* ---------- мобильное меню ---------- */
  const burger = $('[data-burger]');
  const menu = $('[data-menu]');
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    hdr.classList.toggle('is-menu', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.textContent = open ? 'Закрыть' : 'Меню';
    document.documentElement.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); burger.focus(); }
  });
  matchMedia('(min-width:1100px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* ---------- корзина ---------- */
  const KEY = 'joim-b-cart';
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { cart = {}; }
  const cartEl = $('[data-cart]');
  const cartN = $('[data-cart-n]');
  const live = document.createElement('p');
  live.className = 'vh';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const renderCart = (bump) => {
    const n = cartCount();
    cartN.textContent = n;
    cartEl.classList.toggle('has-items', n > 0);
    cartEl.setAttribute('aria-label', `Корзина, товаров: ${n}`);
    if (bump) {
      cartN.classList.remove('is-bump');
      void cartN.offsetWidth;
      cartN.classList.add('is-bump');
    }
  };
  renderCart(false);

  const timers = new WeakMap();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const id = btn.dataset.add;
    const item = GOODS[id];
    if (!item) return;
    cart[id] = (cart[id] || 0) + 1;
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) { /* приватный режим */ }
    renderCart(true);
    live.textContent = `${item.name} в корзине. Всего товаров: ${cartCount()}`;

    // обратная связь на самой кнопке
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.style.minWidth = `${btn.offsetWidth}px`;
    btn.textContent = btn.classList.contains('btn') ? 'Добавлено' : `${item.name} в${NB}корзине`;
    btn.classList.remove('is-done');
    void btn.offsetWidth;
    btn.classList.add('is-done');
    clearTimeout(timers.get(btn));
    timers.set(btn, setTimeout(() => {
      btn.innerHTML = btn.dataset.label;
      btn.classList.remove('is-done');
      btn.style.minWidth = '';
      barCtx.sync();
    }, 1700));
  });

  /* ---------- шаги запуска: точки загораются по одной ---------- */
  const stepsEl = $('[data-steps]');
  if (stepsEl) {
    const steps = $$('.step', stepsEl);
    const last = steps[steps.length - 1];
    let queue = [];
    const allOn = () => steps.every((s) => s.classList.contains('is-on'));
    const light = (i) => {
      for (let k = 0; k <= i; k++) steps[k].classList.add('is-on');
      if (i === steps.length - 1 && !reduce) {
        last.classList.remove('is-pulse');
        void last.offsetWidth;
        last.classList.add('is-pulse');
      }
    };
    const clearQueue = () => { queue.forEach(clearTimeout); queue = []; };
    const playFrom = (list) => {
      list.forEach((i, order) => queue.push(setTimeout(() => light(i), 160 + order * 220)));
    };

    if (reduce || !hasIO) {
      steps.forEach((s) => s.classList.add('is-on'));
    } else {
      const io = new IntersectionObserver((entries) => {
        const seen = entries
          .filter((en) => en.isIntersecting)
          .map((en) => { io.unobserve(en.target); return steps.indexOf(en.target); })
          .sort((a, b) => a - b);
        if (seen.length) playFrom(seen);
      }, { threshold: 0.6, rootMargin: '0px 0px -8% 0px' });
      steps.forEach((s) => io.observe(s));

      // на десктопе шаги можно пройти наведением
      const canHover = matchMedia('(hover:hover) and (min-width:1100px)');
      let walked = false;
      steps.forEach((s, i) => {
        s.addEventListener('mouseenter', () => {
          if (!canHover.matches || !(walked || allOn())) return;
          walked = true;
          clearQueue();
          steps.forEach((x, k) => x.classList.toggle('is-on', k <= i));
        });
      });
      stepsEl.addEventListener('mouseleave', () => {
        if (!walked) return;
        walked = false;
        steps.forEach((x) => x.classList.add('is-on'));
      });
    }

    // «Пуск» проигрывает последовательность заново
    const pusk = $('[data-pusk]', stepsEl);
    if (pusk) {
      pusk.addEventListener('click', () => {
        clearQueue();
        if (reduce) return;
        steps.forEach((s) => s.classList.remove('is-on', 'is-pulse'));
        playFrom(steps.map((_, i) => i));
      });
    }
  }

  /* ---------- счётчики сумм: один раз ---------- */
  const counters = $$('[data-count]');
  if (counters.length && hasIO && !reduce) {
    const run = (el) => {
      const to = Number(el.dataset.count);
      const t0 = performance.now();
      const dur = 900;
      el.style.minWidth = `${el.getBoundingClientRect().width}px`;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = money(to * eased);
        if (p < 1) requestAnimationFrame(tick);
        else { el.textContent = money(to); el.style.minWidth = ''; }
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        run(en.target);
      });
    }, { threshold: 0.5 });
    counters.forEach((el) => io.observe(el));
  }

  /* ---------- появления: один раз ---------- */
  const reveals = $$('[data-rv],[data-in]');
  if (hasIO && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        en.target.classList.add('is-in');
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- параллакс фото до 6 %, только десктоп ---------- */
  const fine = matchMedia('(min-width:1100px) and (hover:hover)');
  if (!reduce) {
    $$('[data-parallax]').forEach((box) => {
      const img = $('img', box);
      if (!img) return;
      parallaxJobs.push(() => {
        if (!fine.matches) { img.style.transform = ''; return; }
        const r = box.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2); // −1…1
        img.style.transform = `translate3d(0,${(p * -5).toFixed(2)}%,0)`;
      });
    });
    requestFrame();
  }

  /* ---------- подбор по машине ---------- */
  const pick = $('[data-pick]');
  if (pick) {
    const form = $('form', pick);
    const vol = $('#vol', pick);
    const out = $('#vol-out', pick);
    const dots = $$('[data-pick-dots] i', pick);
    const empty = $('[data-pick-empty]', pick);
    const res = $('[data-pick-out]', pick);
    const mdl = $('[data-mdl]');
    const elModel = $('[data-pick-model]', pick);
    const elPrice = $('[data-pick-price]', pick);
    const elWhy = $('[data-pick-why]', pick);
    const elAdd = $('[data-pick-add]', pick);
    const elLink = $('[data-pick-link]', pick);
    const L = (n) => n.toFixed(1).replace('.', ',');
    const MIN = Number(vol.min);
    const MAX = Number(vol.max);
    let volTouched = false;

    const update = () => {
      const fd = new FormData(form);
      const fuel = fd.get('fuel');
      const place = fd.get('place');
      const v = parseFloat(vol.value);
      out.textContent = `${L(v)}${NB}л`;
      vol.setAttribute('aria-valuetext', `${L(v)} литра`);
      vol.style.setProperty('--p', `${((v - MIN) / (MAX - MIN)) * 100}%`);

      const ready = Boolean(fuel && place);
      const lit = [Boolean(fuel), volTouched || ready, Boolean(place), ready];
      dots.forEach((d, i) => d.classList.toggle('on', lit[i]));

      if (!ready) {
        empty.hidden = false;
        res.hidden = true;
        if (mdl) mdl.removeAttribute('data-picked');
        barCtx.picked = null;
        barCtx.sync();
        return;
      }

      // запас в полтора раза, если машина зимует на улице
      const street = place === 'street';
      const need = Math.round(v * (street ? 1.5 : 1) * 10) / 10;
      const limit = fuel === 'petrol' ? 8 : 7;
      const id = need > limit ? 'es29' : 'es19';
      const item = GOODS[id];
      const fuelName = fuel === 'petrol' ? 'Бензин' : 'Дизель';
      const fuelGen = fuel === 'petrol' ? 'бензина' : 'дизеля';

      let why = `${fuelName} ${L(v)}${NB}л, зимует ${street ? 'на улице' : 'в гараже или паркинге'}: `;
      why += street ? `считаем как ${L(need)}${NB}л. ` : 'запас на мороз не нужен. ';
      if (id === 'es19') {
        why += limit - need >= 1
          ? 'ES-19 хватит с запасом.'
          : `ES-19 хватит: его предел для ${fuelGen} ${limit}${NB}л.`;
      } else {
        why += `Это больше предела ES-19 (${limit}${NB}л для ${fuelGen}), нужен ES-29.`;
      }

      elModel.textContent = item.name;
      elPrice.textContent = `${money(item.price)}${NB}₽`;
      elWhy.textContent = why;
      elAdd.dataset.add = id;
      elLink.href = item.url;
      const wasHidden = res.hidden;
      empty.hidden = true;
      res.hidden = false;
      if (!wasHidden && !reduce) { // повторный расчёт: короткое мигание результата
        res.style.animation = 'none';
        void res.offsetWidth;
        res.style.animation = '';
      }
      if (mdl) mdl.setAttribute('data-picked', id);
      barCtx.picked = id;
      barCtx.sync();
    };

    form.addEventListener('input', (e) => {
      if (e.target === vol) volTouched = true;
      update();
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    update();
  }

  /* ---------- видео по клику на постер ---------- */
  const plays = $$('[data-play]');
  plays.forEach((btn) => {
    btn.addEventListener('click', () => {
      const frame = btn.closest('.v__frame');
      const video = $('video', frame);
      $$('.v__frame video').forEach((v) => { if (v !== video) v.pause(); });
      frame.classList.add('is-on');
      video.controls = true;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      video.focus({ preventScroll: true });
    });
  });

  /* ---------- форма: проверка без реальной отправки ---------- */
  const form = $('[data-form]');
  if (form) {
    const ok = $('[data-form-ok]');
    const okText = $('[data-form-ok-text]');
    const again = $('[data-form-again]');
    const submit = $('[type="submit"]', form);
    const f = {
      name: form.elements.name,
      tel: form.elements.tel,
      topic: form.elements.topic,
      agree: form.elements.agree,
    };
    const digits = (v) => v.replace(/\D/g, '');
    const rules = {
      name: () => (f.name.value.trim().length >= 2 ? '' : 'Напишите, как к вам обращаться'),
      tel: () => {
        const d = digits(f.tel.value);
        return d.length === 11 && /^[78]/.test(d) ? '' : 'Нужен номер целиком: +7 и ещё десять цифр';
      },
      topic: () => (f.topic.value ? '' : 'Выберите тему, чтобы вопрос попал к нужному человеку'),
      agree: () => (f.agree.checked ? '' : 'Без согласия мы не можем вам ответить'),
    };
    const show = (key, msg) => {
      const el = f[key];
      const box = el.closest('.fld');
      const err = $('.fld__e', box);
      box.classList.toggle('is-err', Boolean(msg));
      err.textContent = msg;
      if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      return !msg;
    };

    // телефон приводим к виду +7 000 000-00-00
    f.tel.addEventListener('input', (e) => {
      let d = digits(f.tel.value);
      if (e.inputType && e.inputType.indexOf('delete') === 0 && d.length <= 1) { f.tel.value = ''; return; }
      if (!d) { f.tel.value = ''; return; }
      if (d[0] === '8') d = `7${d.slice(1)}`;
      if (d[0] !== '7') d = `7${d}`;
      d = d.slice(0, 11);
      let r = '+7';
      if (d.length > 1) r += ` ${d.slice(1, 4)}`;
      if (d.length > 4) r += ` ${d.slice(4, 7)}`;
      if (d.length > 7) r += `-${d.slice(7, 9)}`;
      if (d.length > 9) r += `-${d.slice(9, 11)}`;
      f.tel.value = r;
    });

    Object.keys(rules).forEach((key) => {
      const evt = key === 'topic' || key === 'agree' ? 'change' : 'input';
      f[key].addEventListener(evt, () => {
        if (f[key].closest('.fld').classList.contains('is-err')) show(key, rules[key]());
      });
      if (key !== 'agree') f[key].addEventListener('blur', () => { if (f[key].value) show(key, rules[key]()); });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = Object.keys(rules).filter((key) => !show(key, rules[key]()));
      if (bad.length) { f[bad[0]].focus(); return; }
      // состояние отправки, затем успех
      const label = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'Отправляем';
      setTimeout(() => {
        submit.disabled = false;
        submit.textContent = label;
        okText.textContent = `Ответим по${NB}номеру ${f.tel.value}.`;
        form.hidden = true;
        ok.hidden = false;
        ok.focus({ preventScroll: true });
      }, reduce ? 0 : 600);
    });

    again.addEventListener('click', () => {
      form.reset();
      ok.hidden = true;
      form.hidden = false;
      f.name.focus();
    });
  }

  /* ---------- липкая панель на телефоне ---------- */
  const bar = $('[data-bar]');
  if (bar && hasIO) {
    const state = { hero: true, form: false, foot: false };
    const barName = $('[data-bar-name]', bar);
    const barPrice = $('[data-bar-price]', bar);
    const barAdd = $('[data-bar-add]', bar);
    const sync = () => {
      const on = !state.hero && !state.form && !state.foot;
      bar.classList.toggle('is-on', on);
      bar.inert = !on;
      const id = barCtx.pvc ? 'pvc1' : (barCtx.picked || 'es19');
      if (barAdd.dataset.add !== id && !barAdd.classList.contains('is-done')) {
        const item = GOODS[id];
        barName.textContent = `${item.name}, ${item.note}`;
        barPrice.textContent = `${money(item.price)}${NB}₽`;
        barAdd.dataset.add = id;
      }
    };
    barCtx.sync = sync;
    const pvc = $('#pvc1');
    if (pvc) {
      new IntersectionObserver((entries) => {
        barCtx.pvc = entries[0].isIntersecting;
        sync();
      }, { rootMargin: '-45% 0px -45% 0px' }).observe(pvc);
    }
    const watch = (el, key) => {
      if (!el) return;
      new IntersectionObserver((entries) => {
        state[key] = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(el);
    };
    watch($('.hero'), 'hero');
    watch($('#vopros'), 'form');
    watch($('.ftr'), 'foot');
    sync();
  }
})();
