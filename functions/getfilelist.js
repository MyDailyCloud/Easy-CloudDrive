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

    const files = await listFiles(context.env.fastdriver2);
    return new Response(JSON.stringify(files), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response('获取文件列表失败', { status: 500 });
  }
}

async function listFiles(r2Bucket) {
  const files = [];
  let cursor;

  do {
    const result = await r2Bucket.list({ cursor });
    for (const object of result.objects) {
      files.push({
        name: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString()
      });
    }
    cursor = result.cursor;
  } while (cursor);

  return files;
}
