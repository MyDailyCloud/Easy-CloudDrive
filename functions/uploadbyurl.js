export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('不支持的请求方法', { status: 405 });
  }

  try {
    const password = context.env.ppd;
    const authHeader = context.request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== password) {
      return new Response('授权失败', { status: 403 });
    }

    const { url, savePath = 'download', fileName } = await context.request.json();

    if (!url) {
      return new Response('缺少文件下载地址', { status: 400 });
    }

    const bucket = context.env.fastdriver2;
    const key = `${savePath}/${fileName || 'unknown'}`;

    // 创建多部分上传
    const multipartUpload = await bucket.createMultipartUpload(key);
    const uploadId = multipartUpload.uploadId;

    // 下载文件并上传部分
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('文件下载失败');
    }

    const reader = response.body.getReader();
    const partSize = 10 * 1024 * 1024; // 10MB
    let partNumber = 1;
    let buffer = new Uint8Array(0);
    const parts = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = concatUint8Arrays(buffer, value);

      while (buffer.length >= partSize) {
        const part = buffer.slice(0, partSize);
        buffer = buffer.slice(partSize);

        const uploadedPart = await multipartUpload.uploadPart(partNumber, part);
        parts.push(uploadedPart);
        partNumber++;
      }
    }

    // 上传最后一部分（如果有）
    if (buffer.length > 0) {
      const uploadedPart = await multipartUpload.uploadPart(partNumber, buffer);
      parts.push(uploadedPart);
    }

    // 完成多部分上传
    await multipartUpload.complete(parts);

    return new Response('文件上传成功', { status: 200 });
  } catch (error) {
    console.error('文件上传失败:', error);
    return new Response('文件上传失败', { status: 500 });
  }
}

function concatUint8Arrays(a, b) {
  const c = new Uint8Array(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}
