/**
 * Keyboard shortcuts. Everything here is an enhancement — every action is also
 * a real button or link, so the game works untouched with JS disabled.
 */
(function () {
  'use strict';

  var real = document.querySelector('button[name="guess"][value="real"]');
  var fake = document.querySelector('button[name="guess"][value="fake"]');
  var next = document.querySelector('[data-autofocus]');

  var shortcuts = {
    r: real,
    f: fake,
    arrowleft: real,
    arrowright: fake,
    enter: next,
    ' ': next,
    n: next,
  };

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // Let the browser handle keys aimed at something already focused.
    var target = event.target;
    if (target && target.closest && target.closest('a, button, input, textarea, select')) return;

    var action = shortcuts[event.key.toLowerCase()];
    if (!action) return;

    event.preventDefault();
    action.click();
  });
})();
