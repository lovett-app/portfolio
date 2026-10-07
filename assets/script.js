const {
  projects: rawProjects,
  events: rawEvents,
  filterDescriptions,
  translations,
  schedule: legacySchedule,
  guide,
  pricing,
  settings
} = PORTFOLIO_DATA;

const scheduleByYear = PORTFOLIO_DATA.scheduleByYear || { [Number(settings?.scheduleYear) || new Date().getFullYear()]: legacySchedule };
const schedule = scheduleByYear[Number(settings?.scheduleYear) || new Date().getFullYear()] || legacySchedule;

let projects = rawProjects;
let events = rawEvents;
const isDirectAsset = value => typeof value === "string" && /^(blob:|data:|https?:)/.test(value);
// 저장 직후 서버 반영 전까지는 방금 올린 이미지를 브라우저 메모리에서 보여줍니다.
window.LOVETT_LOCAL_ASSETS = window.LOVETT_LOCAL_ASSETS || {};
const assetPath = (kind, name) => {
  if (isDirectAsset(name)) return name;
  const path = `assets/images/${kind}/${name}.webp`;
  return window.LOVETT_LOCAL_ASSETS[path] || path;
};
window.LOVETT_ASSET = assetPath;
const fullAsset = name => assetPath("full", name);
const thumbAsset = name => assetPath("thumbs", name);

let activeLang = settings?.defaultLanguage || "ko";
let activeFilter = "all";
const grid = document.getElementById("workGrid");
const description = document.getElementById("filterDescription");
const workModal = document.getElementById("workModal");
const modalContent = document.getElementById("modalContent");
const eventModal = document.getElementById("eventModal");
const eventModalContent = document.getElementById("eventModalContent");
const quoteModal = document.getElementById("quoteModal");

function getText(value, lang = activeLang) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value[lang] || value.ko || value.en || "";
  return value || "";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]));
}

function imageFallback(img, message = "이미지를 불러오지 못했습니다.") {
  img.hidden = true;
  const box = document.createElement("div");
  box.className = "media-error";
  box.textContent = message;
  img.parentElement?.appendChild(box);
}

function bindImageErrors(root = document) {
  root.querySelectorAll("img[data-safe-image]").forEach(img => {
    img.addEventListener("error", () => imageFallback(img), { once:true });
  });
}

function projectCover(project, filter) {
  return project.previewCovers?.[filter] || project.previewCovers?.all || project.covers?.[filter] || project.covers?.all || project.images?.[0]?.thumbSrc || project.images?.[0]?.src;
}

function emptyState(title, body) {
  return `<div class="empty-state"><p class="eyebrow">EMPTY</p><h3>${title}</h3><p>${body}</p></div>`;
}

function renderWorks(filter = activeFilter) {
  activeFilter = filter;
  const source = projects.filter(item => item.visible !== false && !item.private).sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const visible = filter === "all" ? source : source.filter(project => project.categories?.includes(filter));
  if (description) description.textContent = filterDescriptions[filter] || "";
  if (!grid) return;

  if (!visible.length) {
    grid.innerHTML = emptyState("표시할 작업물이 없습니다.", "다른 필터를 선택해 주세요.");
    return;
  }

  grid.innerHTML = visible.map(project => {
    const cover = projectCover(project, filter);
    const categoryLabel = filter === "all" ? (project.categories || []).join(" / ").toUpperCase() : filter.toUpperCase();
    const tags = [project.style, project.type].filter(Boolean);
    return `
      <article class="work-card reveal visible" tabindex="0" data-project="${project.id}" aria-label="${getText(project.title)} 상세 보기">
        <div class="work-card-image"><img data-safe-image src="${thumbAsset(cover)}" alt="${getText(project.title)}" loading="lazy"></div>
        <div class="work-card-meta">
          <div><h3>${getText(project.title)}</h3><p>${project.year} · ${categoryLabel}</p></div>
          <div class="work-card-tags">${tags.map(tag => `<span>${tag}</span>`).join("")}</div>
        </div>
      </article>`;
  }).join("");

  grid.querySelectorAll(".work-card").forEach(card => {
    const open = () => openProject(card.dataset.project, true);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
  bindImageErrors(grid);
}

function syncWorkUrl(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("work", id);
  else url.searchParams.delete("work");
  try {
    history.replaceState(null, "", url.href);
  } catch (error) {
    console.warn("URL sync skipped", error);
  }
}

function openProject(id, syncUrl = false) {
  const project = projects.find(item => item.id === id && item.visible !== false && !item.private);
  if (!project) {
    if (modalContent) modalContent.innerHTML = emptyState("작업물을 찾을 수 없습니다.", "삭제되었거나 잘못된 링크입니다.");
    if (workModal && !workModal.open) workModal.showModal();
    return;
  }
  const tags = [...(project.categories || []).map(category => category.toUpperCase()), project.style, project.type, ...(project.extraTags || [])].filter(Boolean);
  const images = project.images || [];
  modalContent.innerHTML = `
    <article class="modal-project">
      <header class="modal-header">
        <p class="eyebrow">${project.year} PROJECT</p>
        <h2>${getText(project.title)}</h2>
        <p>${getText(project.description)}</p>
        <div class="modal-tag-list">${tags.map(tag => `<span>${tag}</span>`).join("")}</div>
      </header>
      <div class="modal-gallery">
        ${images.length ? images.map(image => `<figure><img data-safe-image src="${fullAsset(image.src)}" alt="${getText(image.caption)}" loading="lazy"><figcaption>${getText(image.caption)}</figcaption></figure>`).join("") : emptyState("등록된 이미지가 없습니다.", "이미지가 추가되면 이곳에 표시됩니다.")}
      </div>
    </article>`;
  bindImageErrors(modalContent);
  if (!workModal.open) workModal.showModal();
  document.body.style.overflow = "hidden";
  if (syncUrl) syncWorkUrl(id);
}


function eventStatusFromDate(dateText) {
  const text = String(dateText || "").trim();
  const m = text.match(/(\d{4})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?/);
  if (!m) return "upcoming";
  const year = Number(m[1]), month = Number(m[2]), firstDay = m[3] ? Number(m[3]) : null;
  let endDay;
  if (firstDay == null) {
    endDay = new Date(year, month, 0).getDate();
  } else {
    const range = text.match(/[–~-]\s*(\d{1,2})(?!.*\d)/);
    endDay = range ? Number(range[1]) : firstDay;
  }
  const eventEnd = new Date(year, month - 1, endDay, 23, 59, 59, 999);
  return new Date() > eventEnd ? "done" : "upcoming";
}

function safeExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function openEventInfo(eventId) {
  const event = events.find(item => item.id === eventId && item.visible !== false);
  if (!event || !eventModal || !eventModalContent) return;
  const images = event.images || [];
  const eventStatus = eventStatusFromDate(event.date);
  const statusLabel = eventStatus === "done" ? translations[activeLang].done : translations[activeLang].upcoming;
  const shopUrl = safeExternalUrl(event.mailOrderUrl);
  eventModalContent.innerHTML = `
    <article class="event-modal-inner">
      <header class="event-modal-head">
        <p class="eyebrow">EVENT INFO</p>
        <span class="status ${eventStatus}">${statusLabel}</span>
        <h2>${getText(event.title)}</h2>
        <p class="event-modal-date">${event.date}</p>
        ${event.booth ? `<p class="event-modal-booth">BOOTH · ${event.booth}</p>` : ""}
        ${event.description ? `<p class="event-modal-description">${event.description}</p>` : ""}
      </header>
      <div class="event-modal-gallery">
        ${images.length ? images.map((image,index) => `<figure><img data-safe-image src="${fullAsset(image)}" alt="${getText(event.title)} 행사 인포 ${index+1}" loading="${index===0?'eager':'lazy'}"></figure>`).join("") : `<div class="event-modal-empty"><p class="eyebrow">COMING SOON</p><b>행사 인포 준비 중</b><span>인포 이미지가 등록되면 이곳에서 확인할 수 있습니다.</span></div>`}
      </div>
      ${shopUrl ? `<footer class="event-modal-footer"><a class="event-shop-link" href="${shopUrl}" target="_blank" rel="noopener noreferrer">통판 페이지 바로가기 <span>↗</span></a></footer>` : ""}
    </article>`;
  bindImageErrors(eventModalContent);
  if (!eventModal.open) eventModal.showModal();
  document.body.style.overflow = "hidden";
}

function renderActivities() {
  const activityGrid = document.getElementById("activityGrid");
  if (!activityGrid) return;
  const source = events.filter(item => item.visible !== false).sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (!source.length) {
    activityGrid.innerHTML = emptyState("등록된 행사가 없습니다.", "행사 정보가 추가되면 이곳에 표시됩니다.");
    return;
  }

  activityGrid.innerHTML = source.map(event => {
    const images = event.images || [];
    const eventStatus = eventStatusFromDate(event.date);
    event.status = eventStatus;
    const statusLabel = eventStatus === "done" ? translations[activeLang].done : translations[activeLang].upcoming;
    const title = getText(event.title);
    const dateParts = String(event.date || "").match(/(\d{4})\.?(\d{1,2})?\.?(\d{1,2})?/) || [];
    const bigDate = dateParts[2] ? `${dateParts[2].padStart(2, "0")}${dateParts[3] ? `<small>.${dateParts[3].padStart(2, "0")}</small>` : ""}` : "";
    const poster = images.length
      ? `<img data-safe-image src="${fullAsset(images[0])}" alt="${title} 부스 인포" loading="lazy"><span class="event-poster-count">INFO ${images.length > 1 ? `· ${images.length}` : ""}<b>↗</b></span>`
      : `<div class="event-poster-empty"><span class="event-poster-year">${dateParts[1] || ""}</span><span class="event-poster-day">${bigDate}</span><span class="event-poster-note">${eventStatus === "upcoming" ? translations[activeLang].detailsLater : translations[activeLang].infoLater}</span></div>`;
    return `
      <article class="event-card ${images.length ? "has-info" : "no-info"} ${eventStatus} reveal visible">
        <button class="event-poster" type="button" data-event-open="${event.id}" aria-label="${title} 인포 보기">
          ${poster}
          <span class="status ${eventStatus}">${statusLabel}</span>
        </button>
        <div class="event-meta">
          <p class="event-date">${event.date || ""}</p>
          <h3><button type="button" data-event-open="${event.id}">${title}</button></h3>
          ${event.booth ? `<p class="event-booth">${event.booth}</p>` : ""}
        </div>
      </article>`;
  }).join("");
  activityGrid.querySelectorAll('[data-event-open]').forEach(button => button.addEventListener('click', () => openEventInfo(button.dataset.eventOpen)));
  bindImageErrors(activityGrid);
}

function renderSchedule() {
  const strip = document.getElementById("scheduleMonths");
  const year = document.getElementById("scheduleYear");
  if (!strip) return;
  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth() + 1;
  const months = Array.from({length:12}, (_, i) => {
    const d = new Date(startYear, startMonth - 1 + i, 1);
    return {year:d.getFullYear(), month:d.getMonth()+1};
  });
  const end = months[months.length - 1];
  if (year) year.textContent = `${startYear}.${String(startMonth).padStart(2,"0")} — ${end.year}.${String(end.month).padStart(2,"0")} 작업 일정`;
  const labels = { closed:"×", consult:"△", available:"○" };
  const classes = { closed:"closed-month", consult:"consult-month", available:"available-month" };
  strip.innerHTML = months.map(({year:y, month:m}, index) => {
    const status = scheduleByYear?.[y]?.[m] || "consult";
    const yearPrefix = (index === 0 || m === 1) ? `<small>${y}</small>` : "";
    return `<span class="${classes[status] || classes.consult}">${yearPrefix}<b>${String(m).padStart(2,"0")}</b>${labels[status] || "△"}</span>`;
  }).join("");
}

function renderGuideSummary() {
  const notice = document.getElementById("guideNotice");
  const usageBody = document.getElementById("usageTableBody");
  if (notice) notice.innerHTML = (guide?.notice || []).map((text,index) => `<div class="notice-line"><b>${String(index+1).padStart(2,"0")}</b><span>${text}</span></div>`).join("");
  if (usageBody) usageBody.innerHTML = (guide?.usage || []).map(item => `
    <tr><th>${item.label}${item.note ? `<br><small>${item.note}</small>` : ""}</th><td><span class="${item.streaming ? "allow" : "deny"}">${item.streaming ? "○" : "×"}</span></td><td><span class="${item.commercial ? "allow" : "deny"}">${item.commercial ? "○" : "×"}</span></td></tr>`).join("");
}

function renderPricing() {
  const root = document.getElementById("priceAccordionContent");
  if (!root) return;
  const order = ["ld","sd","costume","background"];
  root.innerHTML = order.map((key,index) => {
    const item = pricing?.[key];
    if (!item) return "";
    let body = "";
    if (item.table) {
      body += `<div class="price-table">
        <div class="price-row heading">${item.table.headers.map((h,i) => i === 0 ? `<span>${h}</span>` : `<b>${h}</b>`).join("")}</div>
        ${item.table.rows.map(row => `<div class="price-row"><span>${row[0]}</span><b>${row[1]}</b><b>${row[2]}</b></div>`).join("")}
      </div>`;
      if (item.extras?.length) body += `<ul class="compact-list">${item.extras.map(text => `<li>${text}</li>`).join("")}</ul>`;
    } else {
      body += `<div class="simple-price-list">${(item.rows || []).map(row => `<p><span>${row[0]}</span><b>${row[1]}</b></p>`).join("")}</div>`;
      if (item.note) body += `<p class="${key === "costume" ? "notice-box" : "panel-sub"}">${item.note}</p>`;
    }
    return `<details ${index === 0 ? "open" : ""}><summary><span>${item.label}</span><small>${item.from}</small></summary><div class="accordion-body">${body}</div></details>`;
  }).join("");
}

function refreshAll() {
  renderWorks(activeFilter);
  renderActivities();
  renderSchedule();
  renderGuideSummary();
  renderPricing();
  applyLanguage(activeLang, false);
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  dialog.close();
  document.body.style.overflow = "";
  if (dialog === workModal) syncWorkUrl(null);
}

document.querySelectorAll(".filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    renderWorks(button.dataset.filter);
  });
});

document.querySelector(".modal-close")?.addEventListener("click", () => closeDialog(workModal));
workModal?.addEventListener("click", event => { if (event.target === workModal) closeDialog(workModal); });
document.querySelector(".event-modal-close")?.addEventListener("click", () => closeDialog(eventModal));
eventModal?.addEventListener("click", event => { if (event.target === eventModal) closeDialog(eventModal); });

document.getElementById("quoteButton")?.addEventListener("click", () => {
  quoteModal.showModal();
  document.body.style.overflow = "hidden";
});
document.querySelector(".quote-close")?.addEventListener("click", () => closeDialog(quoteModal));
quoteModal?.addEventListener("click", event => { if (event.target === quoteModal) closeDialog(quoteModal); });

const validPages = ["home", "works", "activity", "guide"];
function showPage(page, updateHash = true) {
  if (!validPages.includes(page)) page = "home";
  document.querySelectorAll(".page-panel").forEach(panel => {
    const active = panel.dataset.page === page;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".desktop-nav a, .mobile-nav a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${page}`));
  if (updateHash && location.hash !== `#${page}`) history.pushState(null, "", `#${page}`);
  window.scrollTo({ top:0, behavior:"instant" });
  document.querySelectorAll(`#${page} .reveal`).forEach(element => element.classList.add("visible"));
}

const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.classList.toggle("open");
  mobileNav.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll('.desktop-nav a, .mobile-nav a, .brand, .hero-links a[href="#works"]').forEach(link => {
  link.addEventListener("click", event => {
    const page = link.getAttribute("href")?.replace("#", "");
    if (!validPages.includes(page)) return;
    event.preventDefault();
    showPage(page);
    menuToggle?.classList.remove("open");
    mobileNav?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});
window.addEventListener("popstate", () => showPage(location.hash.replace("#", "") || "home", false));

function applyLanguage(lang, rerender = true) {
  activeLang = translations[lang] ? lang : "ko";
  document.documentElement.lang = activeLang === "ja" ? "ja" : activeLang;
  document.querySelectorAll("[data-i18n]").forEach(element => {
    const value = translations[activeLang]?.[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll(".lang-btn").forEach(button => button.classList.toggle("active", button.dataset.lang === activeLang));
  if (rerender) {
    renderWorks(activeFilter);
    renderActivities();
  }
}

document.querySelectorAll(".lang-btn").forEach(button => button.addEventListener("click", () => applyLanguage(button.dataset.lang)));

const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("visible"); }), { threshold:.08 });
document.querySelectorAll(".reveal").forEach(element => observer.observe(element));

if (settings?.heroImage) { const heroImg = document.getElementById("heroImage"); if (heroImg) heroImg.src = fullAsset(settings.heroImage); }
renderWorks();
renderActivities();
renderSchedule();
renderGuideSummary();
renderPricing();
applyLanguage(activeLang);
showPage(location.hash.replace("#", "") || "home", false);

const initialWork = new URLSearchParams(location.search).get("work");
if (initialWork) {
  showPage("works", false);
  openProject(initialWork, false);
}


window.LOVETT_APP = {
  get projects(){ return projects; },
  get events(){ return events; },
  schedule, scheduleByYear, guide, pricing, settings, translations, filterDescriptions, assistantRules: PORTFOLIO_DATA.assistantRules,
  refreshAll, renderWorks, renderActivities, renderSchedule, renderGuideSummary, renderPricing, eventStatusFromDate, openEventInfo,
  setHeroText({line1,line2,line3,description}) {
    if (line1 != null) translations.ko.heroLine1 = line1;
    if (line2 != null) translations.ko.heroLine2 = line2;
    if (line3 != null) translations.ko.heroLine3 = line3;
    if (description != null) translations.ko.heroDescription = description;
    applyLanguage(activeLang);
  },
  setHeroImage(url){ const img = document.getElementById("heroImage"); if (img && url) img.src = fullAsset(url); if (url) settings.heroImage = url; },
  showPage
};
