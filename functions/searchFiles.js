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
    
    // 获取搜索关键词
    const query = url.searchParams.get('query');
    
    // 获取其他过滤参数
    const path = url.searchParams.get('path') || '';
    const fileType = url.searchParams.get('fileType') || '';

    if (!query) {
      return new Response('缺少搜索关键词', { status: 400 });
    }

    // 规范化路径
    const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : '';

    // 执行搜索
    const searchResults = await searchFiles(
      context.env.fastdriver2, 
      query, 
      prefix, 
      fileType
    );

    return new Response(JSON.stringify(searchResults), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('搜索文件失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '搜索文件失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function searchFiles(r2Bucket, query, prefix = '', fileType = '') {
  // 获取所有可能匹配的文件
  let cursor;
  const matches = [];
  const queryLower = query.toLowerCase();

  do {
    const result = await r2Bucket.list({
      prefix: prefix,
      cursor
    });

    for (const object of result.objects) {
      // 跳过文件夹标记
      if (object.key.endsWith('/.folder')) continue;

      // 获取文件名(不包含路径)
      const fileName = object.key.split('/').pop();
      
      // 如果文件名包含查询词(不区分大小写)
      if (fileName.toLowerCase().includes(queryLower)) {
        // 如果指定了文件类型，检查文件是否匹配
        if (fileType && object.httpMetadata?.contentType) {
          if (!object.httpMetadata.contentType.startsWith(fileType)) {
            continue;
          }
        }

        matches.push({
          name: object.key,
          fileName,
          path: object.key.substring(0, object.key.lastIndexOf('/') + 1),
          size: object.size,
          uploadTime: object.uploaded.toISOString(),
          type: 'file',
          contentType: object.httpMetadata?.contentType || ''
        });
      }
    }

    cursor = result.truncated ? result.cursor : null;
  } while (cursor);

  // 基于文件名相关性对结果进行排序
  matches.sort((a, b) => {
    // 首先检查文件名是否以查询词开头 (更高的相关性)
    const aStartsWith = a.fileName.toLowerCase().startsWith(queryLower);
    const bStartsWith = b.fileName.toLowerCase().startsWith(queryLower);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    // 其次检查查询词在文件名中的位置 (越靠前越相关)
    const aPosIndex = a.fileName.toLowerCase().indexOf(queryLower);
    const bPosIndex = b.fileName.toLowerCase().indexOf(queryLower);

    if (aPosIndex !== bPosIndex) return aPosIndex - bPosIndex;

    // 最后按字母顺序排序
    return a.fileName.localeCompare(b.fileName);
  });

  return {
    success: true,
    query,
    results: matches,
    matchCount: matches.length
  };
} 