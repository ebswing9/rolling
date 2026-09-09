// pdf-export.js
// 롤링페이퍼를 4가지 디자인 템플릿 중 하나로 A4(최대 2페이지) PDF로
// 내보내는 로직입니다. html2canvas + jsPDF (CDN, 전역 로드)를 사용합니다.

const PAGE_W = 794; // A4 폭 (96dpi 기준 px)
const PAGE_H = 1123; // A4 높이 (96dpi 기준 px)
const MAX_PAGES = 2;
const RENDER_SCALE = 2; // html2canvas 해상도 배율
const MIN_FONT_PX = 7;
const START_FONT_PX = 16;

// ---------------------------------------------------------------
// 템플릿별 HTML 문자열 생성
//   entries: [{ fromName: string|null, content: string }]
//   fromName이 null이면 "익명"으로 표시
// ---------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildPostit(toName, entries) {
  // 처음 마음에 들어했던 핑크(#FFE1EC, hsl(344, 100%, 92%)) 한 톤을 기준으로
  // 채도(85~100%)와 밝기(87~94%)만 살짝씩 바꿔가며 변주를 줍니다.
  const baseHue = 344;
  const satOptions = [88, 96, 100, 92];
  const lightOptions = [90, 87, 93, 89, 91];
  const notes = entries
    .map((e, i) => {
      const rot = ((i % 5) - 2) * 1.4; // -2.8 ~ 2.8도
      const sat = satOptions[i % satOptions.length];
      const light = lightOptions[i % lightOptions.length];
      const bg = `hsl(${baseHue}, ${sat}%, ${light}%)`;
      const fromLine = e.fromName ? `<p class="rp-note-from">- ${escapeHtml(e.fromName)}</p>` : "";
      return `<div class="rp-note" style="--bg:${bg}; --rot:${rot}deg;">
        <p class="rp-note-content">${escapeHtml(e.content)}</p>
        ${fromLine}
      </div>`;
    })
    .join("");
  return `<div class="rp-page rp-postit">
    <h1 class="rp-title">${escapeHtml(toName)}에게 💌</h1>
    <div class="rp-note-grid">${notes}</div>
  </div>`;
}

function buildGrid(toName, entries) {
  const cards = entries
    .map((e) => {
      const fromLine = e.fromName ? `<p class="rp-card-from">${escapeHtml(e.fromName)}</p>` : "";
      return `<div class="rp-card">
        <p class="rp-card-content">${escapeHtml(e.content)}</p>
        ${fromLine}
      </div>`;
    })
    .join("");
  return `<div class="rp-page rp-grid">
    <h1 class="rp-title">${escapeHtml(toName)}의 롤링페이퍼</h1>
    <div class="rp-card-grid">${cards}</div>
  </div>`;
}

function buildLetter(toName, entries) {
  const items = entries
    .map((e) => {
      const fromLine = e.fromName ? `<p class="rp-letter-from">from. ${escapeHtml(e.fromName)}</p>` : "";
      return `<div class="rp-letter-item">
        <p class="rp-letter-content">${escapeHtml(e.content)}</p>
        ${fromLine}
      </div>`;
    })
    .join("");
  return `<div class="rp-page rp-letter">
    <h1 class="rp-title">To. ${escapeHtml(toName)}</h1>
    <div class="rp-letter-list">${items}</div>
  </div>`;
}

function buildPastel(toName, entries) {
  const cards = entries
    .map((e) => {
      const fromLine = e.fromName ? `<p class="rp-pastel-from">${escapeHtml(e.fromName)}</p>` : "";
      return `<div class="rp-pastel-card">
        <p class="rp-pastel-content">${escapeHtml(e.content)}</p>
        ${fromLine}
      </div>`;
    })
    .join("");
  return `<div class="rp-page rp-pastel">
    <h1 class="rp-title">${escapeHtml(toName)} 🎀</h1>
    <div class="rp-pastel-grid">${cards}</div>
  </div>`;
}

export const TEMPLATES = {
  postit: { label: "포스트잇 콜라주형", build: buildPostit },
  grid: { label: "카드 그리드형", build: buildGrid },
  letter: { label: "편지지 리스트형", build: buildLetter },
  pastel: { label: "파스텔 톤형", build: buildPastel },
};

// ---------------------------------------------------------------
// 오프스크린 렌더 + 폰트 자동 축소 + 캔버스 변환
// ---------------------------------------------------------------
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

async function renderToCanvas(html) {
  const host = makeHost();
  host.innerHTML = html;
  const page = host.querySelector(".rp-page");
  page.style.setProperty("--rp-font-size", `${START_FONT_PX}px`);
  page.style.boxSizing = "border-box";

  let fontSize = START_FONT_PX;
  const maxHeight = PAGE_H * MAX_PAGES;
  // 0.5px씩 줄여가며 2페이지 높이 안에 들어올 때까지 반복
  while (page.scrollHeight > maxHeight && fontSize > MIN_FONT_PX) {
    fontSize -= 0.5;
    page.style.setProperty("--rp-font-size", `${fontSize}px`);
  }

  // 실제 내용 높이만큼만 렌더링하면, 배경색/그라데이션이 내용 끝에서
  // 뚝 끊기고 그 아래는 PDF의 기본 흰 배경이 드러나 보입니다.
  // 그래서 항상 A4 페이지 높이의 정배수로 컨테이너 높이를 강제로 늘려서
  // 템플릿 배경이 페이지 끝까지 꽉 채워지도록 만듭니다.
  const neededPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(page.scrollHeight / PAGE_H)));
  page.style.height = `${neededPages * PAGE_H}px`;
  page.style.overflow = "hidden";

  const canvas = await html2canvas(page, {
    scale: RENDER_SCALE,
    backgroundColor: "#ffffff",
    windowWidth: PAGE_W,
    height: neededPages * PAGE_H,
  });
  document.body.removeChild(host);
  return canvas;
}

function sliceCanvasIntoPages(canvas) {
  const pxPerPage = PAGE_H * RENDER_SCALE;
  const totalPages = Math.max(1, Math.round(canvas.height / pxPerPage));
  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pxPerPage;
    const ctx = pageCanvas.getContext("2d");
    ctx.drawImage(
      canvas,
      0,
      i * pxPerPage,
      canvas.width,
      pxPerPage,
      0,
      0,
      canvas.width,
      pxPerPage
    );
    pages.push(pageCanvas);
  }
  return pages;
}

/**
 * 학생 한 명의 롤링페이퍼를 PDF로 만들어 다운로드합니다.
 */
export async function exportSingle(toName, entries, templateKey, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H] });
  const html = TEMPLATES[templateKey].build(toName, entries);
  const canvas = await renderToCanvas(html);
  const pages = sliceCanvasIntoPages(canvas);
  pages.forEach((pageCanvas, i) => {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H]);
    doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H);
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
    const html = TEMPLATES[templateKey].build(name, entries);
    const canvas = await renderToCanvas(html);
    const pages = sliceCanvasIntoPages(canvas);
    pages.forEach((pageCanvas) => {
      if (!first) doc.addPage([PAGE_W, PAGE_H]);
      first = false;
      doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H);
    });
  }
  doc.save(filename);
}
