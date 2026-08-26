/* ============================================================
   AMARA — assets/js/app.js
   Renders the menu from assets/data/menu.json, handles ES/EN,
   scroll-spy, and "Arma tu mesa" (the running table tally).
   ============================================================ */

/* ---------- Fotografía ----------
   Este sitio NO usa imágenes generadas por IA. Solo fotografía real de Amara.
   Mientras no la haya, las secciones se ven sin foto — a propósito.

   Para activar una foto:
     1. Guarda el archivo en assets/img/ con uno de estos nombres.
     2. En assets/data/menu.json agrega  "image": "brunch"  al menú o grupo.
   Si el archivo no existe, la sección simplemente no muestra foto. */
const IMAGES = {
  hero:            "assets/img/hero.jpg",
  "trompito":      "assets/img/trompito.jpg",
  "pina-mariscos": "assets/img/pina-mariscos.jpg",
  "chilaquiles":   "assets/img/chilaquiles.jpg",
  "tacos-camaron": "assets/img/tacos-camaron.jpg"
};

const COPY = {
  es: {
    call: "Llamar", eyebrow: "Fresno, California", tagline: "Cocina Mexicana Moderna",
    hours: "Todos los días · 9:00 am – 9:00 pm", hoursLong: "Lunes a domingo<br>9:00 am – 9:00 pm",
    scroll: "El menú", loading: "Cargando el menú…",
    visitKicker: "Te esperamos", visitTitle: "Visítanos",
    lblAddress: "Dirección", lblHours: "Horario", lblPhone: "Teléfono",
    motto: "Gracias por ser parte de nuestra historia.",
    directions: "Cómo llegar",
    colophon: "Precios sujetos a cambio · Menú actualizado 2026",
    splitLabel: "Entre", clear: "Vaciar", share: "Compartir",
    tallyHint: "Estimado antes de impuestos y propina.",
    star: "Más pedido", veg: "Vegetariano",
    table: "Tu mesa", dish: "platillo", dishes: "platillos",
    add: "Agregar", people: "personas",
    shareTitle: "Nuestra mesa en Amara",
    featuredKicker: "Fotografía real de cocina", featuredTitle: "Los Favoritos",
    seeInMenu: "Ver en el menú"
  },
  en: {
    call: "Call", eyebrow: "Fresno, California", tagline: "Modern Mexican Cuisine",
    hours: "Every day · 9:00 am – 9:00 pm", hoursLong: "Monday to Sunday<br>9:00 am – 9:00 pm",
    scroll: "The menu", loading: "Loading the menu…",
    visitKicker: "Come see us", visitTitle: "Visit",
    lblAddress: "Address", lblHours: "Hours", lblPhone: "Phone",
    motto: "Thank you for being part of our story.",
    directions: "Directions",
    colophon: "Prices subject to change · Menu updated 2026",
    splitLabel: "Split", clear: "Clear", share: "Share",
    tallyHint: "Estimate before tax and tip.",
    star: "Most popular", veg: "Vegetarian",
    table: "Your table", dish: "dish", dishes: "dishes",
    add: "Add", people: "people",
    shareTitle: "Our table at Amara",
    featuredKicker: "Real kitchen photography", featuredTitle: "The Favorites",
    seeInMenu: "See in menu"
  }
};

let LANG = localStorage.getItem("amara-lang") || "es";
let DATA = null;
let TABLE = JSON.parse(localStorage.getItem("amara-table") || "{}");
let PEOPLE = Number(localStorage.getItem("amara-people")) || 2;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const t  = (k) => COPY[LANG][k];
const money = (n) => "$" + n.toFixed(n % 1 === 0 ? 0 : 2);

/* ---------- images with graceful fallback ---------- */
function mountImage(el, key, alt = "") {
  const src = IMAGES[key];
  if (!src) return;
  el.alt = alt;
  el.loading = "lazy";
  el.decoding = "async";
  /* No hay foto todavía → se retira el marco completo, sin ícono roto. */
  el.addEventListener("error", () => el.closest(".section-figure")?.remove(), { once: true });
  el.src = src;
}

/* ============================================================
   RENDER
   ============================================================ */
function renderMenu() {
  const root = $("#menuRoot");
  const nav = $("#menuNav");
  root.innerHTML = "";
  nav.innerHTML = "";

  DATA.menus.forEach((menu) => {
    /* nav pill */
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = menu.label[LANG];
    pill.dataset.target = menu.id;
    pill.addEventListener("click", () => {
      document.getElementById(menu.id).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(pill);

    /* section */
    const sec = document.createElement("section");
    sec.className = "menu-section reveal";
    sec.id = menu.id;

    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = `
      <p class="section-kicker">Amara</p>
      <h2 class="section-title">${menu.label[LANG]}</h2>
      ${menu.note ? `<p class="section-note">${menu.note[LANG]}</p>` : ""}`;
    sec.appendChild(head);

    if (menu.image) sec.appendChild(figure(menu.image, menu.label[LANG]));

    menu.groups.forEach((group) => {
      const g = document.createElement("div");
      g.className = "group";

      const gh = document.createElement("div");
      gh.className = "group-head";
      gh.innerHTML = `<h3>${group.label[LANG]}</h3>`;
      g.appendChild(gh);

      if (group.note) {
        const gn = document.createElement("p");
        gn.className = "group-note";
        gn.textContent = group.note[LANG];
        g.appendChild(gn);
      }

      if (group.image) g.appendChild(figure(group.image, group.label[LANG]));

      const list = document.createElement("div");
      list.className = "items";
      group.items.forEach((item, i) => list.appendChild(itemEl(item, `${group.id}-${i}`)));
      g.appendChild(list);

      sec.appendChild(g);
    });

    root.appendChild(sec);
  });

  try { renderFeatured(); } catch (e) { console.error('carrusel:', e); }
  observeReveals();
  observeSections();
  syncTally();
}

/* ============================================================
   CARRUSEL DE FAVORITOS
   ============================================================ */
function renderFeatured() {
  const rail = $("#rail"), dots = $("#railDots");
  if (!rail || !DATA.featured) return;
  rail.innerHTML = ""; dots.innerHTML = "";

  DATA.featured.forEach((f, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("role", "listitem");
    card.innerHTML = `
      <div class="card-media"><img></div>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-name">${f.name[LANG]}</h3>
          <span class="card-price">${money(f.price)}</span>
        </div>
        <p class="card-note">${f.note[LANG]}</p>
      </div>`;

    mountImage($("img", card), f.img, f.name[LANG]);
    $("img", card).loading = i < 2 ? "eager" : "lazy";

    const add = document.createElement("button");
    add.type = "button";
    add.className = "card-add item-add";
    add.dataset.id = f.itemId;
    add.style.opacity = "1";
    add.addEventListener("click", () =>
      addToTable(f.itemId, { name: f.name, price: f.price })
    );
    paintAddBtn(add, f.itemId);
    $(".card-body", card).appendChild(add);

    rail.appendChild(card);
    dots.appendChild(document.createElement("span"));
  });

  wireRail();
}

function wireRail() {
  const rail = $("#rail"), prev = $("#railPrev"), next = $("#railNext");
  const dots = $$("#railDots span");
  const step = () => $(".card", rail)?.getBoundingClientRect().width + 16 || 320;

  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth - 4;
    prev.disabled = rail.scrollLeft <= 4;
    next.disabled = rail.scrollLeft >= max;
    const i = Math.round(rail.scrollLeft / step());
    dots.forEach((d, n) => d.classList.toggle("is-on", n === i));
  };

  prev.onclick = () => rail.scrollBy({ left: -step(), behavior: "smooth" });
  next.onclick = () => rail.scrollBy({ left:  step(), behavior: "smooth" });
  rail.addEventListener("scroll", update, { passive: true });
  rail.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); prev.click(); }
  });
  update();
}

function figure(key, alt) {
  const fig = document.createElement("figure");
  fig.className = "section-figure";
  const img = document.createElement("img");
  mountImage(img, key, alt);
  fig.appendChild(img);
  return fig;
}

function itemEl(item, id) {
  const el = document.createElement("article");
  el.className = "item";

  const tags = [];
  if (item.star) tags.push(`<span class="tag tag-star">★ ${t("star")}</span>`);
  if (item.veg)  tags.push(`<span class="tag tag-veg">${t("veg")}</span>`);

  const addons = (item.addons || [])
    .map((a) => `${a[LANG]} +${money(a.price)}`)
    .join(" · ");

  el.innerHTML = `
    <div class="item-title-row">
      <h4 class="item-name">${item.name[LANG]}</h4>
      ${tags.length ? `<span class="item-tags">${tags.join("")}</span>` : ""}
      <span class="item-lead"></span>
    </div>
    <span class="item-price">${money(item.price)}</span>
    <p class="item-desc">${item.desc ? item.desc[LANG] : ""}</p>
    ${addons ? `<p class="item-addons">${addons}</p>` : ""}
  `;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "item-add";
  btn.dataset.id = id;
  btn.addEventListener("click", () => addToTable(id, item));
  el.appendChild(btn);

  paintAddBtn(btn, id);
  return el;
}

function paintAddBtn(btn, id) {
  const qty = TABLE[id]?.qty || 0;
  btn.classList.toggle("has-qty", qty > 0);
  btn.textContent = qty > 0 ? `${qty} ×  ${t("add")}` : `+  ${t("add")}`;
}

/* ============================================================
   ARMA TU MESA
   ============================================================ */
function addToTable(id, item) {
  if (!TABLE[id]) TABLE[id] = { name: item.name, price: item.price, qty: 0 };
  TABLE[id].qty += 1;
  persistTable();
  syncTally();
}

function setQty(id, delta) {
  if (!TABLE[id]) return;
  TABLE[id].qty += delta;
  if (TABLE[id].qty <= 0) delete TABLE[id];
  persistTable();
  syncTally();
}

function persistTable() {
  localStorage.setItem("amara-table", JSON.stringify(TABLE));
  localStorage.setItem("amara-people", String(PEOPLE));
}

function syncTally() {
  const entries = Object.entries(TABLE);
  const count = entries.reduce((s, [, v]) => s + v.qty, 0);
  const total = entries.reduce((s, [, v]) => s + v.qty * v.price, 0);

  $("#tally").classList.toggle("is-open", count > 0);
  $("#tallyLabel").textContent = `${t("table")} · ${count} ${count === 1 ? t("dish") : t("dishes")}`;
  $("#tallyTotal").textContent = money(total);
  $("#peopleCount").textContent = String(PEOPLE);
  $("#perPerson").textContent = money(PEOPLE > 0 ? total / PEOPLE : total);

  const lines = $("#tallyLines");
  lines.innerHTML = "";
  entries.forEach(([id, v]) => {
    const row = document.createElement("div");
    row.className = "tally-line";
    row.innerHTML = `
      <span class="qty">
        <button type="button" data-dec="${id}" aria-label="−">−</button>
        <span>${v.qty}</span>
        <button type="button" data-inc="${id}" aria-label="+">+</button>
      </span>
      <span class="tally-line-name">${v.name[LANG]}</span>
      <span class="tally-line-price">${money(v.qty * v.price)}</span>`;
    lines.appendChild(row);
  });

  $$("[data-dec]", lines).forEach((b) => b.addEventListener("click", () => setQty(b.dataset.dec, -1)));
  $$("[data-inc]", lines).forEach((b) => b.addEventListener("click", () => setQty(b.dataset.inc, 1)));
  $$(".item-add").forEach((b) => paintAddBtn(b, b.dataset.id));
}

function shareTable() {
  const entries = Object.entries(TABLE);
  if (!entries.length) return;
  const total = entries.reduce((s, [, v]) => s + v.qty * v.price, 0);
  const body = [
    t("shareTitle"),
    "",
    ...entries.map(([, v]) => `${v.qty} × ${v.name[LANG]} — ${money(v.qty * v.price)}`),
    "",
    `Total: ${money(total)} · ${PEOPLE} ${t("people")} → ${money(total / PEOPLE)}`,
    "",
    "Amara · 3874 N Blackstone Ave, Fresno · (559) 293-3714"
  ].join("\n");

  if (navigator.share) {
    navigator.share({ title: t("shareTitle"), text: body }).catch(() => {});
  } else {
    navigator.clipboard.writeText(body).then(() => {
      const btn = $("#tallyShare");
      const was = btn.textContent;
      btn.textContent = LANG === "es" ? "Copiado" : "Copied";
      setTimeout(() => (btn.textContent = was), 1800);
    });
  }
}

/* ============================================================
   LANGUAGE
   ============================================================ */
function applyLang() {
  document.documentElement.lang = LANG;
  $$("[data-i18n]").forEach((el) => {
    const v = COPY[LANG][el.dataset.i18n];
    if (v !== undefined) el.innerHTML = v;
  });
  $$(".lang-toggle button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === LANG))
  );
  if (DATA) renderMenu();
}

/* ============================================================
   SCROLL BEHAVIOUR
   ============================================================ */
function observeReveals() {
  const io = new IntersectionObserver(
    (rows) => rows.forEach((r) => r.isIntersecting && (r.target.classList.add("is-in"), io.unobserve(r.target))),
    { rootMargin: "-40px 0px -10% 0px" }
  );
  $$(".reveal").forEach((el) => io.observe(el));
}

function observeSections() {
  const pills = $$("#menuNav button");
  const io = new IntersectionObserver(
    (rows) => {
      rows.forEach((r) => {
        if (!r.isIntersecting) return;
        pills.forEach((p) => p.classList.toggle("is-active", p.dataset.target === r.target.id));
      });
    },
    { rootMargin: "-30% 0px -60% 0px" }
  );
  $$(".menu-section").forEach((s) => io.observe(s));
}

/* ============================================================
   BOOT
   ============================================================ */
(async function init() {
  /* hero image fallback */
  const hero = $(".hero-media img");
  if (hero) {
    hero.addEventListener("error", function onErr() {
      hero.removeEventListener("error", onErr);
      hero.src = hero.dataset.fallback;
    });
  }

  /* header shadow on scroll */
  const header = $("#siteHeader");
  const onScroll = () => header.classList.toggle("is-stuck", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* language */
  $$(".lang-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      LANG = b.dataset.lang;
      localStorage.setItem("amara-lang", LANG);
      applyLang();
    })
  );

  /* tally controls */
  $("#tallyBar").addEventListener("click", () => {
    const open = $("#tally").classList.toggle("is-expanded");
    $("#tallyBar").setAttribute("aria-expanded", String(open));
  });
  $("#tallyClear").addEventListener("click", () => { TABLE = {}; persistTable(); syncTally(); });
  $("#tallyShare").addEventListener("click", shareTable);
  $("#peopleMinus").addEventListener("click", () => { PEOPLE = Math.max(1, PEOPLE - 1); persistTable(); syncTally(); });
  $("#peoplePlus").addEventListener("click", () => { PEOPLE = Math.min(20, PEOPLE + 1); persistTable(); syncTally(); });

  /* data */
  try {
    const v = window.ASSET_V ? "?v=" + window.ASSET_V : "";
    const res = await fetch("assets/data/menu.json" + v);
    DATA = await res.json();
    applyLang();
  } catch (err) {
    $("#menuRoot").innerHTML =
      `<p style="padding:4rem 0;text-align:center;color:var(--hueso-d)">
         No se pudo cargar el menú. Recarga la página.<br>
         <span style="font-size:.85rem">Menu unavailable. Please reload.</span>
       </p>`;
    console.error(err);
  }
})();
