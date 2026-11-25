(function(){
  function isPublicMainNavPage(){
    var nav = document.getElementById('nav');
    if(!nav || nav.dataset.sharedMainNav === 'false'){
      return false;
    }

    return !nav.querySelector('.btn-logout');
  }

  function getPublicPageKey(){
    var path = window.location.pathname;
    var parts = path.split('/').filter(Boolean);
    var page = (parts[parts.length - 1] || 'index.html').toLowerCase();
    var isInServicesFolder = parts.indexOf('services') !== -1;

    var routes = {
      'home':        ['index.html', ''],
      'about':       ['who-we-are.html'],
      'library':     ['legal-library.html'],
      'magazine':    ['magazine.html'],
      'academy':     ['law-academy.html'],
      'elitigation': ['e-litigation.html'],
      'methodology': ['our-methodology.html'],
      'contact':     ['contact-us.html', 'contact-success.html']
    };

    for (var key in routes) {
      if (routes[key].indexOf(page) !== -1) return key;
    }

    // Specialized matching for the Services section and its sub-pages
    if (
      isInServicesFolder || 
      page === 'services.html' || 
      page === 'services' || 
      /^services?(-.*)?(\.html)?$/.test(page)
    ) {
      return 'services';
    }

    return '';
  }

  function publicNavItem(item, activeKey){
    var activeClass = item.key === activeKey ? ' class="active"' : '';
    return '<li><a href="' + item.href + '"' + activeClass + '><span class="ar">' + item.ar + '</span><span class="en">' + item.en + '</span></a></li>';
  }

  function publicMenuItem(item, activeKey){
    var activeClass = item.key === activeKey ? ' class="active"' : '';
    return '<a href="' + item.href + '"' + activeClass + ' onclick="closeMM()"><span class="ar">' + item.ar + '</span><span class="en">' + item.mobileEn + '</span></a>';
  }

  function syncLanguageButtons(){
    var currentLang = document.documentElement.lang === 'en' ? 'en' : 'ar';
    var arButton = document.getElementById('btn-ar');
    var enButton = document.getElementById('btn-en');
    var tabsButton = document.getElementById('btn-tabs');
    var menu = document.getElementById('mobile-menu') || document.querySelector('.mobile-menu');
    var menuOpen = !!(menu && menu.classList.contains('open'));

    if(arButton){
      arButton.classList.toggle('active', currentLang === 'ar');
      arButton.setAttribute('aria-pressed', currentLang === 'ar' ? 'true' : 'false');
    }

    if(enButton){
      enButton.classList.toggle('active', currentLang === 'en');
      enButton.setAttribute('aria-pressed', currentLang === 'en' ? 'true' : 'false');
    }

    if(tabsButton){
      tabsButton.classList.toggle('active', menuOpen);
      tabsButton.setAttribute('aria-pressed', menuOpen ? 'true' : 'false');
    }
  }

  function getPreferredLanguage(){
    try{
      var storedLang = localStorage.getItem('ask-lang');
      if(storedLang === 'ar' || storedLang === 'en'){
        return storedLang;
      }
    } catch(error){}

    return document.documentElement.lang === 'en' ? 'en' : 'ar';
  }

  function defaultSetLang(lang){
    var nextLang = lang === 'en' ? 'en' : 'ar';
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === 'ar' ? 'rtl' : 'ltr';

    try{
      localStorage.setItem('ask-lang', nextLang);
    } catch(error){}

    syncLanguageButtons();
  }

  function loadPublicFonts(){
    if(document.getElementById('ask-public-fonts')){
      return;
    }

    var googleFonts = document.createElement('link');
    googleFonts.rel = 'preconnect';
    googleFonts.href = 'https://fonts.googleapis.com';
    document.head.appendChild(googleFonts);

    var googleFontsStatic = document.createElement('link');
    googleFontsStatic.rel = 'preconnect';
    googleFontsStatic.href = 'https://fonts.gstatic.com';
    googleFontsStatic.crossOrigin = 'anonymous';
    document.head.appendChild(googleFontsStatic);

    var fontStylesheet = document.createElement('link');
    fontStylesheet.id = 'ask-public-fonts';
    fontStylesheet.rel = 'stylesheet';
    fontStylesheet.href = 'https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;600;800&family=Amiri:wght@400;700&family=Archivo:wght@400;600;800&display=swap';
    document.head.appendChild(fontStylesheet);
  }

  function renderPublicMainNav(){
    if(!isPublicMainNavPage()){
      return;
    }

    document.body.classList.add('ask-public-site');
    loadPublicFonts();

    var nav = document.getElementById('nav');
    var menu = document.getElementById('mobile-menu') || document.querySelector('.mobile-menu');
    var activeKey = getPublicPageKey();
    var navItems = [
      { href: 'index.html', key: 'home', ar: 'الرئيسية', en: 'Home', mobileEn: 'Home' },
      { href: 'who-we-are.html', key: 'about', ar: 'من نحن', en: 'Who We Are', mobileEn: 'Who We Are' },
      { href: 'services.html', key: 'services', ar: 'الخدمات', en: 'Services', mobileEn: 'Services' },
      { href: 'legal-library.html', key: 'library', ar: 'المكتبة القانونية', en: 'Legal Library', mobileEn: 'Legal Library' },
      { href: 'magazine.html', key: 'magazine', ar: 'المجلة', en: 'Legal Magazine', mobileEn: 'Legal Magazine' },
      { href: 'law-academy.html', key: 'academy', ar: 'أكاديمية الحقوق', en: 'Law Academy', mobileEn: 'Law Academy' },
      { href: 'e-litigation.html', key: 'elitigation', ar: 'التقاضي الإلكتروني', en: 'E-Litigation', mobileEn: 'E-Litigation' },
      { href: 'contact-us.html', key: 'contact', ar: 'تواصل', en: 'Contact', mobileEn: 'Contact' }
    ];

    nav.classList.add('site-main-nav');
    nav.innerHTML = [
      '<a class="site-main-logo" href="index.html" aria-label="ASK home">',
      '  <img class="site-main-logo-image" src="assets/media/logo-ask-new.png" alt="ASK Legal Advisors and Law Firm">',
      '  <img class="site-main-signature" src="assets/media/ask-partners-signature.webp" alt="عمرو سعيد قطب — علاء كمال يونس · مستشارون ومحامون ومحكمون">',
      '</a>',
      '<ul class="nav-links">',
      navItems.map(function(item){ return publicNavItem(item, activeKey); }).join(''),
      '</ul>',
      '<div class="nav-actions">',
      '  <button class="site-back-button" type="button" aria-label="العودة للصفحة السابقة / Go back" title="العودة للصفحة السابقة / Go back">',
      '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7"></path></svg>',
      '  </button>',
      '  <div class="ls">',
      '    <button class="lb" id="btn-ar" type="button" onclick="setLang(\'ar\')" title="العربية">AR</button>',
      '    <button class="lb" id="btn-en" type="button" onclick="setLang(\'en\')" title="English">EN</button>',
      '    <button class="lb" id="btn-tabs" type="button" onclick="toggleMM()" title="Site sections" data-mobile="tabs">☰</button>',
      '  </div>',
      '</div>'
    ].join('');
    nav.querySelector('.site-back-button').addEventListener('click', function(){
      if(window.history.length > 1){
        window.history.back();
      } else {
        window.location.assign('index.html');
      }
    });

    if(!menu){
      menu = document.createElement('div');
      nav.insertAdjacentElement('afterend', menu);
    }

    menu.id = 'mobile-menu';
    menu.className = 'mobile-menu site-main-nav-menu';
    menu.innerHTML = [
      navItems.map(function(item){ return publicMenuItem(item, activeKey); }).join(''),
      '<a href="contact-us.html" class="mob-cta" onclick="closeMM()"><span class="ar">ابدأ الآن</span><span class="en">Get in Touch</span></a>'
    ].join('');

    syncLanguageButtons();
  }

  function renderPublicFooter(){
    var footer = document.querySelector('footer');
    if(!footer || footer.dataset.sharedFooter === 'false'){
      return;
    }

    var navItems = [
      { href: 'who-we-are.html', ar: 'من نحن', en: 'About' },
      { href: 'services.html', ar: 'الخدمات', en: 'Services' },
      { href: 'legal-library.html', ar: 'المكتبة', en: 'Library' },
      { href: 'magazine.html', ar: 'المجلة', en: 'Legal Magazine' },
      { href: 'law-academy.html', ar: 'الأكاديمية', en: 'Academy' },
      { href: 'e-litigation.html', ar: 'التقاضي الإلكتروني', en: 'E-Litigation' },
      { href: 'contact-us.html', ar: 'تواصل', en: 'Contact' }
    ];

    // Pages that already show a full contact/social block of their own
    // (e.g. index.html's #contact section) skip the footer's social row
    // so the same icons are not shown twice on that page.
    var hasOwnContactSection = !!document.getElementById('contact') || !!document.querySelector('.channel');

    var socialItems = [
      { href: askLink('emailGeneral', 'mailto:hello@askuniversal.com'), label: 'Email', icon: '<path class="fill" d="M2.4 6.6c0-.99.81-1.8 1.8-1.8h15.6c.99 0 1.8.81 1.8 1.8v10.8c0 .99-.81 1.8-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8V6.6Zm2.53-.3L12 12.09 19.07 6.3H4.93Zm15.47 1.4-7.86 6.44a1.2 1.2 0 0 1-1.52 0L3.6 7.7v9.7c0 .33.27.6.6.6h15.6a.6.6 0 0 0 .6-.6V7.7Z"/>' },
      { href: askLink('whatsapp', 'https://wa.me/201006635664'), label: 'WhatsApp', icon: '<path class="fill" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.768.966-.941 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.787-1.48-1.759-1.653-2.056-.173-.298-.019-.459.13-.608.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.075-.792.372-.272.298-1.04 1.016-1.04 2.478 0 1.462 1.065 2.875 1.214 3.074.149.198 2.099 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z"/><path class="fill" d="M20.52 3.449A11.815 11.815 0 0 0 12.004.001C5.495.001.201 5.294.2 11.803a11.79 11.79 0 0 0 1.611 5.955L.001 24l6.405-1.676a11.826 11.826 0 0 0 5.596 1.429h.005c6.509 0 11.804-5.294 11.804-11.803a11.79 11.79 0 0 0-3.291-8.501Zm-8.516 18.31h-.004a9.86 9.86 0 0 1-5.026-1.378l-.36-.214-3.8.995 1.014-3.703-.234-.379a9.86 9.86 0 0 1-1.51-5.277c.002-5.441 4.43-9.869 9.875-9.869a9.81 9.81 0 0 1 6.983 2.893 9.825 9.825 0 0 1 2.887 6.996c-.003 5.441-4.43 9.869-9.875 9.869Z"/>' },
      { href: 'https://www.linkedin.com/company/askuniversal/posts/?feedView=all', label: 'LinkedIn', icon: '<path class="fill" d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 7.06A1.97 1.97 0 1 0 5.2 3.12a1.97 1.97 0 0 0 .05 3.94ZM20 12.82c0-3.46-1.85-5.07-4.32-5.07-1.99 0-2.88 1.1-3.37 1.87V8.5H8.94c.04.74 0 11.5 0 11.5h3.37v-6.42c0-.34.03-.68.12-.93.27-.68.88-1.38 1.9-1.38 1.34 0 1.88 1.03 1.88 2.54V20H20v-7.18Z"/>' },
      { href: 'https://www.facebook.com/share/18GAk5mqKt/?mibextid=wwXIfr', label: 'Facebook', icon: '<path class="fill" d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.87.24-1.46 1.49-1.46H16.5V5.02c-.26-.04-1.15-.11-2.18-.11-2.15 0-3.62 1.31-3.62 3.72V11H8.25v3h2.45v7h2.8Z"/>' },
      { href: 'https://unglobalcompact.org/what-is-gc/participants/204352-Amr-Saied-Kotb-Founder-ASK-Legal-Advisors-and-Law-Firm', label: 'UN Global Compact', icon: '<path class="fill" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6.4h-2.68a13.7 13.7 0 0 0-1.2-3.32A8.05 8.05 0 0 1 18.9 8.4ZM12 4.1c.72.98 1.3 2.4 1.63 4.3h-3.26C10.7 6.5 11.28 5.08 12 4.1ZM4.26 14a7.9 7.9 0 0 1 0-4h3.06a20.6 20.6 0 0 0 0 4H4.26Zm.84 2h2.68c.28 1.2.68 2.32 1.2 3.32A8.05 8.05 0 0 1 5.1 16Zm2.68-8H5.1a8.05 8.05 0 0 1 3.88-3.32c-.52 1-.92 2.12-1.2 3.32ZM12 19.9c-.72-.98-1.3-2.4-1.63-4.3h3.26c-.33 1.9-.91 3.32-1.63 4.3ZM14 14h-4a18.5 18.5 0 0 1 0-4h4a18.5 18.5 0 0 1 0 4Zm1.02 5.32c.52-1 .92-2.12 1.2-3.32h2.68a8.05 8.05 0 0 1-3.88 3.32ZM16.68 14a20.6 20.6 0 0 0 0-4h3.06a7.9 7.9 0 0 1 0 4h-3.06Z"/>' }
    ];

    // Latin brand strings are wrapped in an LTR isolate so their trailing
    // full stop does not jump to the wrong side inside an RTL page.
    function ltr(text){
      return '<span dir="ltr" class="ltr-text">' + text + '</span>';
    }

    var socialMarkup = socialItems.map(function(item){
      return '<a class="social-' + item.label.toLowerCase().replace(/\s+/g, '-') + '" href="' + item.href + '" target="_blank" rel="noopener noreferrer" aria-label="' + item.label +
             '"><svg viewBox="0 0 24 24" aria-hidden="true">' + item.icon + '</svg></a>';
    }).join('');

    footer.innerHTML = [
      '<div class="footer-wrap">',

      '  <div class="footer-brand">',
      '    <span class="footer-brand-name"><img class="footer-brand-logo" src="assets/media/logo-ask-new.png" alt="ASK"></span>',
      '    <img class="footer-signature" src="assets/media/ask-partners-signature.webp" alt="عمرو سعيد قطب — علاء كمال يونس · مستشارون ومحامون ومحكمون / Amr Saied Kotb — Alaa Kamal Younes · Legal Advisors, Attorneys &amp; Arbitrators" width="1200" loading="lazy">',
      '  </div>',

      '  <ul class="footer-links">',
      navItems.map(function(item){
        return '<li><a href="' + item.href + '"><span class="ar">' + item.ar + '</span><span class="en">' + item.en + '</span></a></li>';
      }).join(''),
      '  </ul>',

      hasOwnContactSection ? '' : '  <div class="footer-social">' + socialMarkup + '</div>',

      '  <div class="footer-bottom">',
      '    <p class="footer-copy">',
      '      <span class="ar">جميع الحقوق محفوظة &copy; 2026 — ASK للمحاماة والاستشارات القانونية (ASKUNIVERSAL).</span>',
      '      <span class="en">' + ltr('&copy; 2026 ASK Legal Advisors &amp; Law Firm (ASKUNIVERSAL). All Rights Reserved.') + '</span>',
      '    </p>',
      '    <p class="footer-legal">',
      '      <span class="ar">جميع المحتويات المنشورة على هذا الموقع، من نصوص ومقالات وأبحاث وتصميمات وشعارات وصور، مملوكة لمكتب ASK ومحمية بموجب قانون حماية حقوق الملكية الفكرية المصري رقم 82 لسنة 2002 والاتفاقيات الدولية ذات الصلة. ويُحظر نسخها أو إعادة نشرها أو استغلالها كليًا أو جزئيًا دون إذن كتابي مسبق. والمعلومات الواردة بالموقع للتثقيف القانوني العام، ولا تُعد استشارة قانونية ولا تُنشئ علاقة محامٍ بموكل.</span>',
      '      <span class="en">All content on this website, including text, articles, research, designs, logos and images, is the property of ASK and is protected under Egyptian Intellectual Property Law No. 82 of 2002 and applicable international conventions. No part may be copied, republished or exploited, in whole or in part, without prior written permission. The information on this website is for general legal awareness only; it does not constitute legal advice and does not create an attorney–client relationship.</span>',
      '    </p>',
      '  </div>',

      '</div>'
    ].join('');
  }

  function askLink(key, fallback){
    var c = window.ASK_CONTACT;
    return (c && c.links && c.links[key]) || fallback;
  }

  function renderFloatingWhatsApp(){
    if(!isPublicMainNavPage() || document.querySelector('.site-whatsapp-float')){
      return;
    }

    var link = document.createElement('a');
    link.className = 'site-whatsapp-float';
    link.href = askLink('whatsapp', 'https://wa.me/201006635664');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'تواصل معنا عبر واتساب / Contact us on WhatsApp');
    link.title = 'WhatsApp';
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.768.966-.941 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.787-1.48-1.759-1.653-2.056-.173-.298-.019-.459.13-.608.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.075-.792.372-.272.298-1.04 1.016-1.04 2.478 0 1.462 1.065 2.875 1.214 3.074.149.198 2.099 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z"/>' +
      '<path d="M20.52 3.449A11.815 11.815 0 0 0 12.004.001C5.495.001.201 5.294.2 11.803a11.79 11.79 0 0 0 1.611 5.955L.001 24l6.405-1.676a11.826 11.826 0 0 0 5.596 1.429h.005c6.509 0 11.804-5.294 11.804-11.803a11.79 11.79 0 0 0-3.291-8.501Zm-8.516 18.31h-.004a9.86 9.86 0 0 1-5.026-1.378l-.36-.214-3.8.995 1.014-3.703-.234-.379a9.86 9.86 0 0 1-1.51-5.277c.002-5.441 4.43-9.869 9.875-9.869a9.81 9.81 0 0 1 6.983 2.893 9.825 9.825 0 0 1 2.887 6.996c-.003 5.441-4.43 9.869-9.875 9.869Z"/>' +
      '</svg>';
    document.body.appendChild(link);
  }

  function getNavParts(){
    return {
      toggle: document.getElementById('btn-tabs') || document.getElementById('nav-toggle') || document.querySelector('.nav-toggle'),
      menu: document.getElementById('mobile-menu') || document.querySelector('.mobile-menu')
    };
  }

  function syncMenuState(isOpen){
    var parts = getNavParts();
    if(!parts.toggle || !parts.menu){
      return;
    }

    parts.menu.classList.toggle('open', isOpen);
    parts.toggle.classList.toggle('open', isOpen);
    parts.toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    parts.menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('menu-open', isOpen);
    syncLanguageButtons();
    
    if(isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }

  function closeMenu(){
    syncMenuState(false);
  }

  function openMenu(){
    syncMenuState(true);
  }

  function initPageZoom(){
    if(document.documentElement.classList.contains('ask-page-zoom-ready')){
      return;
    }

    var root = document.documentElement;
    var minScale = 0.8;
    var maxScale = 1.3;
    var step = 0.1;
    var scale = 1;
    var storageKey = 'ask-page-zoom';
    var storedScale;

    try{
      storedScale = Number(localStorage.getItem(storageKey));
    } catch(error){
      storedScale = 1;
    }

    if(isFinite(storedScale) && storedScale >= minScale && storedScale <= maxScale){
      scale = Math.round(storedScale * 10) / 10;
    }

    function captureFontSizes(node, isDynamic){
      if(!node || node.nodeType !== 1){
        return;
      }

      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        var element = walker.currentNode.parentElement;
        if(!element){
          continue;
        }
        if(
          (element.closest && element.closest('input, select, textarea, option, script, style, template, svg')) ||
          element.hasAttribute('data-ask-page-zoom-text')
        ){
          continue;
        }

        var fontSize = parseFloat(window.getComputedStyle(element).fontSize);
        if(!isFinite(fontSize) || fontSize <= 0){
          continue;
        }
        if(isDynamic){
          fontSize /= scale;
        }

        element.style.setProperty('--ask-page-zoom-font-base', fontSize + 'px');
        element.setAttribute('data-ask-page-zoom-text', '');
      }
    }

    function applyScale(nextScale){
      scale = Math.max(minScale, Math.min(maxScale, Math.round(nextScale * 10) / 10));
      root.style.setProperty('--ask-page-zoom-scale', String(scale));
      root.classList.add('ask-page-zoom-ready');

      try{
        localStorage.setItem(storageKey, String(scale));
      } catch(error){}
    }

    var baseRootFontSize = parseFloat(window.getComputedStyle(root).fontSize);
    if(isFinite(baseRootFontSize) && baseRootFontSize > 0){
      root.style.setProperty('--ask-page-zoom-base-root-font-size', baseRootFontSize + 'px');
    }

    captureFontSizes(document.body, false);
    document.addEventListener('wheel', function(event){
      if(!event.ctrlKey || event.deltaY === 0){
        return;
      }

      event.preventDefault();
      applyScale(scale + (event.deltaY < 0 ? step : -step));
    }, { passive: false });

    var contentObserver = new MutationObserver(function(records){
      records.forEach(function(record){
        record.addedNodes.forEach(function(node){
          if(node.nodeType === 1){
            captureFontSizes(node, true);
          }
        });
      });
    });
    contentObserver.observe(document.body, { childList: true, subtree: true });

    applyScale(scale);
  }

  function toggleMenu(forceState){
    var parts = getNavParts();
    if(!parts.toggle || !parts.menu){
      return;
    }

    var nextState = typeof forceState === 'boolean' ? forceState : !parts.menu.classList.contains('open');
    syncMenuState(nextState);
  }

  window.setLang = window.setLang || defaultSetLang;

  function initMenu(){
    renderPublicMainNav();
    renderPublicFooter();
    renderFloatingWhatsApp();
    initPageZoom();

    if(window.setLang === defaultSetLang){
      window.setLang(getPreferredLanguage());
    } else {
      syncLanguageButtons();
    }

    var parts = getNavParts();
    if(!parts.toggle || !parts.menu || parts.toggle.dataset.siteNavReady === 'true'){
      return;
    }

    if(!parts.menu.id){
      parts.menu.id = 'mobile-menu';
    }

    parts.toggle.dataset.siteNavReady = 'true';
    parts.toggle.setAttribute('type', 'button');
    parts.toggle.setAttribute('aria-controls', parts.menu.id);
    parts.toggle.setAttribute('aria-expanded', 'false');
    if(!parts.toggle.getAttribute('aria-label') || /^menu$/i.test(parts.toggle.getAttribute('aria-label'))){
      parts.toggle.setAttribute('aria-label', 'Toggle navigation menu');
    }
    parts.menu.setAttribute('role', 'navigation');
    parts.menu.setAttribute('aria-label', 'Mobile navigation');
    parts.menu.setAttribute('aria-hidden', 'true');

    parts.menu.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){
        closeMenu();
      });
    });

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape'){
        closeMenu();
        parts.toggle.focus();
      }
    });

    var desktopMedia = window.matchMedia('(min-width: 769px)');
    function handleDesktopChange(event){
      if(event.matches){
        closeMenu();
      }
    }

    if(typeof desktopMedia.addEventListener === 'function'){
      desktopMedia.addEventListener('change', handleDesktopChange);
    } else if(typeof desktopMedia.addListener === 'function'){
      desktopMedia.addListener(handleDesktopChange);
    }
  }

  window.syncSiteNavLanguageButtons = syncLanguageButtons;
  window.closeMM = function(){
    closeMenu();
  };

  window.toggleMM = function(forceState){
    toggleMenu(forceState);
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initMenu);
  } else {
    initMenu();
  }
})();
