(() => {
  const TAGS = [
    ["all", "Все", "All"],
    ["art", "Художественные", "Art"],
    ["ai", "AI", "AI"],
    ["ads", "Реклама", "Commercial"],
    ["event", "События", "Events"],
    ["head", "Говорящая голова", "Talking head"],
    ["podcast", "Подкасты", "Podcasts"],
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
  // Ссылка с тегом (savchenkofilm.github.io/#ai) открывает страницу сразу с этим фильтром.
  const fromHash = () => {
    const key = location.hash.slice(1);
    return TAGS.some(([k]) => k === key) && works.some((w) => w.tags.includes(key)) ? key : "all";
  };
  let current = fromHash();

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

  addEventListener("hashchange", () => {
    if (fromHash() !== current) setFilter(fromHash());
  });

  function setFilter(key) {
    current = current === key ? "all" : key;
    window.gtag?.("event", "filter", { tag: current });
    history.replaceState(null, "", current === "all" ? location.pathname + location.search : "#" + current);
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

  // ---------- лайки ----------
  // Общий счётчик на abacus.jasoncameron.dev, без ограничений: каждый клик = +1.
  const LIKES = "https://abacus.jasoncameron.dev";
  const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.1 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.6 4.2 7.1C19.5 16.4 12 21 12 21z"/></svg>`;
  const fx = document.createElement("div");
  fx.className = "like-fx";
  document.body.append(fx);
  let sending = Promise.resolve();

  function likeButton(w) {
    const b = document.createElement("span");
    b.className = "like";
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.setAttribute("aria-label", "Like");
    b.innerHTML = HEART + `<i></i>`;
    const num = b.querySelector("i");
    let count = 0, shots = 0;
    const show = () => (num.textContent = count || "");
    fetch(`${LIKES}/get/savchenkofilm/like-${w.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.value > count) { count = d.value; show(); } })
      .catch(() => {});
    const like = (e) => {
      e.stopPropagation();
      e.preventDefault();
      count++;
      show();
      b.classList.remove("pop");
      void b.offsetWidth;
      b.classList.add("pop");
      fly(b, shots++);
      // Клики идут по очереди, чтобы частое нажатие не упёрлось в лимит запросов.
      sending = sending.then(() =>
        fetch(`${LIKES}/hit/savchenkofilm/like-${w.id}`).catch(() => {}).then(() => new Promise((r) => setTimeout(r, 120)))
      );
    };
    b.addEventListener("click", like);
    b.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && like(e));
    return b;
  }

  // Сердечко летит по кубической кривой Безье: первое вверх, второе вправо, третье влево, дальше как попало.
  function fly(from, n) {
    const r = from.getBoundingClientRect();
    const x0 = r.left + 13, y0 = r.top + r.height / 2;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const dir = n < 3 ? [0, 1, -1][n] : rnd(-1.2, 1.2);
    const x3 = x0 + dir * rnd(70, 120), y3 = y0 - rnd(110, 170) + Math.abs(dir) * 40;
    const x1 = x0 - dir * rnd(10, 40), y1 = y0 - rnd(40, 70);
    const x2 = x3 + dir * rnd(-10, 30) - rnd(-30, 30), y2 = y3 + rnd(30, 60);
    const h = document.createElement("span");
    h.innerHTML = HEART;
    fx.append(h);
    const dur = rnd(850, 1100), t0 = performance.now(), spin = rnd(-40, 40);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      const s = t < 0.15 ? 0.4 + t / 0.15 * 0.9 : 1.3 - t * 0.4;
      h.style.transform = `translate(${x - 11}px, ${y - 11}px) rotate(${spin * t}deg) scale(${s})`;
      h.style.opacity = t < 0.6 ? 1 : (1 - t) / 0.4;
      t < 1 ? requestAnimationFrame(step) : h.remove();
    };
    requestAnimationFrame(step);
  }

  // ---------- карточки ----------
  cards = works.map((w, i) => {
    const el = document.createElement("button");
    el.className = "card";
    el.type = "button";
    el.innerHTML =
      (w.poster ? `<img src="${w.poster}" alt="" loading="lazy" decoding="async">` : "") + `<div class="cap"></div>`;
    el.onclick = () => openViewer(w);
    el.append(likeButton(w));
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
      cols >= 16
        ? { h: [4, 5, 6, 6, 7], s: [3, 4, 4, 5], v: [3, 3, 4] }[kind]
        : cols >= 12
        ? { h: [3, 4, 4, 5, 6], s: [2, 3, 3, 4], v: [2, 2, 3] }[kind]
        : cols >= 8
        ? { h: [4, 5, 5], s: [3], v: [2, 3] }[kind]
        : { h: [4, 4, 3], s: [2], v: [2] }[kind];
    // "big": true в works.json — карточка на ступень крупнее максимума.
    return w.big ? [Math.max(...list) + 1] : list;
  }

  // В общей выкладке AI-работы держатся справа, остальные — слева и в центре.
  // Правая зона бронируется, только если AI-работа идёт в ближайших карточках, иначе низ пустеет.
  function inZone(w, s, span, cols, aiSoon) {
    if (current !== "all" || cols < 8) return true;
    // "zone": "middle" в works.json — полу-AI работы держатся по центру.
    // "pin": "left" в works.json — карточка всегда у левого края (Щербаков под Флоренским).
    if (w.pin === "left") return s === 0;
    if (w.zone === "middle") return s >= Math.floor(cols * 0.25) && s + span <= Math.ceil(cols * 0.7);
    if (w.tags.includes("ai")) return s >= Math.max(cols / 2, cols - span - 2) || s === cols - span;
    return !aiSoon || s + span <= Math.max(span, Math.ceil(cols * 0.65));
  }

  function layout() {
    const W = field.clientWidth;
    const cols = W >= 1500 ? 16 : W >= 1000 ? 12 : W >= 640 ? 8 : 4;
    const unit = W / cols;
    const gutter = W >= 640 ? 18 : 10;
    const sky = new Array(cols).fill(0);
    const r = rng(hash(current + cols));

    const isAi = (c) => c.w.tags.includes("ai");
    cards.forEach((c, i) => {
      const aiSoon = cards.slice(i + 1, i + 4).some(isAi);
      const on = current === "all" || c.w.tags.includes(current);
      c.el.classList.toggle("out", !on);
      if (!on) {
        stopLoop(c.el);
        return;
      }
      const options = spansFor(c.w, cols);
      const want = Math.min(cols, pick(rng(hash(c.w.id + cols)), options));
      const topsFor = (span) => {
        const t = [];
        for (let s = 0; s + span <= cols; s++)
          if (inZone(c.w, s, span, cols, aiSoon)) t.push([s, Math.max(...sky.slice(s, s + span))]);
        return t;
      };
      // Если карточка поменьше встаёт заметно выше — берём её, чтобы закрыть дыру.
      let span = want;
      let tops = topsFor(want);
      let min = Math.min(...tops.map((t) => t[1]));
      for (let sp = want - 1; sp >= Math.max(2, Math.min(...options) - 1) && !c.w.big; sp--) {
        const t = topsFor(sp);
        const m = Math.min(...t.map((x) => x[1]));
        if (m < min - unit * 0.8) {
          span = sp;
          tops = t;
          min = m;
        }
      }
      const near = tops.filter((t) => t[1] <= min + unit * 0.3);
      // Первый ряд и крупные карточки встают к краю (арт слева, AI справа): так над ними не остаётся дыр.
      let [s, top] =
        min === 0 || c.w.big
          ? near[isAi(c) ? near.length - 1 : 0]
          : pick(r, near);
      // Если рядом остаётся щель, в которую не влезет другая карточка, карточка растягивается на неё.
      let a = s, b = s + span;
      while (a > 0 && sky[a - 1] <= top) a--;
      while (b < cols && sky[b] <= top) b++;
      if (!c.w.big && b - a > span && b - a <= want + 2 && b - a - span < Math.min(...options)) {
        s = a;
        span = b - a;
      }
      const width = span * unit - gutter;
      const height = width * (c.w.h / c.w.w);

      const y = top + (top === 0 ? r() * unit * 0.3 : gutter + r() * unit * 0.25);
      // Сдвиг вправо только если соседняя колонка на этой высоте свободна; крупные не сдвигаются, чтобы не запирать дыру над соседом.
      const room = !c.w.big && s + span < cols && sky[s + span] <= y ? unit * 0.6 : 0;
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
    window.gtag?.("event", "open_video", { video: w.id });
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
