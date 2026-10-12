# JOIM Store: справочник компонентов (второй круг, тёмная тема)

Общая система лежит в `store/assets/css/main.css` (стили) и `store/assets/js/main.js` (поведение). Страничные стили: `store/assets/css/pages/<страница>.css`. По этому файлу можно верстать, не читая main.css целиком; разделы main.css пронумерованы в его шапке, если нужно посмотреть исходник. Где что лежит, какие поля есть у товара и как собирать, написано в `page-contract.md`.

Три правила, на которых держится всё остальное:

1. Страница тёмная. Светлой бывает **карточка, а не секция** (раздел 3).
2. Контент идёт от поля до поля. Ширину строки держит сам текст (`max-width` в `ch`), а не контейнер (раздел 2).
3. Рендер товара стоит прямо на странице: у плитки нет фона, края кадра растворены маской (раздел 5).

---

## 1. Токены

### Цвет (тёмная страница)

| Токен | Значение | Где |
|---|---|---|
| `--bg` | `#0A0C0B` | страница, шапка после прокрутки |
| `--bg-2` | `#0F1211` | чередование секций (`.section--alt`), футер, служебная полоса, лист поиска |
| `--surface` | `#151918` | карточки и панели на тёмном: строки аккордеона, панель каталога, `.link-card`, сводка корзины |
| `--surface-2` | `#1D2221` | hover, поля ввода, мягкие кнопки, чипы |
| `--surface-3` | `#272D2B` | hover мягких кнопок и чипов |
| `--line` | `rgba(255,255,255,.08)` | тонкие линии между блоками |
| `--line-strong` | `rgba(255,255,255,.16)` | контур кнопок, линия над показателями |
| `--text` | `#F2F4F3` | основной текст (на `--bg` 17,8:1) |
| `--text-2` | `#A9AFAC` | вторичный текст (на `--bg` 8,8:1, на `--surface-2` 7,2:1) |
| `--text-3` | `#808784` | подписи не мельче 12 px (на `--bg` 5,3:1, на `--surface` 4,8:1). На `--surface-2` не ставить: 4,4:1 |
| `--placeholder` | `#8E9592` | подсказка в поле (на `--field` 5,3:1) |
| `--accent` / `--accent-hover` | `#B8E62E` / `#A7D51C` | основная кнопка, метки, фокус |
| `--on-accent` | `#111312` | текст на лайме (12,8:1) |
| `--danger` | `#FF7A66` | ошибки полей |
| `--star` | = `--accent` | звёзды рейтинга |
| `--focus` | = `--accent` | кольцо `:focus-visible` (2 px, отступ 2 px) |
| `--field`, `--field-hover`, `--field-line` | `--surface-2`, `#242A28`, прозрачная | поле ввода |
| `--bp` | `rgba(255,255,255,.26)` | линии чертежа на тёмном |

Светлые значения: `--paper #F4F6F5`, `--paper-2 #E8ECEA`, `--paper-ink #141716`, `--paper-muted #5C6360`, `--paper-line rgba(20,23,22,.12)`. Напрямую ими пользоваться почти не нужно: внутри светлой карточки общие токены подменяются сами (раздел 3).

### Шрифт и кегли

- `--font`: **Geist** (400, 500, 600, 700) для всего: заголовки, текст, кнопки, цены.
- `--font-mono`: **Geist Mono** (400, 500) только для мелких подписей капсом: класс `.label`, подписи показателей, названия полей характеристик, заголовки колонок таблицы, даты, служебная полоса. Не для абзацев и не для заголовков.
- Подключение одно, в `src/layout.html` (Google Fonts). Tektur и Onest удалены; в новой вёрстке `--font-head` не использовать (см. раздел 14).

| Что | Класс | Кегль |
|---|---|---|
| h1 первого экрана главной | `.hero__title` (home.css) | `clamp(46px, 3.4vw, 54px)`, телефон 31 |
| h1 страницы | `.page-title` | `clamp(32px, 2.6vw, 40px)`, телефон 28 |
| заголовок секции | `.section-title` (= `.h2`) | `clamp(30px, 2.5vw, 38px)`, телефон 25 |
| заголовок карточки | `.h3`, `.bp-card__title` | 19–22 |
| название товара: строка / «по две» / плитка | `.product-card__title` | 24–28 / 20–26 / 16 |
| текст | body, `.lead` | 15 / 16 |
| вторичный | `.text-sm` | 13,5 |
| подпись капсом | `.label` | 12, Geist Mono, `letter-spacing: .08em` |

Заголовки: вес 600, `letter-spacing: -.02em`, `line-height` 1,1–1,15, `text-wrap: balance`. Цифры в ценах и показателях: 600–700, `font-variant-numeric: tabular-nums` (классы `.price`, `.nums`).

### Прочее

`--r: 4px` (карточки, поля), `--r-lg: 12px` (окна, уведомление на телефоне), `--pill: 100px`; `--gap: 12px` (телефон 8) между карточками в сетке; `--ease`; `--shadow-pop` (окна, панели), `--shadow-bar` (липкие нижние панели); `--topbar-h` 32 (телефон 28), `--header-h` 72 (телефон 60), `--sticky-top` = их сумма (отступ для `position: sticky` под шапкой); `--z-sticky: 90`, `--z-header: 100`, `--z-toast: 200`.

---

## 2. Сетка и поля

```html
<section class="section [section--alt] [section--line]" aria-labelledby="x-title">
  <div class="container">
    <div class="section-head">
      <h2 class="section-title" id="x-title">Заголовок</h2>
      <a class="btn btn--soft btn--sm" href="/catalog/">Все товары{{icon arrow-up-right icon--move}}</a>
    </div>
    …
  </div>
</section>
```

- `.container`: `width: calc(100% - 2 * var(--gutter))`, **максимальной ширины нет**. Промер: поле 40 px на 1024, 41 на 1280, 46 на 1440, 60 на 1920 и 2560.
- `--gutter`: `clamp(40px, 3.2vw, 60px)` от 1024 px; 32 px на 900–1023; 24 px на 768–899; 16 px на телефоне (до 767).
- `--section`: вертикальный отступ секции `clamp(88px, 7vw, 128px)`, планшет 80, телефон 64. `.section--tight` даёт 60 % от него.
- `.section--alt`: фон `--bg-2` (чередование). `.section--line`: линия сверху.
- `.page-head`: шапка страницы под крошками (h1 `.page-title` + `.lead`).
- Чтобы на 1920–2560 не было строк по 200 знаков: абзацам и подзаголовкам задавать `max-width` в `ch` или `em` (`.lead` и `.measure` дают `--measure: 64ch`, `.prose` 72ch); сетки карточек растут числом колонок или размером; у форм и аккордеонов своя максимальная ширина (`.accordion` 920 px), и стоят они **на общей левой линии**, а не по центру.
- Проверять кадрами на 1440, 1920 и 2560. На 2560 сетка из трёх плиток с `aspect-ratio` становится выше экрана: добавляйте колонки (пример: мозаика главной с 2000 px встаёт 4 + 4, см. home.css).
- `.gridlines`: тонкие линии сетки поверх экрана-сцены (вертикаль по центру и одна горизонталь, высота через `--gridline-y`).

Брейкпоинты, которыми пользуется система: 1179 («по две в ряд» встаёт в колонку), 1100, 1023, 959 (меню прячется в бургер), 899, 767 (телефон), 640 (карточки товара в столбик), 520, 389, 359.

---

## 3. Светлая вставка

Классы, которые делают блок светлым: **`.paper`** (общий), а также `.bp-card`, `.bracket-card`, `.review-card`, `.modal` (у них это встроено). Блок получает фон `--paper` и **подменяет общие токены светлыми**: `--bg`, `--bg-2`, `--surface` (белый), `--surface-2`, `--surface-3`, `--line`, `--line-strong`, `--text`, `--text-2`, `--text-3`, `--danger`, `--star`, `--focus`, `--field` (белое поле с контуром), `--placeholder`, `--bp`. Поэтому кнопки, чипы, поля, ссылки, аккордеон и кольцо фокуса внутри сами становятся «для светлого»: отдельных модификаторов не нужно.

```html
<div class="paper" style="padding: 32px; border-radius: var(--r)">
  <h3 class="h3">Комплектация</h3>
  <ul class="list-dot">…</ul>
  <a class="btn btn--solid" href="…">Тёмная кнопка на светлом</a>
</div>
```

Что бывает светлым (решение заказчика, раздел 3 брифа):
- карточки с чертёжными иллюстрациями (`.bp-card`): преимущества; оплата, доставка, гарантия; блоки страницы доставки; заглушки;
- карточка «о бренде» и карточка оптовой формы (`.bracket-card`, уголки-скобки);
- карточки отзывов (`.review-card`);
- блок «Комплектация» в карточке товара (`.paper`);
- окна с формами и окно сертификата (`.modal`).

Всё остальное тёмное. Светлой полосы во всю ширину окна быть не должно: если нужен светлый блок, это карточка внутри `.container` со скруглением `--r`.

Кадры серии «товар на тёмной сцене» на светлую карточку не ставить (будет чёрный прямоугольник); на светлом живут вырезки на прозрачном фоне (`*-kit.png`, `cutImg`) и чертежи.

---

## 4. Кнопки, чипы, бейджи, мелочи

### Кнопка `.btn`

| Модификатор | Вид |
|---|---|
| `.btn--accent` | лайм, тёмный текст: основное действие («В корзину», «Оформить заказ») |
| `.btn--outline` | контур `--line-strong`: второе действие, кнопки маркетплейсов, «Сообщить о поступлении» |
| `.btn--soft` | заливка `--surface-2`: спокойная ссылка-кнопка («Все товары») |
| `.btn--solid` | контрастная: светлая на тёмном, тёмная на светлой вставке |

Размеры: `.btn--xs` 38 px (кнопки маркетплейсов), `.btn--sm` 40 px, без модификатора 46 px, `.btn--lg` 54 px; в карточке товара основная кнопка 46 / 52 / 56 px (плитка / «по две» / строка). `.btn--block` на всю ширину. У `--xs` и `--sm` зона касания добрана до 44 px псевдоэлементом. Стрелка в кнопке: `{{icon arrow-up-right icon--move}}` (сдвигается при hover). Состояния: `.is-added` (ставит main.js на 1,2 с после «В корзину»), `:disabled`.

```html
<button class="btn btn--accent btn--lg" type="button" data-add-to-cart="es19">В&nbsp;корзину</button>
<a class="btn btn--outline btn--xs" href="{{ozonUrl}}" target="_blank" rel="nofollow noopener">Ozon{{icon arrow-up-right}}</a>
```

Имена `.btn--dark`, `.btn--white`, `.btn--line-light`, `.round-btn--dark`, `.round-btn--white` остались как псевдонимы для непереведённых страниц; в новой вёрстке писать `--solid` и `--outline`.

### Круглая кнопка `.round-btn`

44 px (`.round-btn--sm` 40). `.round-btn--solid` контрастная, `.round-btn--glass` полупрозрачная поверх картинки. Счётчик: `<span class="round-btn__count" data-cart-count>0</span>` (класс `.is-filled` красит в лайм, ставит main.js).

### Счётчик количества `.qty`

```html
<div class="qty [qty--sm]" role="group" aria-label="Количество">
  <button class="qty__btn" type="button" aria-label="Уменьшить количество">{{icon minus}}</button>
  <span class="qty__val">1</span>
  <button class="qty__btn" type="button" aria-label="Увеличить количество">{{icon plus}}</button>
</div>
```
46 px, `--sm` 38 px. В корзине кнопкам добавить `data-cart-dec` / `data-cart-inc` (раздел 12).

### Чипы

```html
<nav class="chips">
  <a class="chip" href="…" aria-current="page">Все товары</a>
  <a class="chip" href="…">Пусковые устройства</a>
</nav>
<button class="chip" type="button" aria-pressed="false">В&nbsp;продаже</button>
<li class="chip chip--outline">мотоциклы</li>
```
Активный: `.is-active`, `[aria-current]` или `[aria-pressed="true"]` (светлая заливка). `.chip--outline`: маленький контурный, не кнопка.

### Остальное

- `.plaque`: прямоугольная плашка-преимущество с лаймовой меткой (первый экран).
- `.badge` + `.badge--accent` («Хит продаж»), `.badge--soft` («Скоро»), `.badge--dark`. У товара тон приходит полем `badgeTone`.
- `.price`: цена (600, tabular-nums, без переноса). `.stars`: пять звёзд, вставка `{{> stars}}`.
- `.label`: подпись Geist Mono капсом.
- `.link`: подчёркнутая ссылка в тексте. `.more-link`: ссылка со стрелкой («Подробнее о модели»), высота 44 px.
- `.list-dot`: список с квадратной меткой (лайм на тёмном, тёмная на светлом).
- `.muted`, `.nums`, `.nowrap`, `.text-sm`, `.measure`, `.visually-hidden`.
- Иконки: `{{icon имя [класс]}}` из спрайта `src/partials/icons.html`. Имена: mark, grid, search, heart, cart, menu, close, arrow-up-right, arrow-right, arrow-left, chevron-right, chevron-left, chevron-down, check, plus, minus, star, phone, mail, pin, clock, truck, shield, return, chat, info, trash, play, telegram, vk, sort. В скрипте: `JOIM.icon('check')`.

---

## 5. Рендер товара: плитка, сцена, миниатюра

Рендеры серии сняты на тёмной сцене. Чтобы не было прямоугольника снимка, у окна **нет своего фона**, а края кадра растворены масками. Работает на любом тёмном фоне (`--bg`, `--bg-2`, `--surface`).

### Плитка `.tile` (вертикальный кадр, 5:6)

```html
<div class="tile" style="{{tileStyle}}">
  <a class="tile__link" href="{{url}}" tabindex="-1" aria-hidden="true">
    <img class="tile__img tile__img--{{fit}}{{#if tileMod}} tile__img--{{tileMod}}{{/if}}" src="{{img}}" alt="{{alt}}" width="{{w}}" height="{{h}}" loading="lazy" decoding="async">
  </a>
</div>
```
`fit` (`tall` или `wide`) ставит сборка по пропорции кадра. Подгонка под кадр приходит из справочника (поле `tile` товара) переменными: `--s` масштаб, `--x`, `--y` сдвиг, `--r` поворот, `--tone` яркость, `--ft`, `--fb` длина растворения верха и низа, `--dw` предел ширины кадра в карточке «по две в ряд». Модификаторы маски: `tile__img--corner`, `tile__img--float`, `tile__img--cut` (вырезка на прозрачном фоне, без масок).

### Сцена `.stage` (широкий кадр `*-stage.jpg` в окне любой пропорции)

```html
<div class="stage" style="{{stageStyle}}; aspect-ratio: 4 / 3">
  <a class="stage__link" href="{{url}}" tabindex="-1" aria-hidden="true">
    <img class="stage__img" src="{{stage.src}}" alt="{{alt}}" width="{{stage.w}}" height="{{stage.h}}" loading="lazy" decoding="async">
  </a>
</div>
```
Товар ставится в точку окна `--ax`, `--ay` (по умолчанию центр). Из справочника (поле `stage`) приходят `--cx`, `--cy` (центр товара в кадре, %), `--s` (высота кадра в долях высоты окна), `--fl`, `--fr`, `--ft`, `--fb` (длина растворения краёв), `--tone`. Окну нужна высота: `aspect-ratio`, `min-height` или растяжение в сетке. Чтобы сдвинуть товар внутри окна: `style="--ax: 62%"`.

### Миниатюра `.mini-tile`

56 × 56 px, подложка всегда тёмная (и на светлой карточке тоже): поиск, панель каталога, корзина, строка товара в отзыве. В скрипте: `JOIM.thumbHtml(product, 'доп-класс')`.

---

## 6. Карточка товара: три варианта

Один компонент: `src/partials/product-card.html`. Вариант выбирается аргументом `view`. Во всех трёх: бейдж и сердце на рендере, название-ссылка, рейтинг и цена (или «Скоро в продаже»), основная кнопка и **под ней две кнопки меньше: «Ozon ↗» и «Wildberries ↗»**. У товаров «скоро» основная кнопка «Сообщить о поступлении» (контурная), кнопки маркетплейсов остаются. Адреса берутся из полей `ozonUrl`, `wbUrl` товара.

| Вариант | Вставка | Список-обёртка | Где |
|---|---|---|---|
| строка на всю ширину | `{{> product-card es19 view=row}}` | `ul.product-rows` (+ `.product-rows--alt`) | каталог и категории |
| «по две в ряд» | `{{> product-card es19 view=duo}}` | `ul.product-pairs` | «Популярные товары» на главной |
| компактная плитка | `{{> product-card es19}}` | `ul.product-grid` | «Вам может быть интересно», избранное, корзина (пустое состояние), заглушки |

Аргументы вставки: первый без имени это id товара (`es19`) или переменная с id; внутри `{{#each}}` по товарам id не нужен (поля товара уже в области видимости). `view=row|duo`, `eager=head` (первые четыре грузятся сразу), `prio=first` (`fetchpriority="high"` у первой), `flip=even` (строка с рендером справа у чётных).

```html
<!-- каталог: строки -->
<ul class="product-rows" data-cat-grid>
{{#each items}}  <li data-cat-item="{{id}}">{{> product-card view=row eager=head prio=first}}</li>
{{/each}}</ul>

<!-- главная: по две в ряд -->
<ul class="product-pairs">
  <li>{{> product-card es19 view=duo}}</li>
  <li>{{> product-card es29 view=duo}}</li>
</ul>

<!-- ряд плиток -->
<ul class="product-grid">
{{#each related}}  <li>{{> product-card}}</li>
{{/each}}</ul>
```

В скрипте та же разметка лежит готовой (её кладёт сборка в `data.js`): `JOIM.cardHtml(id)` плитка, `JOIM.cardHtml(id, 'duo')`, `JOIM.cardHtml(id, 'row')`. После вставки в страницу вызвать `JOIM.fav.sync(контейнер)`: расставит состояние сердец.

```js
list.innerHTML = ids.map((id) => `<li data-id="${id}">${JOIM.cardHtml(id, 'row')}</li>`).join('');
JOIM.fav.sync(list);
```

### Что получается в разметке (строка, товар в продаже)

```html
<article class="product-card product-card--row" data-product="es19" data-price="5837">
  <div class="product-card__media stage" style="--cx:77%;--cy:51%;--s:1;--fr:11%;--ft:11%">
    <a class="stage__link" href="/product/joim-easy-start-es19/" tabindex="-1" aria-hidden="true"><img class="stage__img" src="/assets/img/deck/es19-stage.jpg" …></a>
    <span class="badge badge--accent product-card__badge">Хит продаж</span>
    <button class="fav-btn" type="button" data-fav="es19" aria-pressed="false" aria-label="В избранное: Easy Start ES-19">…</button>
  </div>
  <div class="product-card__body">
    <h3 class="product-card__title"><a href="/product/joim-easy-start-es19/">Пусковое устройство JOIM Easy Start <span class="nowrap">ES-19</span></a></h3>
    <p class="product-card__for">Легковые автомобили · Грузовая техника · Мотоциклы</p>
    <dl class="fields product-card__fields">
      <div class="fields__item"><dt class="label">Ток</dt><dd class="fields__value">3 300 А</dd></div>
      … ещё три поля
    </dl>
    <div class="product-card__buy">
      <div class="product-card__offer">
        <p class="product-card__rating">★ 5,0 · 8 отзывов</p>
        <p class="product-card__price">5 837 ₽</p>
      </div>
      <div class="product-card__actions">
        <button class="btn btn--accent product-card__btn" type="button" data-add-to-cart="es19">В корзину</button>
        <div class="product-card__mp">
          <a class="btn btn--outline btn--xs" href="https://www.ozon.ru/seller/…" target="_blank" rel="nofollow noopener">Ozon ↗</a>
          <a class="btn btn--outline btn--xs" href="https://www.wildberries.ru/brands/…" target="_blank" rel="nofollow noopener">Wildberries ↗</a>
        </div>
      </div>
    </div>
    <a class="more-link product-card__more" href="/product/joim-easy-start-es19/">Подробнее о модели →</a>
  </div>
</article>
```
У «по две в ряд» вместо `.stage` стоит `.tile` (вертикальный кадр `img`), класс `product-card--duo`; остальное то же. У плитки (`product-card--tile`) нет строки «для чего», полей и ссылки «Подробнее». У товара «скоро» у `article` добавляется `is-soon`, `data-price` пустой, цена `product-card__price--soon`.

### Поведение вариантов

- **Строка**: сетка 50/50, слева сцена, справа текст; высота `clamp(440px, 35vw, 660px)`; поля в две колонки, в четыре в ряд при ширине карточки от 1180 px (container query); цена слева, кнопки справа (основная 56 px, маркетплейсы 38 px); между строками линия `--line`. Текстовая колонка не шире 800 px, поэтому на 2560 цена и кнопки не разъезжаются. Рендер справа у каждой второй: класс `.product-rows--alt` на списке (по порядку в DOM, удобно при сортировке скриптом) или `flip=even` во вставке. С чередованием список читается живее; без него ровнее левая линия текста. Проверено кадрами на 1440: оба варианта рабочие, выбор за страницей каталога. До 1023 px рендер занимает 44 % и всегда слева; до 640 px карточка в столбик: рендер 4:3, название, поля в две колонки, цена, кнопка на всю ширину (52 px), две маленькие в ряд (42 px).
- **«По две в ряд»**: сетка 2 колонки с линиями между карточками; в карточке рендер 42 %, поля 2 × 2. Название прижато к верху, блок покупки к низу: в паре названия, цены и кнопки стоят на общих линиях. До 1179 px одна карточка в ряд; до 640 px в столбик, как строка.
- **Плитка**: `ul.product-grid` 4 колонки (до 1100 px три, до 820 две, до 359 одна). При ширине плитки до 230 px (container query) кнопка «Сообщить о поступлении» сокращается до «Сообщить», у кнопок маркетплейсов пропадает стрелка.

### Поля (`.fields`)

```html
<dl class="fields">
  <div class="fields__item"><dt class="label">Ток</dt><dd class="fields__value">3&nbsp;300&nbsp;А</dd></div>
  …
</dl>
```
Две колонки, тонкая линия над каждым полем, подписи и значения соседей стоят на общих строках (subgrid). Какие поля показывать в карточке, задаёт `fields` товара в справочнике (подпись + ключ характеристики); в шаблоне это `{{#each fieldList}}` с `{{label}}` и `{{{valueHtml}}}`.

---

## 7. Строка показателей

Число крупно, единица мелко рядом, под числом подпись Geist Mono капсом. Первый экран главной; тот же компонент для полосы ключевых цифр на странице товара.

```html
<ul class="stats [stats--3|stats--2]" aria-label="JOIM в цифрах">
  <li class="stat"><b class="stat__value">2019</b><span class="stat__label">Год основания, своё производство</span></li>
  <li class="stat"><b class="stat__value">12<span class="stat__unit">мес</span></b><span class="stat__label">Гарантии на&nbsp;каждое устройство</span></li>
</ul>
```
Четыре колонки (три или две с модификатором), линия `--line-strong` сверху, число `clamp(34px, 2.9vw, 44px)` веса 700; на телефоне 2 × 2. Значения брать из справочника (`{{{specs.current}}}` и т. п.), новых цифр не придумывать.

---

## 8. Плитка категории и мозаика

```html
<ul class="mosaic"> <!-- сетку колонок задаёт страница -->
  <li>
    <a class="cat-tile" href="/catalog/puskovye-ustroystva/" style="--pos: 100% 50%">
      <img class="cat-tile__img" src="/assets/img/deck/es19-stage.jpg" alt="…" width="1258" height="941" loading="lazy" decoding="async">
      <span class="cat-tile__title">Пусковые устройства<span class="cat-tile__note">5&nbsp;моделей, от&nbsp;{{price es19}}</span></span>
      <span class="round-btn round-btn--glass cat-tile__arrow" aria-hidden="true">{{icon arrow-up-right}}</span>
    </a>
  </li>
</ul>
```
Рендер слит со страницей: левый край кадра растворён под название (`--fl`, по умолчанию 40 %), остальные у кромки (`--fr`, `--ft`, `--fb`); положение кадра `--pos` (как `object-position`). Плитки в `.mosaic` делят линии `--line`. `.cat-tile--photo`: настоящая фотография, остаётся прямоугольным кадром со скруглением и затемнением под текст. Высоту плитке задаёт страница (`aspect-ratio`). Название не должно ложиться на корпус товара: на узких плитках кадр опускают (`top: auto; height: 80%`), примеры в home.css.

---

## 9. Карточки

**Светлая с уголками** `.bracket-card` («о бренде», оптовая форма): отступы 72/48/60, уголки-скобки рисует `::before`.

**Светлая с чертежом** `.bp-card`:
```html
<li class="bp-card">
  <h3 class="bp-card__title">Гарантия 12&nbsp;месяцев</h3>
  <p class="bp-card__text">Брак меняем без&nbsp;экспертизы…</p>
  <ul class="bp-card__list"><li><span>СДЭК по&nbsp;России, 2–7&nbsp;дней</span><b>от&nbsp;390&nbsp;₽</b></li></ul>
  <a class="btn btn--sm bp-card__more" href="/warranty/">Подробнее{{icon arrow-up-right icon--move}}</a>
  {{> bp-seal cls=bp-card__art}}
</li>
```
Чертежи: partial `bp-device`, `bp-seal`, `bp-battery`, `bp-gear`, `bp-card`, `bp-map`, `bp-box`, `bp-crate`; аргумент `cls=` добавляет класс к `svg`. Цвет линий берётся из `color` (на светлой карточке `--bp` серо-зелёный сам, на тёмном фоне светлый полупрозрачный); на тёмном задать `--bp-paper: var(--bg)`, чтобы фигуры впереди закрывали линии позади. Размер и положение чертежа (`.bp-card__art`: `width`, `right`, `bottom`) подгоняет страница. Минимальная высота карточки 440 px, страница может переопределить.

**Карточка-ссылка на тёмном** `.link-card` (`__title`, `__text`, `__arrow`): заглушки, «Остались вопросы».

**Отзыв** `.review-card` (светлая; `--soft` чуть темнее):
```html
<article class="review-card">
  <p class="review-card__product"><a href="{{productUrl}}">{{productShort}}</a></p>
  <h3 class="review-card__name">Константин</h3>
  {{> stars}}
  <p class="review-card__text">Текст отзыва дословно</p>
  <p class="review-card__date"><time datetime="2026-06-16">16&nbsp;июня 2026</time></p>
</article>
```

**Лента с прокруткой**:
```html
<div data-slider>
  <button class="round-btn" type="button" data-slider-prev aria-label="Назад">{{icon arrow-left}}</button>
  <button class="round-btn" type="button" data-slider-next aria-label="Вперёд">{{icon arrow-right}}</button>
  <ul class="slider__track" data-slider-track tabindex="0" aria-label="…" style="--slider-gap: 12px">
    <li style="width: 420px">…</li>
  </ul>
</div>
```
Кнопки сами выключаются на краях. После вставки ленты скриптом: `JOIM.initSliders(контейнер)`.

---

## 10. Аккордеон

```html
<div class="accordion" [data-accordion="single"]>
  <div class="accordion__item is-open">
    <h3 class="accordion__head"><button class="accordion__btn" type="button">Вопрос</button></h3>
    <div class="accordion__panel"><div class="accordion__body"><p>Ответ</p></div></div>
  </div>
</div>
```
Тёмные строки `--surface` (hover и открытая `--surface-2`), плюс поворачивается в крестик и становится лаймовым. Максимальная ширина 920 px (страница может поменять), левая линия общая с остальным контентом. `data-accordion="single"`: открыт только один пункт. ARIA расставляет main.js; после вставки скриптом вызвать `JOIM.initAccordions(контейнер)`. Внутри `.paper` аккордеон светлеет сам.

---

## 11. Формы

```html
<form class="form" data-form [data-form-reset] novalidate>
  <div class="form__main">
    <div class="field">
      <label class="field__label" for="f-name">Имя</label> <!-- или class="visually-hidden", если подпись в placeholder -->
      <input class="input" id="f-name" type="text" name="name" autocomplete="name" required data-error="Напишите, как к вам обращаться">
    </div>
    <div class="form__row"> <!-- два поля в ряд, до 520 px в столбик -->
      <div class="field"><input class="input" type="tel" name="phone" placeholder="+7 000 000-00-00" required data-error="Оставьте телефон для связи"></div>
      <div class="field"><input class="input" type="email" name="email" placeholder="E-mail"></div>
    </div>
    <div class="field"><textarea class="textarea" name="message" placeholder="Комментарий"></textarea></div>
    <label class="check">
      <input class="check__input" type="checkbox" name="agree" required data-error="Нужно согласие на обработку данных">
      <span class="check__box" aria-hidden="true">{{icon check}}</span>
      <span class="check__text">Согласен с&nbsp;<a href="/privacy/">политикой конфиденциальности</a></span>
    </label>
    <button class="btn btn--accent btn--lg btn--block" type="submit">Оформить заказ</button>
  </div>
  <div class="form__success" data-form-success hidden>
    <h2 class="section-title">Заявка принята</h2>
    <p>Менеджер перезвонит…</p>
  </div>
</form>
```
- `data-form`: main.js проверяет поля при отправке (обязательные, `type="tel"` полный номер с маской `+7 000 000-00-00`, `type="email"`, поле с `data-contact` принимает телефон или почту), пишет ошибку в `.field__error` (создаёт сам), ставит `.is-invalid` и `aria-invalid`. После успеха: класс `.is-sent` (скрывает `.form__main`), показывает `[data-form-success]`, событие `form:sent` на форме (`detail` = данные формы). Ничего никуда не отправляет.
- `data-form-reset`: форма в окне возвращается в исходное состояние при каждом открытии окна.
- Поля: `.input`, `.textarea`, `.select` (48 px; на тёмном заливка `--surface-2` без контура, на светлой вставке белые с контуром); на телефоне кегль 16 px (иначе iOS увеличивает страницу). Фокус: контур цвета `--focus`.

---

## 12. Окна, уведомление, поиск, корзина в шапке

**Окно** (`<dialog>`), открывается любой кнопкой с `data-dialog-open="id"`, закрывается кнопкой `data-dialog-close`, Esc или кликом по затемнению:
```html
<button class="btn btn--solid" type="button" data-dialog-open="ask" aria-haspopup="dialog">Задать вопрос</button>

<dialog class="modal" id="ask" aria-labelledby="ask-title">
  <button class="round-btn modal__close" type="button" data-dialog-close aria-label="Закрыть окно">{{icon close}}</button>
  <h2 class="modal__title" id="ask-title">Задать вопрос</h2>
  <p class="modal__text">…</p>
</dialog>
```
`.modal` светлая (ширина до 480 px). Общие окна лежат в `src/partials/dialogs.html`: `#search` (поиск), `#notify` («Сообщить о поступлении»), `#lightbox` (просмотр картинки). Окно, нужное одной странице, кладётся в её разметку (пример: `#ask` на главной). `id` на странице не должны повторяться: сборка это проверяет.

**Просмотр картинки**: `<a href="/путь/картинка.jpg" data-lightbox data-caption="Подпись">…</a>` открывает `#lightbox` (сертификаты, кадры галереи).

**«Сообщить о поступлении»**: `<button data-notify="es99">` или `JOIM.openNotify('es99')`. Кнопка `data-add-to-cart` у товара «скоро» тоже открывает это окно.

**Уведомление** `.toast`: показывает main.js после «В корзину» («Товар в корзине · Перейти в корзину»). Десктоп: правый нижний угол; телефон: под шапкой, чтобы не закрывать кнопки покупки и нижнюю липкую панель. Исчезает через 4 с (пока под курсором или в фокусе, не исчезает), закрывается крестиком, одно на экране. Своё: `JOIM.toast({ text, linkText, href, timeout })`. На странице `/cart/` после добавления не показывается.

**Корзина в шапке** это ссылка на `/cart/` (выезжающей панели нет). Счётчики и сумма обновляются сами по атрибутам `data-cart-count`, `data-cart-total`.

**Поиск**: тёмный лист сверху (`#search`), ищет по названию, модели, типу и категории; строки результата `.search-row`.

---

## 13. Крошки, таблицы, характеристики, шапка, футер

- **Крошки** собирает сборка из меты страницы (`parents`, `crumb`) и ставит перед содержимым: в разметке страницы их не пишут. На телефоне одна строка с прокруткой.
- **Таблица**: `<div class="table-wrap"><table class="table">…</table></div>`: строки с линиями `--line`, шапка `thead th` плашкой `--surface` с подписями Geist Mono, `tbody th` вторичным цветом, `caption` заголовком.
- **Характеристики** (подпись Geist Mono капсом слева, значение справа):
  ```html
  <dl class="specs">
  {{#each specList}}  <div class="specs__row"><dt>{{{name}}}</dt><dd>{{{value}}}</dd></div>
  {{/each}}</dl>
  ```
- **Шапка** тёмная на всех страницах, липкая (`--sticky-top` = высота полосы и шапки). На странице с экраном-сценой во всю ширину (мета `"darkTop": true`) она прозрачная до первой прокрутки; контент такой страницы начинается под шапкой, первому экрану нужен `padding-top: var(--header-h)`. В шапке логотип без подписи ELECTRONICS (`logo-white.png`: на 36 px подпись не читается), в футере полный `logo-on-dark.png`.
- **Футер** тёмный (`--bg-2`), общий; строка «Мы на маркетплейсах» берёт адреса из `site.marketplaces` (`src/routes.json`).
- **Липкие блоки**: `position: sticky; top: calc(var(--sticky-top) + 24px)` (пример: сводка корзины). Нижняя панель на телефоне: `position: fixed; bottom: 0; z-index: var(--z-sticky); box-shadow: var(--shadow-bar)`; уведомление её не перекрывает.

---

## 14. Переходный слой (старые имена)

В конце main.css (раздел 23) старые токены светлой версии приравнены к новым, чтобы непереведённые страничные стили не разваливались: `--ink` (= `--text`), `--page`, `--muted`, `--surface-hover`, `--accent-deep` (= `--star`), `--blueprint` (= `--bp`), `--font-head` (= `--font`), `--r-sheet`, `--dark`, `--dark-2`, `--on-dark`, `--on-dark-2`, `--line-dark`, а классы `.dark-sheet` и `.on-dark` стали обычной тёмной полосой и светлым текстом. Это костыль на время перевода. Переводя свою страницу:

- заменить старые имена на новые токены и убрать жёстко прописанные светлые цвета (`#fff`, `#EEF1F0` и т. п.) там, где блок по правилу раздела 3 должен быть тёмным;
- убрать `max-width` контейнера и центрирование контента: сетка на всю ширину;
- светлые блоки оформить классами раздела 3, а не своими цветами;
- проверить, что в файле страницы не осталось `var(--font-head)`, `var(--ink)`, `var(--on-dark…)`, `var(--container)`.

Когда ни в одном `pages/*.css` этих имён не останется, раздел 23 main.css удаляется.

---

## 15. Чек-лист перед сдачей страницы

- `node build.mjs` без ошибок и замечаний, 41 адрес.
- Кадры 1440 × 900, 1920 × 1080, 2560 × 1300 и телефон 390: поля 46 / 60 / 60 / 16 px, нет строк длиннее ~72 знаков, нет горизонтальной прокрутки (320–2560).
- Нет тёмного текста на тёмном и светлого на светлом; вокруг рендеров нет прямоугольника снимка; светлые только карточки.
- Шрифты в отчёте `shot.mjs`: Geist 400/500/600/700 и Geist Mono 400/500, без системной подмены.
- Зоны касания от 44 px; `:focus-visible` виден; `--reduced` (prefers-reduced-motion) не ломает страницу.
- Цены, характеристики, отзывы только из справочника; кнопки маркетплейсов ведут на `ozonUrl` и `wbUrl`.
