/* =========================================================
   InclusiVR — interações gerais do site
   ========================================================= */
(function () {
  'use strict';

  const WHATSAPP_NUMBER = '5516994002335';
  const WA_MESSAGES = {
    geral: 'Olá, InclusiVR! Vim pelo site e gostaria de mais informações.',
    compra: 'Olá, InclusiVR! Tenho interesse em comprar o livro SinalizaAção.',
    b2b: 'Olá, InclusiVR! Represento uma escola/instituição e gostaria de conhecer as soluções da InclusiVR para instituições.',
    parcerias: 'Olá, InclusiVR! Gostaria de conversar sobre parcerias e investimentos.',
    imprensa: 'Olá, InclusiVR! Sou da imprensa e gostaria de falar com a equipe.'
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const waLink = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

  const storage = {
    get(key) { try { return window.sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { window.sessionStorage.setItem(key, value); } catch (e) { /* indisponível */ } }
  };

  /* ---------- ano do rodapé ---------- */
  $$('[data-current-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- links do WhatsApp com mensagem pronta ---------- */
  $$('[data-wa]').forEach((el) => {
    const msg = WA_MESSAGES[el.dataset.wa] || WA_MESSAGES.geral;
    el.setAttribute('href', waLink(msg));
  });

  /* ---------- redes sociais sem URL definida ficam ocultas ---------- */
  $$('[data-social]').forEach((el) => {
    if (!el.getAttribute('href') || el.getAttribute('href') === '#') el.hidden = true;
  });
  const social = $('.social');
  if (social && !$$('a:not([hidden])', social).length) social.hidden = true;

  /* ---------- header ---------- */
  const header = $('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- menu mobile ---------- */
  const menuBtn = $('[data-menu-toggle]');
  const mobileNav = $('[data-mobile-nav]');
  function setMenu(open) {
    if (!menuBtn || !mobileNav) return;
    mobileNav.hidden = !open;
    header.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    $('use', menuBtn).setAttribute('href', open ? '#i-x' : '#i-menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => setMenu(mobileNav.hidden));
    $$('a, [data-libras-toggle]', mobileNav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    window.addEventListener('resize', () => { if (window.innerWidth > 1080) setMenu(false); });
  }

  /* ---------- link ativo na navegação ---------- */
  const navLinks = $$('.nav__link');
  if ('IntersectionObserver' in window && navLinks.length) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.remove('is-active'));
        const link = map.get(entry.target.id);
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => io.observe(s));
  }

  /* ---------- animações de entrada ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- brilho que segue o cursor ---------- */
  if (finePointer) {
    $$('[data-glow]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- inclinação 3D (tilt) ---------- */
  if (finePointer && !reducedMotion) {
    $$('[data-tilt]').forEach((el) => {
      const host = el.parentElement;
      host.addEventListener('pointermove', (e) => {
        const r = host.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 12}deg)`;
      });
      host.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- linha do tempo (status pelo ano atual) ---------- */
  const timeline = $('[data-timeline]');
  if (timeline) {
    const year = new Date().getFullYear();
    const items = $$('.tl-item', timeline);
    let lastReached = -1;
    items.forEach((item, i) => {
      const y = Number(item.dataset.year);
      const status = $('[data-status]', item);
      if (y < year) { item.classList.add('is-done'); status.textContent = 'Concluído'; lastReached = i; }
      else if (y === year) { item.classList.add('is-current'); status.textContent = 'Em andamento'; lastReached = i; }
      else { status.textContent = 'Próximos passos'; }
    });
    const pct = items.length > 1 ? Math.max(0, lastReached) / (items.length - 1) : 0;
    const apply = () => timeline.style.setProperty('--progress', `${Math.round(pct * 100)}%`);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { apply(); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(timeline);
    } else { apply(); }
  }

  /* ---------- QR Codes ---------- */
  function renderQRCodes() {
    if (typeof window.qrcode !== 'function') return;
    $$('[data-qr]').forEach((el) => {
      const target = el.dataset.qr;
      let url;
      try { url = new URL(target, window.location.href); } catch (e) { return; }
      if (!/^https?:$/.test(url.protocol)) {
        const panel = el.closest('[data-qr-panel]');
        if (panel) panel.hidden = true; else el.hidden = true;
        return;
      }
      const qr = window.qrcode(0, 'M');
      qr.addData(url.href);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      el.setAttribute('role', 'img');
    });
  }
  renderQRCodes();

  /* ---------- widget flutuante do WhatsApp ---------- */
  const widget = $('[data-wa-widget]');
  if (widget) {
    const panel = $('[data-wa-panel]', widget);
    const toggle = $('[data-wa-toggle]', widget);
    const teaser = $('[data-wa-teaser]', widget);
    const setOpen = (open) => {
      panel.hidden = !open;
      widget.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      $('use', toggle).setAttribute('href', open ? '#i-x' : '#i-whatsapp');
      if (open) { teaser.hidden = true; storage.set('wa-teaser', '1'); }
    };
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    $('[data-wa-close]', widget).addEventListener('click', () => setOpen(false));
    $('[data-wa-teaser-close]', widget).addEventListener('click', () => { teaser.hidden = true; storage.set('wa-teaser', '1'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); } });
    document.addEventListener('click', (e) => { if (!panel.hidden && !widget.contains(e.target)) setOpen(false); });
    if (!storage.get('wa-teaser')) {
      setTimeout(() => {
        if (!panel.hidden) return;
        teaser.hidden = false;
        setTimeout(() => { teaser.hidden = true; }, 10000);
      }, 7000);
    }
  }

  /* ---------- formulário de contato ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(form, names) {
    let firstInvalid = null;
    names.forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      const value = input.value.trim();
      const ok = name === 'email' ? EMAIL_RE.test(value) : value.length > 1;
      input.closest('.field')?.classList.toggle('is-invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }
  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-ok', kind === 'ok');
    el.classList.toggle('is-error', kind === 'error');
  }
  async function submitForm(form) {
    const res = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  const contactForm = $('[data-contact-form]');
  if (contactForm) {
    const status = $('[data-form-status]', contactForm);
    $$('input, textarea', contactForm).forEach((el) => {
      el.addEventListener('input', () => {
        el.closest('.field')?.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
      });
    });

    $('[data-send="whatsapp"]', contactForm).addEventListener('click', () => {
      if (!validate(contactForm, ['nome', 'mensagem'])) {
        setStatus(status, 'Preencha seu nome e a mensagem para continuar.', 'error');
        return;
      }
      const f = contactForm.elements;
      const lines = [
        '*Contato pelo site InclusiVR*',
        '',
        `*Nome:* ${f.nome.value.trim()}`,
        f.email.value.trim() ? `*E-mail:* ${f.email.value.trim()}` : null,
        f.telefone.value.trim() ? `*Telefone:* ${f.telefone.value.trim()}` : null,
        `*Assunto:* ${f.assunto.value}`,
        '',
        f.mensagem.value.trim()
      ].filter((l) => l !== null);
      window.open(waLink(lines.join('\n')), '_blank', 'noopener');
      setStatus(status, 'Abrimos o WhatsApp com a sua mensagem pronta. É só tocar em enviar.', 'ok');
    });

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate(contactForm, ['nome', 'email', 'mensagem'])) {
        setStatus(status, 'Confira os campos destacados.', 'error');
        return;
      }
      const btn = $('[data-send="email"]', contactForm);
      btn.disabled = true;
      setStatus(status, 'Enviando…');
      try {
        await submitForm(contactForm);
        contactForm.reset();
        setStatus(status, 'Mensagem enviada com sucesso! Nossa equipe retornará em breve.', 'ok');
      } catch (err) {
        setStatus(status, 'Não foi possível enviar agora. Tente novamente ou fale conosco pelo WhatsApp.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  const newsletterForm = $('[data-newsletter-form]');
  if (newsletterForm) {
    const status = $('[data-form-status]', newsletterForm);
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterForm.elements.email.value.trim();
      if (!EMAIL_RE.test(email)) {
        setStatus(status, 'Digite um e-mail válido.', 'error');
        newsletterForm.elements.email.focus();
        return;
      }
      setStatus(status, 'Enviando…');
      try {
        await submitForm(newsletterForm);
        newsletterForm.reset();
        setStatus(status, 'Inscrição confirmada! Bem-vindo(a) à InclusiNews.', 'ok');
      } catch (err) {
        setStatus(status, 'Não foi possível concluir a inscrição agora. Tente novamente em instantes.', 'error');
      }
    });
  }

  /* ---------- seletor de idiomas (Google Tradutor) ---------- */
  const lang = $('[data-lang]');
  if (lang) {
    const btn = $('[data-lang-toggle]', lang);
    const menu = $('[data-lang-menu]', lang);
    const current = $('[data-lang-current]', lang);
    const options = $$('[data-lang-option]', lang);

    const readCookieLang = () => {
      const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
      if (!m || !m[1]) return 'pt';
      const parts = decodeURIComponent(m[1]).split('/');
      return parts[2] || 'pt';
    };
    const writeCookie = (value) => {
      const expire = value ? '' : '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      const v = value ? `/pt/${value}` : '';
      document.cookie = `googtrans=${v}; path=/${expire}`;
      const parts = window.location.hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        const domain = parts.slice(i).join('.');
        document.cookie = `googtrans=${v}; path=/; domain=${domain}${expire}`;
        document.cookie = `googtrans=${v}; path=/; domain=.${domain}${expire}`;
      }
    };
    const isTranslated = () => /translated-(ltr|rtl)/.test(document.documentElement.className);

    const markSelected = (code) => {
      options.forEach((o) => o.setAttribute('aria-selected', String(o.dataset.langOption === code)));
      const opt = options.find((o) => o.dataset.langOption === code);
      current.textContent = opt ? $('small', opt).textContent : 'PT';
    };

    const setOpen = (open) => {
      lang.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) (options.find((o) => o.getAttribute('aria-selected') === 'true') || options[0]).focus();
    };

    const translateTo = (code) => {
      if (code === 'pt') {
        const needsReload = isTranslated() || readCookieLang() !== 'pt';
        writeCookie(null);
        markSelected('pt');
        if (needsReload) window.location.reload();
        return;
      }
      writeCookie(code);
      markSelected(code);
      const fire = () => {
        const combo = document.querySelector('.goog-te-combo');
        if (!combo) return false;
        combo.value = code;
        combo.dispatchEvent(new Event('change'));
        setTimeout(() => {
          if (!isTranslated()) { combo.value = code; combo.dispatchEvent(new Event('change')); }
        }, 900);
        return true;
      };
      if (!fire()) {
        let tries = 0;
        const timer = setInterval(() => {
          tries += 1;
          if (fire()) clearInterval(timer);
          else if (tries > 25) { clearInterval(timer); window.location.reload(); }
        }, 200);
      }
    };

    markSelected(readCookieLang());
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!lang.classList.contains('is-open')); });
    options.forEach((o, i) => {
      o.addEventListener('click', () => { setOpen(false); translateTo(o.dataset.langOption); btn.focus(); });
      o.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); options[(i + 1) % options.length].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
      });
    });
    document.addEventListener('click', (e) => { if (!lang.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lang.classList.contains('is-open')) { setOpen(false); btn.focus(); }
      if (e.key === 'Escape' && mobileNav && !mobileNav.hidden) setMenu(false);
    });
  }
})();
