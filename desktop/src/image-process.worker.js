let depthPipeline;

async function sourceBitmap(src) {
  const response = await fetch(src);
  return createImageBitmap(await response.blob());
}

async function toPng(canvas) {
  const blob = await canvas.convertToBlob({type:'image/png'});
  return blob.arrayBuffer();
}

async function lineart(src) {
  const bitmap = await sourceBitmap(src);
  const scale = Math.min(1, 3840 / bitmap.width, 3840 / bitmap.height, Math.sqrt(8294400 / (bitmap.width * bitmap.height)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', {willReadFrequently:true});
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  const smooth = new Uint8Array(width * height);
  const edge = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = Math.round(pixels.data[p] * .299 + pixels.data[p + 1] * .587 + pixels.data[p + 2] * .114);
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      smooth[i] = (gray[i-width-1] + 2*gray[i-width] + gray[i-width+1] +
        2*gray[i-1] + 4*gray[i] + 2*gray[i+1] +
        gray[i+width-1] + 2*gray[i+width] + gray[i+width+1]) >> 4;
    }
  }
  const histogram = new Uint32Array(256);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const gx = -smooth[i-width-1] + smooth[i-width+1] - 2*smooth[i-1] + 2*smooth[i+1] - smooth[i+width-1] + smooth[i+width+1];
      const gy = -smooth[i-width-1] - 2*smooth[i-width] - smooth[i-width+1] + smooth[i+width-1] + 2*smooth[i+width] + smooth[i+width+1];
      const strength = Math.min(255, Math.round(Math.hypot(gx, gy)));
      edge[i] = strength;
      histogram[strength]++;
    }
  }
  const total = Math.max(1, (width - 4) * (height - 4));
  let seen = 0, percentile = 0;
  for (let i = 0; i < histogram.length; i++) {
    seen += histogram[i];
    if (seen >= total * .84) {percentile = i; break;}
  }
  const threshold = Math.max(80, Math.min(180, percentile));
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < edge.length; i++, p += 4) {
    const value = edge[i] >= threshold ? 0 : 255;
    output[p] = output[p + 1] = output[p + 2] = value;
    output[p + 3] = 255;
  }
  context.putImageData(new ImageData(output, width, height), 0, 0);
  return toPng(canvas);
}

async function depth(src) {
  if (!depthPipeline) {
    const {pipeline, env} = await import('@huggingface/transformers');
    env.useBrowserCache = true;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = '/models/';
    depthPipeline = pipeline('depth-estimation', 'depth-anything-v2-small', {
      device:'wasm',
      dtype:'q4'
    });
  }
  const estimator = await depthPipeline;
  const result = await estimator(src);
  const image = result.depth;
  if (!image?.data || !image.width || !image.height) throw new Error('深度模型没有返回有效图像');
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  const output = new Uint8ClampedArray(image.width * image.height * 4);
  for (let i = 0, p = 0; i < image.width * image.height; i++, p += 4) {
    const value = image.data[i * image.channels];
    output[p] = output[p + 1] = output[p + 2] = value;
    output[p + 3] = 255;
  }
  context.putImageData(new ImageData(output, image.width, image.height), 0, 0);
  return toPng(canvas);
}

self.onmessage = async ({data}) => {
  const {id, mode, src} = data;
  try {
    const bytes = await (mode === 'lineart' ? lineart(src) : depth(src));
    self.postMessage({id, bytes}, [bytes]);
  } catch (error) {
    self.postMessage({id, error:error?.message || '本地处理失败'});
  }
};
