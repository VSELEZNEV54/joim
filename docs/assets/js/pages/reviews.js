/* reviews: фильтр стены отзывов по модели (src/pages/reviews.html).
   Чипы: кнопки с aria-pressed; карточки чужой модели получают hidden, колонки перестраиваются сами. Без скрипта чипы скрыты и видны все отзывы. */
(function () {
  'use strict';

  var box = document.querySelector('[data-rev]');
  if (!box) return;
  var chips = Array.prototype.slice.call(box.querySelectorAll('[data-rev-chip]'));
  var items = Array.prototype.slice.call(box.querySelectorAll('[data-rev-item]'));
  var status = box.querySelector('[data-rev-status]');
  var plural = window.JOIM && window.JOIM.plural;

  function apply(key) {
    var shown = 0;
    items.forEach(function (li) {
      var on = key === 'all' || li.getAttribute('data-rev-item') === key;
      li.hidden = !on;
      if (on) shown += 1;
    });
    chips.forEach(function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-rev-chip') === key ? 'true' : 'false');
    });
    if (status) status.textContent = 'Показано: ' + shown + ' ' + (plural ? plural(shown, ['отзыв', 'отзыва', 'отзывов']) : 'отзывов');
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { apply(chip.getAttribute('data-rev-chip')); });
  });
})();
