window.LOVETT_IMAGE_UTILS = (() => {
  async function fileToSource(file) {
    if (!file || !file.type?.startsWith("image/")) throw new Error("지원되지 않는 이미지 파일입니다.");
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        console.warn("createImageBitmap fallback", error);
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        image.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function normalizeAssetKey(url) {
    const raw = String(url || "");
    if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
    try {
      const parsed = new URL(raw, location.href);
      const marker = "/assets/images/";
      const idx = parsed.pathname.lastIndexOf(marker);
      if (idx >= 0) return parsed.pathname.slice(idx + 1);
    } catch (_) {}
    return raw.replace(/^\.\//, "").replace(/^\//, "");
  }

  async function urlToSource(url) {
    const raw = String(url || "");
    const key = normalizeAssetKey(raw);
    // index.html을 파일로 직접 열어도 기존 작품을 canvas에서 다시 자를 수 있도록
    // 번들 이미지의 data URL 사본을 관리자 편집 시에만 사용합니다.
    const embedded = window.LOVETT_EMBEDDED_IMAGES?.[key];
    const sourceUrl = (location.protocol === "file:" && embedded) ? embedded : raw;
    const image = new Image();
    image.decoding = "async";
    if (/^https?:/i.test(sourceUrl)) image.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      image.src = sourceUrl;
    });
    return image;
  }

  function canvasToBlob(canvas, type = "image/webp", quality = .86) {
    return new Promise((resolve, reject) => {
      if (!canvas?.toBlob) return reject(new Error("이 브라우저는 이미지 내보내기를 지원하지 않습니다."));
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("WebP 변환에 실패했습니다."));
        resolve(blob);
      }, type, quality);
    });
  }

  async function makeResizedWebP(source, { maxEdge = 2800, quality = .88 } = {}) {
    const ratio = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * ratio));
    canvas.height = Math.max(1, Math.round(source.height * ratio));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    return { blob, width: canvas.width, height: canvas.height };
  }

  async function makeCanvasWebP(canvas, { quality = .84 } = {}) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    return { blob, width: canvas.width, height: canvas.height };
  }

  function safeBaseName(name = "image") {
    return name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]+/g, "-") || "image";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { fileToSource, urlToSource, canvasToBlob, makeResizedWebP, makeCanvasWebP, safeBaseName, downloadBlob };
})();
