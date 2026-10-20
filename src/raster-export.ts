export async function encodeRaster(image: ImageData, format: string, quality: number): Promise<Blob> {
  const source = document.createElement('canvas');
  source.width = image.width; source.height = image.height;
  source.getContext('2d')!.putImageData(image, 0, 0);
  let canvas = source;
  if (format === 'jpg') {
    // Match the original JPEG exporter: composite transparency over white
    // before using the system codec, whose default alpha background is black.
    canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, image.width, image.height);
    context.drawImage(source, 0, 0);
  }
  const type = `image/${format === 'jpg' ? 'jpeg' : format}`;
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('This image format is unavailable.')), type, quality / 100));
  if (blob.type !== type) throw new Error('This image format is unavailable in this system WebView. Choose PNG instead.');
  return blob;
}
