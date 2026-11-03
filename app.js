(() => {
  const TAGS = [
    ["all", "Все", "All"],
    ["art", "Художественные", "Art"],
    ["ads", "Реклама", "Commercial"],
    ["event", "События", "Events"],
    ["ai", "AI", "AI"],
    ["head", "Говорящая голова", "Talking head"],
    ["anim", "Анимация", "Animation"],
  ];
  const I18N = {
    ru: {
      name: "Константин <em>Савченко</em>",
      tagline: "Режиссёр, монтажёр, AI-видео",
      title: "Константин Савченко — видео",
      close: "Закрыть",
      filter: "Фильтр по тегам",
    },
    en: {
      name: "Konstantin <em>Savchenko</em>",
      tagline: "Director, editor, AI video",
      title: "Konstantin Savchenko — video",
      close: "Close",
      filter: "Filter by tag",
    },
  };
  const LANG_KEY = "lang";
  let lang;
  try {
    lang = localStorage.getItem(LANG_KEY);
  } catch (e) {}
  if (!I18N[lang]) lang = "en";
  // Поле работы на текущем языке: title_en / client_en, если заданы.
  const txt = (w, key) => (lang === "en" && w[key + "_en"]) || w[key] || "";
  const works = window.WORKS || [];
  let cards = [];
  const vimeoId = (w) => ((w.url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1];
  const field = document.getElementById("field");
  const tagsEl = document.getElementById("tags");
  const canHover = matchMedia("(hover: hover)").matches;
  let current = "all";

  // Детерминированный рандом: одна и та же раскладка при каждой загрузке.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // ---------- теги ----------
  const counts = {};
  works.forEach((w) => w.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  TAGS.forEach(([key]) => {
    const n = key === "all" ? works.length : counts[key] || 0;
    if (!n) return;
    const b = document.createElement("button");
    b.className = "tag";
    b.dataset.tag = key;
    b.setAttribute("aria-pressed", key === current);
    b.dataset.count = n;
    b.onclick = () => setFilter(key);
    tagsEl.append(b);
  });

  function setFilter(key) {
    current = current === key ? "all" : key;
    tagsEl.querySelectorAll(".tag").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tag === current));
    layout();
  }

  // На тач-экранах луп играет, пока карточка в кадре.
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        const c = cards.find((c) => c.el === e.target);
        if (!c) return;
        e.isIntersecting && !c.el.classList.contains("out") ? playLoop(c.el, c.w) : stopLoop(c.el);
      }),
    { threshold: 0.6 }
  );

  // ---------- карточки ----------
  cards = works.map((w, i) => {
    const el = document.createElement("button");
    el.className = "card";
    el.type = "button";
    el.innerHTML =
      (w.poster ? `<img src="${w.poster}" alt="" loading="lazy" decoding="async">` : "") + `<div class="cap"></div>`;
    el.onclick = () => openViewer(w);
    if (w.loop || (canHover && vimeoId(w))) {
      if (canHover) {
        el.addEventListener("mouseenter", () => playLoop(el, w));
        el.addEventListener("mouseleave", () => stopLoop(el));
      } else {
        io.observe(el);
      }
    }
    field.append(el);
    return { el, w };
  });

  function playLoop(el, w) {
    if (!w.loop) {
      // Своего лупа нет — беззвучный фоновый плеер Vimeo.
      if (el.querySelector("iframe")) return;
      const f = document.createElement("iframe");
      f.src = `https://player.vimeo.com/video/${vimeoId(w)}?background=1&muted=1&loop=1&dnt=1`;
      f.allow = "autoplay";
      f.tabIndex = -1;
      f.addEventListener("load", () => setTimeout(() => f.isConnected && el.classList.add("playing"), 700));
      el.insertBefore(f, el.querySelector(".cap"));
      return;
    }
    let v = el.querySelector("video");
    if (!v) {
      v = document.createElement("video");
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: "auto", src: w.loop });
      v.setAttribute("muted", "");
      v.addEventListener("playing", () => el.classList.add("playing"));
      el.insertBefore(v, el.querySelector(".cap"));
    }
    v.play().catch(() => {});
  }
  function stopLoop(el) {
    const v = el.querySelector("video");
    el.classList.remove("playing");
    if (v) v.pause();
    el.querySelector("iframe")?.remove();
  }

  // ---------- язык ----------
  function renderText() {
    const d = I18N[lang];
    document.documentElement.lang = lang;
    document.title = d.title;
    document.getElementById("name").innerHTML = d.name;
    document.getElementById("tagline").textContent = d.tagline;
    document.getElementById("viewer-close").setAttribute("aria-label", d.close);
    tagsEl.setAttribute("aria-label", d.filter);
    tagsEl.querySelectorAll(".tag").forEach((b) => {
      const t = TAGS.find((t) => t[0] === b.dataset.tag);
      b.innerHTML = `${lang === "en" ? t[2] : t[1]}<sup>${b.dataset.count}</sup>`;
    });
    cards.forEach(({ el, w }) => {
      const title = txt(w, "title");
      const client = txt(w, "client");
      el.setAttribute("aria-label", title + (client ? `, ${client}` : ""));
      el.querySelector(".cap").innerHTML = `<b>${title}</b>${client ? `<span>${client}</span>` : ""}`;
    });
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  }
  document.querySelectorAll("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      lang = b.dataset.lang;
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch (e) {}
      renderText();
    })
  );
  renderText();

  // ---------- раскладка «разброс с воздухом» ----------
  function spansFor(w, cols) {
    const r = w.w / w.h;
    const kind = r > 1.25 ? "h" : r < 0.8 ? "v" : "s";
    const list =
      cols >= 12
        ? { h: [3, 4, 4, 5, 6], s: [2, 3, 3, 4], v: [2, 2, 3] }[kind]
        : cols >= 8
        ? { h: [4, 5, 5], s: [3], v: [2, 3] }[kind]
        : { h: [4, 4, 3], s: [2], v: [2] }[kind];
    // "big": true в works.json — карточка на ступень крупнее максимума.
    return w.big ? [Math.max(...list) + 1] : list;
  }

  // В общей выкладке AI-работы держатся справа, остальные — слева и в центре.
  function inZone(w, s, span, cols) {
    if (current !== "all" || cols < 8) return true;
    if (w.tags.includes("ai")) return s >= Math.max(cols / 2, cols - span - 2) || s === cols - span;
    return s + span <= Math.max(span, Math.ceil(cols * 0.65));
  }

  function layout() {
    const W = field.clientWidth;
    const cols = W >= 1000 ? 12 : W >= 640 ? 8 : 4;
    const unit = W / cols;
    const gutter = W >= 640 ? 18 : 10;
    const sky = new Array(cols).fill(0);
    const r = rng(hash(current + cols));

    cards.forEach((c) => {
      const on = current === "all" || c.w.tags.includes(current);
      c.el.classList.toggle("out", !on);
      if (!on) {
        stopLoop(c.el);
        return;
      }
      const span = Math.min(cols, pick(rng(hash(c.w.id + cols)), spansFor(c.w, cols)));
      const width = span * unit - gutter;
      const height = width * (c.w.h / c.w.w);

      const tops = [];
      for (let s = 0; s + span <= cols; s++)
        if (inZone(c.w, s, span, cols)) tops.push([s, Math.max(...sky.slice(s, s + span))]);
      const min = Math.min(...tops.map((t) => t[1]));
      const near = tops.filter((t) => t[1] <= min + unit * 1.4);
      const [s, top] = pick(r, near);

      const y = top + (top === 0 ? r() * unit * 0.5 : gutter + r() * unit * 0.6);
      // Сдвиг вправо только если соседняя колонка на этой высоте свободна.
      const room = s + span < cols && sky[s + span] <= y ? unit * 0.8 : 0;
      const x = s * unit + r() * room;
      const bottom = y + height;
      for (let k = s; k < s + span; k++) sky[k] = bottom;
      // Сдвинутая вправо карточка частично занимает соседнюю колонку.
      if (x + width > (s + span) * unit - gutter && s + span < cols) sky[s + span] = Math.max(sky[s + span], bottom);

      Object.assign(c.el.style, {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${x}px, ${y}px)`,
      });
    });
    field.style.height = `${Math.max(...sky)}px`;
  }

  let resizeT;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layout, 120);
  });
  layout();
  // Анимация переездов только после первой раскладки.
  requestAnimationFrame(() => requestAnimationFrame(() => field.classList.add("ready")));

  // ---------- просмотр ----------
  const viewer = document.getElementById("viewer");
  const stage = document.getElementById("viewer-stage");
  const cap = document.getElementById("viewer-cap");

  function embedFor(w) {
    const u = w.url || "";
    let m;
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
      return `https://player.vimeo.com/video/${m[1]}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;
    if ((m = u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/)))
      return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`;
    if ((m = u.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/)))
      return `https://www.instagram.com/p/${m[1]}/embed`;
    if ((m = u.match(/tiktok\.com\/.*video\/(\d+)/)))
      return `https://www.tiktok.com/embed/v2/${m[1]}`;
    return null;
  }

  function openViewer(w) {
    const src = embedFor(w);
    stage.style.setProperty("--r", w.w / w.h);
    if (src) {
      stage.innerHTML = `<iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${txt(w, "title")}"></iframe>`;
    } else if (w.video) {
      stage.innerHTML = `<video src="${w.video}" controls autoplay playsinline poster="${w.poster || ""}"></video>`;
    } else if (w.url) {
      window.open(w.url, "_blank", "noopener");
      return;
    }
    const client = txt(w, "client");
    cap.innerHTML = `<b>${txt(w, "title")}</b>${client ? ` — ${client}` : ""}`;
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("viewer-close").focus();
  }
  function closeViewer() {
    viewer.hidden = true;
    stage.innerHTML = "";
    document.body.style.overflow = "";
  }
  document.getElementById("viewer-close").onclick = closeViewer;
  viewer.addEventListener("click", (e) => e.target === viewer && closeViewer());
  addEventListener("keydown", (e) => e.key === "Escape" && !viewer.hidden && closeViewer());
})();
