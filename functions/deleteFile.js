export async function onRequest(context) {
  if (context.request.method !== 'DELETE') {
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

    // 获取文件路径
    const url = new URL(context.request.url);
    const path = url.searchParams.get('path');

    if (!path) {
      return new Response('缺少路径参数', { status: 400 });
    }

    const bucket = context.env.fastdriver2;

    // 检查是否是文件夹（以斜杠结尾）
    const isFolder = path.endsWith('/');

    if (isFolder) {
      // 删除文件夹（包括子文件和子文件夹）
      return await deleteFolder(bucket, path);
    } else {
      // 删除单个文件
      const object = await bucket.head(path);
      if (!object) {
        return new Response('文件不存在', { status: 404 });
      }

      await bucket.delete(path);
      return new Response(JSON.stringify({
        success: true,
        message: '文件删除成功'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('删除失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '删除失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function deleteFolder(bucket, folderPath) {
  // 确保路径以斜杠结尾
  const normalizedPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  
  // 获取文件夹内所有对象
  let cursor;
  const objectsToDelete = [];

  do {
    const result = await bucket.list({
      prefix: normalizedPath,
      cursor
    });

    for (const object of result.objects) {
      objectsToDelete.push(object.key);
    }

    cursor = result.truncated ? result.cursor : null;
  } while (cursor);

  // 如果没有对象，确认是否存在文件夹标记
  if (objectsToDelete.length === 0) {
    const folderMarker = await bucket.head(`${normalizedPath}.folder`);
    if (!folderMarker) {
      return new Response('文件夹不存在或为空', { status: 404 });
    }
    // 如果只有文件夹标记，添加到删除列表
    objectsToDelete.push(`${normalizedPath}.folder`);
  }

  // 批量删除所有对象（最多1000个一批）
  const batchSize = 1000;
  for (let i = 0; i < objectsToDelete.length; i += batchSize) {
    const batch = objectsToDelete.slice(i, i + batchSize);
    await Promise.all(batch.map(key => bucket.delete(key)));
  }

  return new Response(JSON.stringify({
    success: true,
    message: '文件夹删除成功',
    deletedCount: objectsToDelete.length
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
} 