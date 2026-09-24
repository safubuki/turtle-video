/** 保存一覧で使う画像だけを小さくする。変換に失敗してもプロジェクト保存は続行できる。 */
export async function compactSaveThumbnail(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  if (dataUrl.length <= 100_000) return dataUrl;
  try {
    const image = new window.Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 320 / image.naturalWidth);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}
