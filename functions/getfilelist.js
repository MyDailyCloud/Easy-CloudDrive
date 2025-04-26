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

    const url = new URL(context.request.url);
    
    // 获取当前路径
    const path = url.searchParams.get('path') || '';
    
    // 获取分页参数
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10);
    const cursor = url.searchParams.get('cursor');

    // 处理路径，确保正确格式
    const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : '';

    const files = await listFiles(context.env.fastdriver2, prefix, pageSize, cursor);
    return new Response(JSON.stringify(files), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取文件列表失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '获取文件列表失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function listFiles(r2Bucket, prefix = '', pageSize = 50, cursor = null) {
  // 获取指定目录下的所有对象
  const result = await r2Bucket.list({
    prefix: prefix,
    delimiter: '/',
    cursor: cursor,
    limit: pageSize
  });

  // 处理文件和文件夹
  const files = [];
  const folders = new Set();

  // 处理对象（文件）
  for (const object of result.objects) {
    // 忽略文件夹标记文件
    if (object.key.endsWith('/.folder')) continue;
    
    // 获取相对于当前目录的路径
    const relativePath = object.key.substring(prefix.length);
    
    // 忽略子目录中的文件
    if (relativePath.includes('/')) continue;
    
    files.push({
      name: object.key,
      relativeName: relativePath,
      size: object.size,
      uploaded: object.uploaded.toISOString(),
      type: 'file',
      contentType: object.httpMetadata?.contentType || ''
    });
  }

  // 处理公共前缀（文件夹）
  for (const commonPrefix of result.delimitedPrefixes) {
    // 获取文件夹名称（去掉前缀和尾部斜杠）
    const folderName = commonPrefix.substring(prefix.length, commonPrefix.length - 1);
    folders.add(folderName);
  }

  // 将文件夹添加到结果中
  for (const folder of folders) {
    files.push({
      name: `${prefix}${folder}/`,
      relativeName: folder,
      size: 0,
      uploaded: new Date().toISOString(),
      type: 'folder'
    });
  }

  // 排序：文件夹在前，文件在后，按名称字母顺序排序
  files.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.relativeName.localeCompare(b.relativeName);
  });

  return {
    files,
    path: prefix,
    cursor: result.truncated ? result.cursor : null,
    hasMore: result.truncated
  };
}
