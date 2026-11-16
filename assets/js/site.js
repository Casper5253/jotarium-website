(function () {
  document.documentElement.classList.add('js');

  var cards = document.querySelectorAll('.dl-card');
  if (cards.length) recommendPlatform(cards);

  function recommendPlatform(cards) {
    function apply(platform) {
      if (!platform) return;
      cards.forEach(function (card) {
        if (card.getAttribute('data-platform') !== platform) return;
        card.classList.add('is-recommended');
        var pick = card.querySelector('.dl-pick');
        if (pick) pick.hidden = false;
      });
    }

    function fallback() {
      if (/Windows/i.test(navigator.userAgent)) return 'win-x64';
      return null;
    }

    var data = navigator.userAgentData;
    if (data && data.getHighEntropyValues) {
      data.getHighEntropyValues(['architecture']).then(function (values) {
        if (data.platform === 'Windows') apply('win-x64');
        else if (data.platform === 'macOS') apply(values.architecture === 'x86' ? 'mac-x64' : 'mac-arm64');
      }).catch(function () {
        apply(fallback());
      });
    } else {
      apply(fallback());
    }
  }

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(function (el) { observer.observe(el); });
})();
