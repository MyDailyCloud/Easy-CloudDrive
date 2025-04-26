export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('不支持的请求方法', { status: 405 });
  }

  try {
    // 从环境变量中获取密码
    const password = context.env.ppd;

    // 获取请求头中的 Authorization
    const authHeader = context.request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('未提供有效的授权令牌', { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // 比较令牌与密码
    if (token !== password) {
      return new Response('授权失败', { status: 403 });
    }

    // 获取文件名
    const url = new URL(context.request.url);
    const fileName = url.searchParams.get('file');

    if (!fileName) {
      return new Response('缺少文件名参数', { status: 400 });
    }

    const bucket = context.env.fastdriver2;

    // 检查文件是否存在
    const object = await bucket.head(fileName);
    if (object === null) {
      return new Response('文件不存在', { status: 404 });
    }

    // 获取文件内容
    const file = await bucket.get(fileName);
    if (file === null) {
      return new Response('获取文件失败', { status: 500 });
    }

    // 获取文件类型
    const contentType = file.httpMetadata?.contentType || '';

    // 判断文件是否可预览
    const isImage = contentType.startsWith('image/');
    const isPdf = contentType === 'application/pdf';
    const isText = contentType.startsWith('text/') || 
                  contentType === 'application/json' || 
                  contentType === 'application/xml';
    const isVideo = contentType.startsWith('video/');
    const isAudio = contentType.startsWith('audio/');

    if (!(isImage || isPdf || isText || isVideo || isAudio)) {
      return new Response(JSON.stringify({
        success: false,
        message: '此文件类型不支持预览',
        contentType
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 如果是文本文件，限制大小
    if (isText && object.size > 1024 * 1024) { // 1MB限制
      // 只获取前100KB
      const partial = await file.slice(0, 102400).arrayBuffer();
      return new Response(partial, {
        headers: {
          'Content-Type': contentType,
          'X-Partial-Content': 'true',
          'Content-Disposition': `inline; filename="${fileName}"`
        }
      });
    }

    // 对于图片和其他可预览文件，返回完整内容
    const fileData = await file.arrayBuffer();
    return new Response(fileData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`
      }
    });
  } catch (error) {
    console.error('文件预览失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '文件预览失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 