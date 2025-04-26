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

    const { url, path = '', fileName } = await context.request.json();

    if (!url) {
      return new Response('缺少文件下载地址', { status: 400 });
    }

    if (!fileName) {
      return new Response('缺少文件名', { status: 400 });
    }

    const bucket = context.env.fastdriver2;
    
    // 处理路径，确保格式正确
    const normalizedPath = path ? (path.endsWith('/') ? path : `${path}/`) : '';
    const key = `${normalizedPath}${fileName}`;

    // 创建多部分上传
    const multipartUpload = await bucket.createMultipartUpload(key);
    const uploadId = multipartUpload.uploadId;

    // 下载文件并上传部分
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('文件下载失败');
    }

    // 获取文件类型信息
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

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
    const object = await multipartUpload.complete(parts);

    // 更新文件元数据，包括内容类型
    if (contentType !== 'application/octet-stream') {
      await bucket.put(key, await (await bucket.get(key)).arrayBuffer(), {
        httpMetadata: { contentType }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: '文件上传成功',
      fileName: key,
      size: object.size,
      contentType
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '文件上传失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function concatUint8Arrays(a, b) {
  const c = new Uint8Array(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}
