// pdf-export.js
// 롤링페이퍼를 4가지 디자인 템플릿 중 하나로 A4(최대 2페이지) PDF로
// 내보내는 로직입니다. html2canvas + jsPDF (CDN, 전역 로드)를 사용합니다.
//
// 핵심 원칙:
//  1) 카드(포스트잇/카드/편지 항목)는 절대 페이지 경계에서 잘리지 않는다.
//     -> 먼저 실제 레이아웃을 측정해서 "몇 번째 항목까지가 한 페이지에
//        들어가는지"를 계산한 뒤, 그 범위로만 각 페이지를 새로 렌더링한다.
//  2) 페이지는 절대 2장(MAX_PAGES)을 넘지 않는다.
//     -> 항목이 2페이지에 다 안 들어가면, 글자 크기와 카드 크기를 함께
//        줄여가며(스케일) 다시 측정하고, 그래도 안 되면 최소 스케일에서
//        강제로 페이지 수를 맞춘다.
//  3) 페이지 하단에는 항상 여백이 남는다.
//     -> 페이지당 사용 가능한 높이를 계산할 때 여백만큼 미리 빼둔다.

const PAGE_W = 794; // A4 폭 (96dpi 기준 px)
const PAGE_H = 1123; // A4 높이 (96dpi 기준 px)
const MAX_PAGES = 2;
const PAGE_BOTTOM_RESERVE = 70; // 페이지 하단에 항상 남겨둘 여백(px)
const RENDER_SCALE = 2; // html2canvas 해상도 배율
const MIN_SCALE = 0.4; // 카드/글자 크기를 줄일 수 있는 최소 배율
const SCALE_STEP = 0.05;

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ---------------------------------------------------------------
// 템플릿 정의: 카드 한 장(item)을 만드는 함수 + 페이지 제목/컨테이너 정보
// ---------------------------------------------------------------
const TEMPLATE_DEFS = {
  postit: {
    label: "포스트잇 콜라주형",
    pageClass: "rp-postit",
    containerClass: "rp-note-grid",
    buildTitle: (toName) => `${escapeHtml(toName)}에게 💌`,
    buildItem: (entry, i) => {
      // 처음 마음에 들어했던 핑크(hsl(344,100%,92%)) 한 톤을 기준으로
      // 채도/밝기만 살짝씩 바꿔가며 변주를 줍니다.
      const satOptions = [88, 96, 100, 92];
      const lightOptions = [90, 87, 93, 89, 91];
      const sat = satOptions[i % satOptions.length];
      const light = lightOptions[i % lightOptions.length];
      const bg = `hsl(344, ${sat}%, ${light}%)`;
      const rot = ((i % 5) - 2) * 1.4;
      const fromLine = entry.fromName ? `<p class="rp-note-from">- ${escapeHtml(entry.fromName)}</p>` : "";
      return `<div class="rp-note" style="--bg:${bg}; --rot:${rot}deg;">
        <p class="rp-note-content">${escapeHtml(entry.content)}</p>
        ${fromLine}
      </div>`;
    },
  },
  grid: {
    label: "카드 그리드형",
    pageClass: "rp-grid",
    containerClass: "rp-card-grid",
    buildTitle: (toName) => `${escapeHtml(toName)}의 롤링페이퍼`,
    buildItem: (entry) => {
      const fromLine = entry.fromName ? `<p class="rp-card-from">${escapeHtml(entry.fromName)}</p>` : "";
      return `<div class="rp-card">
        <p class="rp-card-content">${escapeHtml(entry.content)}</p>
        ${fromLine}
      </div>`;
    },
  },
  letter: {
    label: "편지지 리스트형",
    pageClass: "rp-letter",
    containerClass: "rp-letter-list",
    buildTitle: (toName) => `To. ${escapeHtml(toName)}`,
    buildItem: (entry) => {
      const fromLine = entry.fromName ? `<p class="rp-letter-from">from. ${escapeHtml(entry.fromName)}</p>` : "";
      return `<div class="rp-letter-item">
        <p class="rp-letter-content">${escapeHtml(entry.content)}</p>
        ${fromLine}
      </div>`;
    },
  },
  pastel: {
    label: "파스텔 톤형",
    pageClass: "rp-pastel",
    containerClass: "rp-pastel-grid",
    buildTitle: (toName) => `${escapeHtml(toName)} 🎀`,
    buildItem: (entry) => {
      const fromLine = entry.fromName ? `<p class="rp-pastel-from">${escapeHtml(entry.fromName)}</p>` : "";
      return `<div class="rp-pastel-card">
        <p class="rp-pastel-content">${escapeHtml(entry.content)}</p>
        ${fromLine}
      </div>`;
    },
  },
};

export const TEMPLATES = Object.fromEntries(
  Object.entries(TEMPLATE_DEFS).map(([key, def]) => [key, { label: def.label }])
);

function buildPageHtml(def, toName, entries, scale) {
  const itemsHtml = entries.map((e, i) => def.buildItem(e, i)).join("");
  return `<div class="rp-page ${def.pageClass}" style="--rp-scale:${scale};">
    <h1 class="rp-title">${def.buildTitle(toName)}</h1>
    <div class="${def.containerClass}">${itemsHtml}</div>
  </div>`;
}

function makeHost() {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${PAGE_W}px`;
  host.style.background = "#ffffff";
  document.body.appendChild(host);
  return host;
}

// 오프스크린에 전체 항목을 한 번 그려보고, 각 카드의 실제 위치/높이와
// "카드 영역이 시작되는 지점까지의 오프셋(제목+패딩)"을 측정합니다.
function measureLayout(def, toName, entries, scale) {
  const host = makeHost();
  host.innerHTML = buildPageHtml(def, toName, entries, scale);
  const page = host.querySelector(".rp-page");
  const container = page.querySelector(`.${def.containerClass}`);

  const pageRect = page.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const containerTopOffset = containerRect.top - pageRect.top;

  const items = Array.from(container.children).map((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
  });

  document.body.removeChild(host);

  const usablePerPage = PAGE_H - containerTopOffset - PAGE_BOTTOM_RESERVE;
  return { items, usablePerPage };
}

// 카드가 페이지 경계에서 잘리지 않도록, 카드 단위로만 페이지를 나눕니다.
function groupItemsIntoPages(items, usablePerPage) {
  if (items.length === 0) return [[0, 0]];
  const pages = [];
  let pageStartIndex = 0;
  let pageBaseTop = items[0].top;
  for (let i = 0; i < items.length; i++) {
    const relBottom = items[i].bottom - pageBaseTop;
    if (relBottom > usablePerPage && i > pageStartIndex) {
      pages.push([pageStartIndex, i]);
      pageStartIndex = i;
      pageBaseTop = items[i].top;
    }
  }
  pages.push([pageStartIndex, items.length]);
  return pages;
}

// 그래도 MAX_PAGES를 넘으면(극단적으로 내용이 많은 경우), 항목을 잃어버리지
// 않으면서 마지막 허용 페이지로 나머지를 모두 합칩니다. (최후의 수단)
function forceMergeToMaxPages(pages, totalItems) {
  if (pages.length <= MAX_PAGES) return pages;
  const merged = pages.slice(0, MAX_PAGES - 1);
  merged.push([pages[MAX_PAGES - 1][0], totalItems]);
  return merged;
}

async function renderPageCanvas(def, toName, pageEntries, scale) {
  const host = makeHost();
  host.innerHTML = buildPageHtml(def, toName, pageEntries, scale);
  const page = host.querySelector(".rp-page");
  page.style.height = `${PAGE_H}px`;
  page.style.boxSizing = "border-box";
  page.style.overflow = "hidden";
  const canvas = await html2canvas(page, {
    scale: RENDER_SCALE,
    backgroundColor: "#ffffff",
    windowWidth: PAGE_W,
    height: PAGE_H,
    windowHeight: PAGE_H,
  });
  document.body.removeChild(host);
  return canvas;
}

// entries -> [canvas, canvas, ...] (최대 MAX_PAGES장, 카드가 잘리지 않음)
async function buildPagesForRecipient(toName, entries, templateKey) {
  const def = TEMPLATE_DEFS[templateKey];

  if (entries.length === 0) {
    return [await renderPageCanvas(def, toName, [], 1)];
  }

  let scale = 1;
  let { items, usablePerPage } = measureLayout(def, toName, entries, scale);
  let groups = groupItemsIntoPages(items, usablePerPage);

  while (groups.length > MAX_PAGES && scale > MIN_SCALE) {
    scale = Math.max(MIN_SCALE, +(scale - SCALE_STEP).toFixed(2));
    ({ items, usablePerPage } = measureLayout(def, toName, entries, scale));
    groups = groupItemsIntoPages(items, usablePerPage);
  }

  groups = forceMergeToMaxPages(groups, entries.length);

  const canvases = [];
  for (const [start, end] of groups) {
    canvases.push(await renderPageCanvas(def, toName, entries.slice(start, end), scale));
  }
  return canvases;
}

export async function exportSingle(toName, entries, templateKey, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H] });
  const canvases = await buildPagesForRecipient(toName, entries, templateKey);
  canvases.forEach((canvas, i) => {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H]);
    doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H);
  });
  doc.save(filename);
}

/**
 * 반 전체를 한 번에, 학생별로 페이지를 이어붙인 하나의 PDF로 내보냅니다.
 * studentsWithEntries: [{ name, entries }]
 */
export async function exportBatch(studentsWithEntries, templateKey, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H] });
  let first = true;
  for (const { name, entries } of studentsWithEntries) {
    if (!entries.length) continue; // 받은 메시지가 없는 학생은 건너뜀
    const canvases = await buildPagesForRecipient(name, entries, templateKey);
    canvases.forEach((canvas) => {
      if (!first) doc.addPage([PAGE_W, PAGE_H]);
      first = false;
      doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H);
    });
  }
  doc.save(filename);
}
