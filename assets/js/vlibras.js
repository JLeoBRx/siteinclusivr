/* =========================================================
   InclusiVR — VLibras (tradução automática para LIBRAS)
   Ferramenta pública e gratuita do Governo Federal:
   https://www.gov.br/governodigital/pt-br/vlibras
   ========================================================= */
(function () {
  'use strict';

  const ROOT = 'https://vlibras.gov.br/app';
  const buttons = Array.from(document.querySelectorAll('[data-libras-toggle]'));
  let ready = false;

  const accessButton = () => document.querySelector('[vw-access-button]');
  const wrapper = () => document.querySelector('[vw-plugin-wrapper]');
  const rendered = () => {
    const el = accessButton();
    return !!(el && el.children.length);
  };

  function markReady() {
    if (ready) return;
    ready = true;
    document.documentElement.classList.add('has-vlibras');
    buttons.forEach((b) => { b.hidden = false; });
  }

  function open() {
    const el = accessButton();
    if (!el || !ready) return;
    const w = wrapper();
    if (w && w.classList.contains('active')) return; // já está aberto
    el.click();
  }

  buttons.forEach((b) => b.addEventListener('click', open));

  window.InclusiVRLibras = {
    open,
    init() {
      if (!window.VLibras || typeof window.VLibras.Widget !== 'function') return;
      try {
        new window.VLibras.Widget(ROOT);
      } catch (err) {
        console.warn('[vlibras]', err);
        return;
      }
      // Versões do plugin inicializam no evento "load" da janela; se ele já
      // ocorreu, disparamos a inicialização manualmente.
      let tries = 0;
      const check = () => {
        if (rendered()) { markReady(); return; }
        if (document.readyState === 'complete' && tries === 4 && typeof window.onload === 'function') {
          window.onload();
        }
        if (++tries < 60) setTimeout(check, 250);
      };
      check();
      window.addEventListener('load', () => setTimeout(() => { if (rendered()) markReady(); }, 300));
    }
  };
})();
