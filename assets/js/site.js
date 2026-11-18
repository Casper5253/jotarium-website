(function () {
  document.documentElement.classList.add('js');

  var cards = document.querySelectorAll('.dl-card');
  if (cards.length) recommendPlatform(cards);

  function recommendPlatform(cards) {
    var heroButton = document.querySelector('.hero .btn-primary');

    function heroMain() {
      var main = heroButton.parentNode;
      if (main.classList.contains('cta-main')) return main;
      main = document.createElement('div');
      main.className = 'cta-main';
      heroButton.parentNode.insertBefore(main, heroButton);
      main.appendChild(heroButton);
      var size = document.createElement('p');
      size.className = 'cta-size';
      main.appendChild(size);
      var more = document.createElement('a');
      more.className = 'cta-more';
      more.href = '#download';
      more.textContent = 'Other platforms and checksums';
      main.appendChild(more);
      return main;
    }

    function upgradeHero(card) {
      if (!heroButton || !card.dataset.downloadUrl) return;
      var main = heroMain();
      heroButton.href = card.dataset.downloadUrl;
      var label = heroButton.querySelector('[data-release-cta]');
      if (label) label.textContent = card.dataset.downloadLabel;
      main.querySelector('.cta-size').textContent = card.dataset.downloadSize;
    }

    function apply(platform) {
      if (!platform) return;
      cards.forEach(function (card) {
        if (card.getAttribute('data-platform') !== platform) return;
        card.classList.add('is-recommended');
        var pick = card.querySelector('.dl-pick');
        if (pick) pick.hidden = false;
        upgradeHero(card);
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
