// pdf-export.js
// 롤링페이퍼를 4가지 디자인 템플릿 중 하나로 A4(최대 2페이지) PDF로
// 내보내는 로직입니다. html2canvas + jsPDF (CDN, 전역 로드)를 사용합니다.

const PAGE_W = 794; // A4 폭 (96dpi 기준 px)
const PAGE_H = 1123; // A4 높이 (96dpi 기준 px)
const MAX_PAGES = 2; // 무슨 일이 있어도 이 페이지 수를 넘기지 않음
const PAGE_SAFE_MARGIN = 36; // 각 페이지 하단에 항상 남겨둘 여백(px)
const RENDER_SCALE = 2; // html2canvas 해상도 배율
const MIN_FONT_PX = 6;
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

  // 실제로 글자를 채울 수 있는 높이는 페이지 높이에서 안전 여백을 뺀 만큼입니다.
  const usableHeightPerPage = PAGE_H - PAGE_SAFE_MARGIN;
  const contentMaxHeight = usableHeightPerPage * MAX_PAGES;

  let fontSize = START_FONT_PX;
  while (page.scrollHeight > contentMaxHeight && fontSize > MIN_FONT_PX) {
    fontSize -= 0.5;
    page.style.setProperty("--rp-font-size", `${fontSize}px`);
  }

  const naturalHeight = page.scrollHeight;
  // 최소 폰트로 줄여도 여전히 넘치는 극단적인 경우, 절대로 페이지 수를
  // 늘리지 않고 대신 화면을 세로로 살짝 압축해서 딱 2페이지 안에 맞춥니다.
  const overflowing = naturalHeight > contentMaxHeight;
  const renderHeight = overflowing
    ? naturalHeight
    : Math.ceil(naturalHeight / PAGE_H) * PAGE_H; // 배경을 페이지 끝까지 채우기 위해 정배수로 올림
  page.style.height = `${renderHeight}px`;
  page.style.overflow = "visible";

  const canvas = await html2canvas(page, {
    scale: RENDER_SCALE,
    backgroundColor: "#ffffff",
    windowWidth: PAGE_W,
    height: renderHeight,
    windowHeight: renderHeight,
  });
  document.body.removeChild(host);

  if (!overflowing) return canvas;

  // 세로 방향으로만 압축해서 정확히 MAX_PAGES(및 안전 여백) 안에 들어오게 만듭니다.
  const targetPx = (usableHeightPerPage * MAX_PAGES + PAGE_SAFE_MARGIN) * RENDER_SCALE;
  const squeezed = document.createElement("canvas");
  squeezed.width = canvas.width;
  squeezed.height = targetPx;
  const ctx = squeezed.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, squeezed.width, squeezed.height);
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, squeezed.width, squeezed.height);
  return squeezed;
}

function sliceCanvasIntoPages(canvas) {
  const pxPerPage = PAGE_H * RENDER_SCALE;
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.round(canvas.height / pxPerPage)));
  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pxPerPage;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
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
